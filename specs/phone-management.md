# Phone Number Management — Architecture Spec

> **Status:** Authoritative — all new code must follow this spec
> **Last updated:** 2026-04-05
> **Affects:** BE (`users` table, `participants` table), chatbot (`POST /api/internal/auth/identify`), FE (profile page)

---

## 1. Canonical Rule

> **`users.phone` is the single source of truth for a user's phone number.**
> **`participants.contact_phone` for registered users always mirrors `users.phone`.**

There is one canonical phone per user: the `phone` column on the `users` table. Every registered participant slot (`user_id IS NOT NULL`) must have a `contact_phone` that matches the user's `users.phone`.

`participants.contact_phone` for **unregistered** slots (`user_id IS NULL`) is whatever the owner entered. Once a user claims that slot, the phone is overwritten with their canonical `users.phone` (if set). This ensures WhatsApp notifications always go to the user's registered number — regardless of what the owner typed when creating the invite.

---

## 2. The Two Phone Columns — What They Mean

| Column | Table | What it means | Who sets it | Used for |
|--------|-------|---------------|-------------|----------|
| `users.phone` | `users` | The user's own phone — their identity | The user themselves (explicitly), or bootstrapped from flows where they provided their own number | Chatbot identity resolution (`POST /api/internal/auth/identify`) |
| `participants.contact_phone` | `participants` | Per-plan contact phone for this participant slot | The plan owner (when inviting), or the user (when creating a plan or submitting a join request) | WhatsApp notifications (send-list, invitations), invite flow |

---

## 3. All Phone Storage Locations

There are exactly **5 places** phone numbers are stored in the system. Two are live (must stay in sync for registered users), three are historical (immutable by design).

| Location | Type | Registered users | Guests | Stays in sync? |
|----------|------|-----------------|--------|----------------|
| `users.phone` | **Live / canonical** | Yes — identity | No | N/A — source of truth |
| `participants.contact_phone` | **Live / derived** | Yes — per-plan WhatsApp delivery | Yes | Synced when user updates their profile phone |
| `participant_join_requests.contact_phone` | Historical snapshot | Yes — phone at time of request submission | No | No — immutable once created |
| `whatsapp_notifications.recipient_phone` | Audit log | Yes — phone used at time of send | Yes | No — immutable, records what was actually sent |
| `guest_profiles.phone` | Live (guests only) | No | Yes | Guest-managed separately, unrelated to registered user identity |

**Key point:** For a registered user there are only **two live places** — `users.phone` (canonical) and `participants.contact_phone` (derived). The other three are historical records and must never be updated after creation.

---

## 4. Chatbot Identity Resolution

### How it works

The chatbot endpoint (`POST /api/internal/auth/identify`) receives a WhatsApp phone number and resolves it to a Chillist user. The BE implementation (`resolveUserByPhone` in `src/services/internal-auth.service.ts`) queries **`users.phone`**:

```sql
SELECT user_id FROM users
WHERE phone = $1   -- normalized E.164
LIMIT 1
```

This is an O(1) indexed lookup (`users_phone_idx`).

### This query is architecturally correct

The query targets `users.phone` — not `participants.contact_phone`. This is by design:

- A user can have many participant rows across many plans. There is no reliable way to pick the "right" one.
- `participants.contact_phone` is often entered by the plan owner, who may have an outdated or incorrect number.
- `users.phone` is the number the user themselves confirmed — via their profile page, plan creation, or join request.

### The bug — wrong side

The bug is **not** in the query. The query is correct. The bug is on the **write side**: the flows that capture a user's own phone (plan creation, join requests) never write to `users.phone`. Result: `users.phone = null` for almost every user → the query returns nothing → chatbot sends a sign-up link to every registered user.

### What happens when `users.phone` is null

The user is not identified (404). The chatbot responds with a sign-up or profile-setup link. This is an acceptable long-term state only for users who have never gone through any bootstrapping flow. Once they set their phone (via profile page, or after the bootstrapping fix is deployed), they become identifiable.

---

## 5. All Phone Entry Points — Annotated

### 5.1 Flows that write to `users.phone` ✅

#### `PATCH /auth/profile` — primary canonical setter

The explicit, user-initiated way to set or update their phone. **Always overwrites** regardless of current value.

```
FE profile page → PATCH /auth/profile { phone: "+972501234567" }
  → BE normalizes to E.164
  → BE upserts users.phone (always overwrites — this is the authoritative action)
  → BE syncs new phone to ALL participants.contact_phone WHERE user_id = this user
     (so WhatsApp notifications continue going to the right number)
  → Returns updated preferences including phone
```

**Rule:** Always write here. Always sync to participant rows so notification delivery stays correct.

---

#### `POST /auth/sync-profile` — Supabase metadata sync

When the user's phone is stored in Supabase `user_metadata.phone`, this sync propagates it to `users.phone`.

