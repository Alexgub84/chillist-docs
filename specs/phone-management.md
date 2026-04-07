# Phone Number Management — Architecture Spec

> **Status:** Authoritative — all new code must follow this spec
> **Last updated:** 2026-04-07
> **Affects:** BE (`users` table, `participants` table), chatbot (`POST /api/internal/auth/identify`), FE (profile page)

---

## 1. Canonical Rule

> **`users.phone` is the single source of truth for a user's phone number. It always wins.**

A registered user has exactly one phone. Whatever the owner entered in a participant row is a best-effort entry — it gets replaced with the user's registered phone the moment they claim the invite or update their profile.

`participants.contact_phone` still exists and is required — for unregistered participants (no `user_id`) it is the only phone source for WhatsApp delivery. But for **registered users**, it must always equal `users.phone`.

---

## 2. The Two Phone Columns — What They Mean

| Column | Table | What it means | Registered users | Unregistered participants |
|--------|-------|---------------|-----------------|--------------------------|
| `users.phone` | `users` | The user's canonical phone — their identity | Always set after first interaction | N/A |
| `participants.contact_phone` | `participants` | Per-plan delivery phone for WhatsApp | Must mirror `users.phone` — synced automatically | Only source of phone for this person |

For registered users, these two columns will always have the same value after a sync. The system enforces this — it is not left to chance.

---

## 3. All Phone Storage Locations

There are exactly **5 places** phone numbers are stored in the system. Two are live (must stay in sync for registered users), three are historical (immutable by design).

| Location | Type | Registered users | Guests | Stays in sync? |
|----------|------|-----------------|--------|----------------|
| `users.phone` | **Live / canonical** | Yes — identity | No | N/A — source of truth |
| `participants.contact_phone` | **Live / derived** | Yes — always mirrors `users.phone` | Yes | Auto-synced via claim, profile update |
| `participant_join_requests.contact_phone` | Historical snapshot | Yes — phone at time of request submission | No | No — immutable once created |
| `whatsapp_notifications.recipient_phone` | Audit log | Yes — phone used at time of send | Yes | No — immutable, records what was actually sent |
| `guest_profiles.phone` | Live (guests only) | No | Yes | Guest-managed separately |

**Key point:** For a registered user there are only **two live places** — `users.phone` (canonical) and `participants.contact_phone` (derived, always equal after sync). The other three are historical records and must never be updated after creation.

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

`users.phone` is the canonical phone. The chatbot trusts it completely. If the chatbot receives a message from a number that is NOT in `users.phone`, the user is not identified.

### What if the user messages from a different phone?

If a user has multiple SIM cards and sends from phone B while their registered phone is A — they will not be identified (404). This is intentional and acceptable:

- The system supports one canonical phone per registered user
- The user can update their canonical phone at any time via `PATCH /auth/profile`
- The chatbot responds with a link to the profile page to set or update their phone

### The bug — wrong side

The bug reported in issue #176 is **not** in the query. The query is correct. The bug is on the **write side**: the flows that capture a user's own phone (plan creation, join requests, claim) never wrote to `users.phone`. Result: `users.phone = null` for almost every user → 404 for everyone.

---

## 5. All Phone Entry Points — Annotated

### 5.1 Flows that write to `users.phone` ✅

#### `PATCH /auth/profile` — primary canonical setter

The explicit, user-initiated way to set or update their phone. **Always overwrites** and always syncs all participant rows.

```
FE profile page → PATCH /auth/profile { phone: "+972501234567" }
  → BE normalizes to E.164
  → BE upserts users.phone (always overwrites)
  → BE syncs new phone to ALL participants.contact_phone WHERE user_id = this user
  → Returns updated preferences including phone
```

---

#### `POST /auth/sync-profile` — Supabase metadata sync

When the user's phone is stored in Supabase `user_metadata.phone`, this sync propagates it to `users.phone` and all participant rows.

```
FE calls POST /auth/sync-profile (e.g. after sign-up / OAuth)
  → BE fetches user_metadata from Supabase Admin API
  → If user_metadata.phone exists:
      → BE upserts users.phone
      → BE syncs to all participants via syncAllParticipantsForUser
```

---

#### `POST /plans` — plan creation bootstrap

When a user creates their first plan, they provide their own phone as `owner.contactPhone`. Bootstrap into `users.phone` if not already set (`bootstrapUsersPhoneIfNull` in `src/services/phone-sync.ts`).