```
FE calls POST /auth/sync-profile (e.g. after sign-up / OAuth)
  → BE fetches user_metadata from Supabase Admin API
  → If user_metadata.phone exists:
      → BE upserts users.phone from Supabase phone (overwrites)
  → BE syncs all identity fields (including phone) to participants via syncAllParticipantsForUser
```

---

#### `POST /plans` — plan creation bootstrap *(to be added)*

When a user creates a plan, they provide their own phone as `owner.contactPhone`. This is the most common first interaction for new users.

```
User creates plan → POST /plans { owner: { contactPhone: "+972..." }, ... }
  → BE creates plan + owner participant with contactPhone
  → BE upserts users.phone = owner.contactPhone
     ONLY IF users.phone IS NULL — never overwrite an explicit profile phone
```

**Rule:** Only write if null. Respect any value the user explicitly set via `PATCH /auth/profile`.

---

#### `POST /plans/:planId/join-requests` — join request bootstrap *(to be added)*

When a user submits a join request, they provide their own phone. This is often the first time their number reaches the system.

```
User submits join request → POST /plans/:planId/join-requests { contactPhone: "+972...", ... }
  → BE creates join request record
  → BE upserts users.phone = contactPhone
     ONLY IF users.phone IS NULL
```

**Rule:** Same as plan creation — only if null.

---

### 5.2 Flows that write to `participants.contact_phone` only — intentionally do NOT touch `users.phone` ❌

#### `POST /plans/:planId/participants` — owner inviting someone

The owner enters the invitee's phone. Writing to the invitee's `users.phone` from here would corrupt their canonical number — the owner may have an outdated or wrong number.

```
Owner invites → POST /plans/:planId/participants { contactPhone: "+972...", ... }
  → Writes to participants.contact_phone ONLY
  → Does NOT touch that person's users.phone
```

---

#### `POST /plans/:planId/claim/:inviteToken` — user claims an invite

The `participants.contact_phone` on this row was entered by the owner, not the user. Must not be trusted as the user's canonical phone.

```
User claims invite → POST /plans/:planId/claim/:inviteToken (JWT)
  → Links participants.user_id = JWT sub
  → Syncs JWT identity fields (name, email, avatar) → participants
  → Does NOT write to users.phone from participants.contact_phone
  → Does NOT overwrite participants.contact_phone with users.phone
```

**Two-phone scenario:** A user may have multiple phones. The owner may have invited them using a second or work number (`+972B`), while the user's canonical phone is `+972A`. After claim:
- `users.phone = "+972A"` — chatbot identifies user by this number ✅
- `participants.contact_phone = "+972B"` — WhatsApp notifications for this plan go here (intentional — owner chose this number for this plan)

These two numbers deliberately can differ. The per-plan contact phone is not forced to match the canonical phone. If the user wants notifications on their canonical number, they or the owner must update the participant record via `PATCH /participants/:participantId { contactPhone: "+972A" }`.

**Important for chatbot:** A user who only ever claims an invite (never creates a plan or submits a join request, never visits the profile page) will have `users.phone = null`. They can set it at any time via `PATCH /auth/profile`.

---

#### `PATCH /plans/:planId/join-requests/:requestId` (approval)

The phone was already written to `users.phone` when the join request was submitted. No additional write needed here.

```
Owner approves → PATCH .../join-requests/:requestId { status: "approved" }
  → Creates participant with userId + contactPhone from join request data
  → users.phone was already bootstrapped at request submission time
  → No additional write to users.phone
```

---

#### `PATCH /participants/:participantId` — participant update

Both owner and self can update `participants.contact_phone`. Neither should auto-sync to `users.phone`:

- **Owner updating:** May be correcting a different person's per-plan contact info.
- **User updating their own participant:** This is per-plan contact data only. To change their canonical phone → `PATCH /auth/profile`.

```
PATCH /participants/:participantId { contactPhone: "+972..." }
  → Writes to participants.contact_phone ONLY
  → Never writes to users.phone
```

---

## 6. Complete Flow Map

```
User action                           users.phone              participants.contact_phone
────────────────────────────────────────────────────────────────────────────────────────────────────
PATCH /auth/profile (phone)         → SET always (canonical) → SYNC new phone to ALL user's participant rows
POST /auth/sync-profile             → SET if Supabase has   → SYNC via syncAllParticipantsForUser
POST /plans (owner.contactPhone)    → SET if null           → SET owner participant row only
POST /plans/:id/join-requests       → SET if null           → SET join request record only
POST /plans/:id/participants        → NEVER                 → SET invitee's participant row only
POST /plans/:id/claim/:token        → NEVER                 → SYNC JWT fields (name/email/avatar, not phone)
PATCH /participants/:id (by owner)  → NEVER                 → SET that participant row only
PATCH /participants/:id (by self)   → NEVER                 → SET that participant row only
PATCH /.../join-requests (approve)  → (already set at submit)→ SET new participant row from join request
```

---

## 7. Scenario Walkthrough

### User creates a plan, gets invited to another plan, then changes their phone

**Step 1 — User creates a plan**