```
User creates plan → POST /plans { owner: { contactPhone: "+972..." }, ... }
  → BE creates plan + owner participant with contactPhone
  → BE upserts users.phone = owner.contactPhone
     ONLY IF users.phone IS NULL
```

**Rule:** Only if null — never overwrite an explicit profile phone.

---

#### `POST /plans/:planId/join-requests` — join request bootstrap

When a user submits a join request they provide their own phone. Bootstrap into `users.phone` if not set (same helper as plan creation).

```
User submits join request → POST .../join-requests { contactPhone: "+972...", ... }
  → BE creates join request record
  → BE upserts users.phone = contactPhone
     ONLY IF users.phone IS NULL
```

---

#### `POST /plans/:planId/claim/:inviteToken` — claim syncs registered phone to participant

When a user claims an invite, the participant row may have a phone entered by the owner (potentially wrong, potentially a different number). After linking the user, we sync `users.phone` → `participants.contact_phone` so the participant row reflects the user's actual registered phone (implemented in `src/routes/claim.route.ts`).

```
User claims invite → POST /plans/:planId/claim/:inviteToken (JWT)
  → Links participants.user_id = JWT sub
  → Syncs JWT identity fields (name, email, avatar) → participants
  → IF users.phone IS NOT NULL:
      → Update participants.contact_phone = users.phone
        (overrides whatever the owner entered)
  → IF users.phone IS NULL AND participant.contact_phone IS NOT NULL:
      → Bootstrap users.phone = participants.contact_phone
        (rare fallback: user has no phone yet but the participant row has one)
```

**Why override:** The owner may have typed the wrong number, an old number, or a secondary number. Once the user is linked, their registered phone is authoritative. WhatsApp notifications must go to the number the user owns and monitors.

**Result:** After claim, `users.phone` and `participants.contact_phone` always match for this user.

---

### 5.2 Flows that write to `participants.contact_phone` only — intentionally do NOT update `users.phone`

#### `POST /plans/:planId/participants` — owner inviting an unregistered person

The owner enters a phone for someone who may or may not have a Chillist account. This is the best-effort number the owner knows for this person. It stays in the participant row until the person claims their spot (at which point it gets replaced with their registered phone).

```
Owner invites → POST /plans/:planId/participants { contactPhone: "+972...", ... }
  → Writes to participants.contact_phone ONLY (user_id = null at this point)
  → Does NOT touch anyone's users.phone
```

---

#### `PATCH /plans/:planId/join-requests/:requestId` (approval)

The phone was already bootstrapped into `users.phone` when the join request was submitted. The participant row is created with the same phone from the join request. No additional sync needed.

```
Owner approves → { status: "approved" }
  → Creates participant row with userId + contactPhone from join request
  → users.phone was already set at request submission time
  → participants.contact_phone = users.phone (they are the same at this point)
```

---

#### `PATCH /participants/:participantId` — participant update

Owner or self may update `participants.contact_phone` for a specific plan. This is a manual override for per-plan delivery — it does not change the canonical phone.

```
PATCH /participants/:participantId { contactPhone: "+972..." }
  → Writes to participants.contact_phone ONLY
  → Never writes to users.phone
  → Note: on the next profile update or sync, this will be overwritten back to users.phone
```

---

## 6. Complete Flow Map

```
User action                           users.phone              participants.contact_phone
────────────────────────────────────────────────────────────────────────────────────────────────────
PATCH /auth/profile (phone)         → SET always (canonical) → SYNC to ALL user's participant rows
POST /auth/sync-profile             → SET if Supabase has   → SYNC via syncAllParticipantsForUser
POST /plans (owner.contactPhone)    → SET if null           → SET owner participant row
POST /plans/:id/join-requests       → SET if null           → SET join request record
POST /plans/:id/participants        → NEVER                 → SET invitee's participant row (owner's entry)
POST /plans/:id/claim/:token        → BOOTSTRAP if null     → OVERRIDE with users.phone if set
PATCH /participants/:id (by owner)  → NEVER                 → SET that participant row
PATCH /participants/:id (by self)   → NEVER                 → SET that participant row (manual override)
PATCH /.../join-requests (approve)  → (already set)         → SET from join request (same value)
```

---

## 7. Scenario Walkthrough

### Scenario A: User creates a plan, gets invited to another plan with a different number, then changes phone

**Step 1 — User creates a plan with phone A**

```
POST /plans { owner: { contactPhone: "+972A" } }

Writes:
  participants.contact_phone = "+972A"  (owner participant row)
  users.phone = "+972A"                 (bootstrapped)
```

**Step 2 — Another owner invites the user using phone B (a different number)**

```
POST /plans/:id/participants { contactPhone: "+972B" }

Writes:
  participants.contact_phone = "+972B"  (new row, user_id = null)

users.phone  → NOT touched
```

**Step 3 — User claims the invite (they are registered, users.phone = "+972A")**

```
POST /plans/:id/claim/:inviteToken

Writes:
  participants.user_id = userId
  participants.contact_phone = "+972A"   ← OVERRIDES "+972B" with users.phone
  participants.name / email / avatar     (synced from JWT)

Result: participants.contact_phone now matches users.phone ✅
```

**After Step 3:**
- Chatbot: user messages from "+972A" → found ✅
- WhatsApp for both plans goes to "+972A" ✅
- If user messages from "+972B" → not found (they only have one registered phone) → profile link sent

**Step 4 — User changes phone via profile**

```
PATCH /auth/profile { phone: "+972C" }

Writes:
  users.phone = "+972C"
  participants.contact_phone = "+972C"  (ALL plans — both participant rows)

participant_join_requests  → NOT touched (historical)
whatsapp_notifications     → NOT touched (audit log)
```

---

### Scenario B: User with no prior plan claims an invite first

```
POST /plans/:id/claim/:inviteToken
  users.phone IS NULL (first interaction)
  participants.contact_phone = "+972A"  (owner entered)

  → users.phone IS NULL: bootstrap users.phone = "+972A"
  → participants.contact_phone stays "+972A"

Result: users.phone = "+972A" ✅
```

---

## 8. Data Migration (existing users)

Existing users who created plans before this fix have `users.phone = null` but their phone exists in `participants.contact_phone` on their owner-participant row. A one-time migration backfills `users.phone`:

```sql
INSERT INTO users (user_id, phone, created_at, updated_at)
SELECT DISTINCT ON (p.user_id)
  p.user_id,
  p.contact_phone,
  NOW(),
  NOW()
FROM participants p
JOIN plans pl ON pl.plan_id = p.plan_id
  AND pl.created_by_user_id = p.user_id  -- owner rows only (user entered their own phone)
WHERE p.user_id IS NOT NULL
  AND p.contact_phone IS NOT NULL
  AND p.contact_phone != ''
ORDER BY p.user_id, p.created_at ASC     -- oldest plan = first phone they gave us
ON CONFLICT (user_id)
  DO UPDATE SET phone = EXCLUDED.phone
  WHERE users.phone IS NULL;             -- never overwrite an explicit preference
```

---

## 9. FE Responsibilities

- The **Profile page** is the primary place where users set or update their canonical phone.
- `PATCH /auth/profile { phone }` is the only endpoint the FE should call to explicitly set a user's phone.
- The FE must call `POST /auth/sync-profile` after sign-up and after any Supabase profile update that includes a phone.
- The FE must NOT read `participants.contact_phone` as the user's own phone — use `GET /auth/profile` → `preferences.phone` for that.

---

## 10. BE Rules (enforce in code review)

1. **`resolveUserByPhone` queries `users.phone` only** — never change it to query `participants.contact_phone`.
2. **At claim time, if `users.phone` is set, override `participants.contact_phone`** — the registered phone always wins.
3. **`PATCH /auth/profile` is the only endpoint that always overwrites `users.phone`** and always syncs to all participant rows.
4. **Bootstrap writes (`POST /plans`, `POST /join-requests`, claim fallback) only write to `users.phone` if it IS NULL** — never overwrite.
5. **When adding any new flow that captures a phone**, ask: is this the user's own phone? If yes → bootstrap `users.phone` if null + write to participant. If someone else's phone → participant row only.
6. **`participants.contact_phone` for registered users is a derived field** — it will be overwritten on the next profile update or claim. Do not rely on it being independent.

---

## 11. Related Docs

- [User Management Spec](user-management.md) — auth flow, participant states, claim flow
- [WhatsApp Spec](whatsapp.md) — send-list and invitation flows that use `participants.contact_phone` for delivery
- [WhatsApp Chatbot Spec](whatsapp-chatbot-spec.md) — `POST /api/internal/auth/identify` implementation
- [Backend Dev Lessons](../dev-lessons/backend.md) — historical bugs in this area