```
POST /plans { owner: { contactPhone: "+972501234567" } }

Writes:
  participants.contact_phone = "+972501234567"  (owner participant row)
  users.phone = "+972501234567"                 (bootstrapped — was null)

participant_join_requests  → not touched
whatsapp_notifications     → not touched (yet)
```

**Step 2 — Another owner invites the user to their plan**

```
POST /plans/:id/participants { contactPhone: "+972501234567" }

Writes:
  participants.contact_phone = "+972501234567"  (new row, user_id = null)

users.phone                → NOT touched (owner entering someone else's phone)
participant_join_requests  → not touched
```

**Step 3 — User claims the invite**

```
POST /plans/:id/claim/:inviteToken  (JWT)

Writes:
  participants.user_id = userId
  participants.inviteStatus = accepted
  participants.name / email / avatar  (synced from JWT)

users.phone                → NOT touched (phone was entered by owner — cannot trust)
participants.contact_phone → NOT touched by claim
```

**Step 4 — User changes their phone number**

```
PATCH /auth/profile { phone: "+972999999999" }

Writes:
  users.phone = "+972999999999"              (always overwrites — canonical)
  participants.contact_phone = "+972999999999"
    WHERE user_id = this user               (ALL plans: owner plan + invited plan)

participant_join_requests  → NOT touched (historical snapshot — immutable)
whatsapp_notifications     → NOT touched (audit log — immutable)
guest_profiles             → NOT touched (registered user, not a guest)
```

After Step 4:
- Chatbot `POST /api/internal/auth/identify` finds user by "+972999999999" via `users.phone` ✅
- WhatsApp send-list and invite notifications go to "+972999999999" ✅
- Old join request records show "+972501234567" — correct, they are historical snapshots ✅
- Old WhatsApp notification audit logs show "+972501234567" — correct, they record what was sent ✅

### Two-phone edge case: invited with a different number

If the owner invited the user using a **different** phone from their canonical one:

```
users.phone                   = "+972A"  (canonical — set from plan creation)
participants.contact_phone    = "+972B"  (owner entered a different number for this plan)
```

After the user claims the invite, both rows remain as-is. This is intentional:
- Chatbot identifies user by "+972A" ✅
- WhatsApp notifications for this plan go to "+972B" (owner's choice — may be a work/secondary phone)
- The numbers are allowed to differ — participants.contact_phone is per-plan delivery data, not identity

To align notification delivery with the canonical phone, the owner or user must explicitly call:
`PATCH /participants/:participantId { contactPhone: "+972A" }`

---

## 8. Data Migration (existing users)

Existing users who created plans before this fix have `users.phone = null` but their phone exists in `participants.contact_phone` on their owner-participant row. A one-time migration backfills `users.phone` from their oldest owner participant row:

```sql
INSERT INTO users (user_id, phone, created_at, updated_at)
SELECT DISTINCT ON (p.user_id)
  p.user_id,
  p.contact_phone,
  NOW(),
  NOW()
FROM participants p
JOIN plans pl ON pl.plan_id = p.plan_id
  AND pl.created_by_user_id = p.user_id  -- owner rows only
WHERE p.user_id IS NOT NULL
  AND p.contact_phone IS NOT NULL
  AND p.contact_phone != ''
ORDER BY p.user_id, p.created_at ASC     -- oldest plan first = first phone they gave us
ON CONFLICT (user_id)
  DO UPDATE SET phone = EXCLUDED.phone
  WHERE users.phone IS NULL;             -- never overwrite an explicit user preference
```

---

## 9. FE Responsibilities

- The **Profile page** is the primary and only place where users set or update their canonical phone.
- `PATCH /auth/profile { phone }` is the only endpoint the FE should call to explicitly set a user's phone.
- The FE must call `POST /auth/sync-profile` after sign-up and after any Supabase profile update that includes a phone number.
- The FE must NOT read `participants.contact_phone` as the user's own phone number — use `GET /auth/profile` → `preferences.phone` for that.

---

## 10. BE Rules (enforce in code review)

1. **`resolveUserByPhone` queries `users.phone` only** — never change it to query `participants.contact_phone`.
2. **Never overwrite `users.phone` from a participant row** unless `users.phone IS NULL` (bootstrapping flows only).
3. **`PATCH /auth/profile` is the only endpoint that always overwrites `users.phone`** and always syncs to all participant rows.
4. **When adding any new flow that captures a user's phone**, decide explicitly: is this the user's own phone (→ upsert `users.phone` if null + write to participant) or someone else's phone (→ participant row only)?
5. **`participants.contact_phone` must never be read for identity resolution** — it is per-plan delivery data only.

---

## 11. Related Docs

- [User Management Spec](user-management.md) — auth flow, participant states, claim flow
- [WhatsApp Spec](whatsapp.md) — send-list and invitation flows that use `participants.contact_phone` for delivery
- [WhatsApp Chatbot Spec](whatsapp-chatbot-spec.md) — `POST /api/internal/auth/identify` implementation
- [Backend Dev Lessons](../dev-lessons/backend.md) — historical bugs in this area
