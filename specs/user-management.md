# User & Participant Management — Spec

> **Status:** In Progress (Phase 3 — Step 1 done, Step 2 done, Step 3 claim endpoint done. Phase 7+8 done — JWT enforced on all routes, API key removed)
> **Last updated:** 2026-02-26
> **Depends on:** Supabase Auth (done), existing plans/participants/items schema

---

## 1. Overview

Add user identity, participant linking, guest access, and access control to Chillist. This spec introduces:

- **Registered users** (profiles linked to Supabase Auth)
- **Guest access via persistent invite token** (no OTP, no session expiry)
- **RSVP confirmation** (pending / confirmed / not_sure)
- **Activity tracking** (`lastActivityAt` per participant)
- **Participant claiming** (registered user links themselves to a participant record)
- **Response filtering** (PII hidden from guests)
- **Edit permissions** (participants can only edit their own assigned items)

---

## 2. Architecture Decisions

### 2.1 Auth Flow (Unchanged)

The existing auth path remains. No changes needed.

```
FE → Supabase Auth (sign-up/sign-in/OAuth)
FE → BE (Authorization: Bearer <jwt> on every request)
BE → Supabase JWKS (verify JWT signature, extract user claims)
BE → Railway PostgreSQL (query with authorization logic)
```

- FE calls Supabase directly for authentication
- BE verifies JWTs via Supabase JWKS endpoint (`jose` library, asymmetric ES256 keys)
- BE never has a Supabase client or auth secrets
- `request.user` is populated with `{ id, email, role }` on every request with a valid JWT

**Why this is best practice:**
- BE has zero auth secrets — only public JWKS keys, nothing to leak
- Supabase handles the hard parts (password hashing, brute-force protection, email verification, OAuth redirects, token refresh)
- BE stays stateless — no session storage, no cookies, every request carries its own proof of identity
- Clean separation: auth provider owns identity, BE owns business logic, DB owns data
- Same pattern used by Auth0, Firebase, AWS Cognito

### 2.2 Authorization: Application-Level (Not RLS)

Authorization is enforced in Fastify route handlers, not via PostgreSQL Row-Level Security.

**Why:**
- The existing BE architecture (Drizzle ORM + Fastify routes + DI) is well-established with tests and CI/CD
- RLS would require either adopting the Supabase client on BE or passing JWT context to DB — both are architectural rewrites
- Application-level auth is straightforward: check `request.user`, query DB, filter response
- Easier to test (inject mock users in integration tests)

### 2.3 Database: Keep Railway PostgreSQL

All tables (including new tables) stay in the existing Railway PostgreSQL instance.

**Why:**
- There is currently ONE database (Railway PostgreSQL). Supabase is only used for auth tokens — no data lives in Supabase's DB
- Adding new tables to Railway PostgreSQL does not create "two databases"
- PII protection comes from authorization logic in route handlers, not from which PostgreSQL instance hosts the data
- No migration effort, no deployment changes, no Supabase DB vendor lock-in

### 2.4 Plan Creation: JWT Required

All plan routes require JWT authentication (enforced via `onRequest` hook since v1.14.1). Plans created by authenticated users default to `visibility: invite_only` with `createdByUserId` set to the user's Supabase UUID.

#### Visibility Rules (enforced on both create and update)

| Auth state | Allowed visibility values | Default (when not sent) |
|---|---|---|
| JWT present (signed-in) | `invite_only`, `private` | `invite_only` |
| Admin (JWT with admin role) | `public`, `invite_only`, `private` | `invite_only` |

The BE enforces these rules on `POST /plans` and `PATCH /plans/:planId`. Sending a disallowed value returns **400** with a descriptive message.

**FE guidance:** The FE does not need to send a `visibility` field — the server applies the correct default. If the FE offers a visibility picker, only show the allowed options based on the user's role.

### 2.5 PII Stripping: Always on the BE

**PII is always stripped on the BE, never on the FE.** The BE removes PII fields from the response before sending. Guests never receive this data — not even in the raw JSON. This prevents PII from being visible in the browser Network tab or client-side logs.

### 2.6 Guest Access via Persistent Invite Token

> **Decision (2026-02-24):** WhatsApp OTP verification was deferred. Guest access uses the existing `inviteToken` on participants directly as a persistent authentication credential. No session expiry, no Twilio dependency.

Guests authenticate by sending their invite token in the `X-Invite-Token` HTTP header. The token is the same `inviteToken` already generated for each participant — no additional table or secret needed.

**How it works:**
1. Owner creates a plan, adds participants → each gets an `inviteToken` (64-char hex, already exists)
2. FE generates a shareable invite link containing the token
3. Guest opens the link → FE extracts the token and sends it as `X-Invite-Token` header on all requests
4. BE `guest-auth` plugin validates the token against `participants` table, populates `request.guestParticipant`
5. Guest endpoints (`/guest/*`) check `request.guestParticipant` for authorization

**Two guest paths:**

| Path | Auth mechanism | Behavior |
|------|---------------|----------|
| Guest (no sign-up) | `X-Invite-Token` header | Can view plan, update preferences, edit own items. Must keep using the invite link. |
| Signed-up participant | JWT (`Authorization: Bearer`) | Supabase ID linked to participant row via claim. Full JWT-based access. |

Both paths can update per-plan preferences (food, allergies, group size).

**Why persistent tokens (not sessions):**
- Simpler architecture — no `guest_sessions` table, no expiry logic, no cleanup jobs
- The invite link IS the access credential — it doesn't change and doesn't expire
- `lastActivityAt` on the participant tracks engagement without session management
- If a token needs to be revoked, the owner can regenerate it (future feature)

---

## 3. Terms and Roles

### 3.1 User (Registered)

A person who signed up via Supabase Auth (email/password or Google OAuth).

- Identity (email, name, phone) lives in Supabase only — BE stores only the Supabase UUID as a reference
- App-specific preferences (food prefs, allergies, default equipment) stored in `user_details` table
- `GET /auth/profile` returns identity from JWT + preferences from `user_details`
- Can create plans, claim participant spots, see full PII, edit assigned items
- Once registered, only connected to new plans created after registration (no auto-linking to old participant records)

### 3.2 Participant

A per-plan entity representing someone involved in the plan.

- Created by the plan owner (name, phone, etc.)
- Exists independently of user accounts — most participants won't have accounts
- Has a nullable `userId` that links to a `profiles` row when claimed
- Has an `inviteToken` for sharing access
- Has `rsvpStatus` (pending/confirmed/not_sure) for attendance confirmation
- Has `lastActivityAt` tracking when they last accessed via invite token
- Registered participants can see full plan details but only edit their own assigned items

Three participant states:

| State | `userId` | Description |
|-------|----------|-------------|
| Unlinked | null | Owner added them by name/phone. No user account. |
| Linked | set | A registered user claimed this participant spot. |
| Owner | set or null | The plan creator. Has `role: 'owner'`. May or may not be registered. |

### 3.3 Guest

Not a database entity. A guest is someone accessing a plan via an invite token who has NOT signed up.

- Authenticates via `X-Invite-Token` header (persistent, no expiry)
- Sees plan details and filtered items (own assigned + unassigned only); only `displayName` and `role` for participants (no full names, phones, or emails)
- Can confirm RSVP status (pending/confirmed/not_sure)
- Can update per-plan preferences (displayName, adultsCount, kidsCount, foodPreferences, allergies, notes)
- Can edit items assigned to them (all fields), self-assign/unassign to unassigned items
- Cannot add new items, delete items, or manage participants
- Must keep using the invite link (no JWT, no session)

### 3.4 Admin

A registered user with elevated privileges for platform management and debugging.

- **Assignment:** Set via Supabase `app_metadata.role = 'admin'` (Supabase dashboard or Admin API). The BE reads `app_metadata.role` from the JWT, falling back to the top-level `role` claim, then to `'authenticated'`.
- **Read access:** Can read all plans, items, and participants regardless of visibility (`public`, `invite_only`, `private`). Bypasses `checkPlanAccess()` entirely.
- **Visibility rules bypass:** Can create public plans while signed in, and set any plan's visibility to `public` (normal signed-in users cannot).
- **Write access:** No special write bypasses beyond visibility rules. When Phase 7 ownership enforcement is added, admin exemptions must be wired into write routes too.
- **Not a participant role:** Admin is a JWT-level role, not a participant role. An admin does not appear in a plan's participants list unless explicitly added.

---

## 4. Schema Changes

> **Architecture Adaptation (2026-02-22):** The original spec called for a `profiles` table storing email, display_name, and avatar_url locally. Per the PII separation decision, this was replaced by `user_details` (app-specific preferences only). Supabase is the single PII store — Railway DB stores only opaque Supabase UUIDs as references. See [dev-lessons: PII Separation](../dev-lessons/backend.md).
>
> Other adaptations:
> - Per-plan preferences (`foodPreferences`, `allergies`, `adultsCount`, `kidsCount`, `notes`) live directly on the `participants` table — each participant record stores preferences for that specific plan. The `guest_profiles` table also has these columns but is not the primary store for per-plan preferences.
> - `user_details` stores **default preferences** for signed-in users. When a signed-in user joins a new plan, their defaults are pre-filled into the participant record but can be customized per-plan.
> - `plan_invites` table was added (not in original spec) for invite tracking with hashed tokens
> - `participants.userId` has no FK to a local profiles table — it's a plain UUID reference to Supabase
>
> **Guest access redesign (2026-02-24):** WhatsApp OTP verification and guest sessions were deferred. The `verification_codes` and `guest_sessions` tables are NOT needed. Guest access uses the existing `inviteToken` on participants with `X-Invite-Token` header. Added `rsvpStatus` enum and `lastActivityAt` column to participants.

### 4.1 ~~New Table: `profiles`~~ → Replaced by `user_details`

The original `profiles` table was replaced by `user_details` to avoid duplicating Supabase PII in the local DB.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | UUID | PK | Matches Supabase `auth.users.id` |
| `food_preferences` | TEXT | nullable | Free-text dietary preferences |
| `allergies` | TEXT | nullable | Free-text allergy list |
| `default_equipment` | JSONB | nullable | List of equipment items the user typically brings |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

Notes:
- No email, display_name, or avatar_url — that PII lives in Supabase `user_metadata`
- `user_id` comes from Supabase's `auth.users.id` (the JWT `sub` claim)
- Row created lazily on first `PATCH /auth/profile`, not auto-provisioned
- These are **default preferences** — when a signed-in user joins a new plan, `foodPreferences` and `allergies` are pre-filled into the participant record. The user can then customize them per-plan. `defaultEquipment` is used to suggest items.

### ~~4.2 New Table: `verification_codes`~~ — DEFERRED

> **Deferred (2026-02-24):** WhatsApp OTP verification is not implemented. No `verification_codes` table needed. If OTP is added later, this section will be reinstated.

### ~~4.3 New Table: `guest_sessions`~~ — REMOVED

> **Removed (2026-02-24):** Guest sessions replaced by persistent invite token auth. No `guest_sessions` table needed. The `inviteToken` on `participants` is the access credential. `lastActivityAt` tracks engagement.

### 4.4 Modified Table: `participants`

New columns (actually implemented):

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | UUID | nullable (no FK — plain Supabase UUID reference) | Set when a registered user claims this participant spot |
| `guest_profile_id` | UUID | nullable, FK → `guest_profiles.guest_id` | Links to guest profile for unregistered participants |
| `invite_status` | ENUM | NOT NULL, DEFAULT 'pending' | 'pending' / 'invited' / 'accepted' |
| `rsvp_status` | ENUM | NOT NULL, DEFAULT 'pending' | 'pending' / 'confirmed' / 'not_sure' — attendance confirmation |
| `last_activity_at` | TIMESTAMPTZ | nullable | Updated by guest-auth plugin on each request with valid `X-Invite-Token` |

> **Update (2026-02-24):** Per-plan preferences (`foodPreferences`, `allergies`, `adultsCount`, `kidsCount`, `notes`) now live directly on the `participants` table. Guest and signed-in user endpoints update the participant record for per-plan data. The `guest_profiles` table also has these columns but is under review (see Open Question #11).

- Existing columns unchanged (`name`, `lastName`, `contactPhone`, `contactEmail`, `displayName`, `role`, `inviteToken`, etc.)
- Per-plan preference columns on participant: `foodPreferences`, `allergies`, `adultsCount`, `kidsCount`, `notes`
- PII stays on the participant row regardless of linking — this is plan-specific data the owner entered
- `userId` has no foreign key constraint — it's an opaque reference to Supabase, not to a local `profiles` table

### 4.5 Modified Table: `plans`

New column (actually implemented):

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `created_by_user_id` | UUID | nullable (no FK — plain Supabase UUID reference) | The registered user who created this plan (null if created anonymously) |

- Separate from `owner_participant_id` (which is a participant, not a user)
- Populated automatically when the plan creator has a valid JWT (done in Phase 1.5)
- No FK to a local `profiles` table — opaque Supabase UUID reference

### 4.6 Relations

```
profiles 1 ←──── * participants        (via participants.user_id)
profiles 1 ←──── * plans               (via plans.created_by_user_id)
plans    1 ←──── * participants         (existing, via participants.plan_id)
plans    1 ←──── * items                (existing, via items.plan_id)
```

### 4.7 Entity Diagram

```
┌─────────────┐         ┌──────────────────┐         ┌──────────┐
│ user_details │         │   participants   │         │  items   │
├─────────────┤    ┌────►├──────────────────┤    ┌───►├──────────┤
│ user_id (PK)│◄───┤    │ participant_id   │    │   │ item_id  │
│ food_prefs  │    │    │ plan_id (FK)     │────┤   │ plan_id  │
│ allergies   │    │    │ user_id          │    │   │ assigned_│
│ default_    │    │    │ name             │    │   │  particip│
│  equipment  │    │    │ last_name        │    │   │  ant_id  │
│ created_at  │    │    │ contact_phone    │    │   │ name     │
│ updated_at  │    │    │ display_name     │    │   │ category │
└─────────────┘    │    │ role             │    │   │ status   │
                   │    │ invite_token     │    │   │ ...      │
                   │    │ invite_status    │    │   └──────────┘
                   │    │ rsvp_status      │    │
                   │    │ last_activity_at │    │
                   │    │ adults_count     │    │
                   │    │ kids_count       │    │
                   │    │ food_preferences │    │
                   │    │ allergies        │    │
                   │    │ notes            │    │
                   │    │ ...              │    │
                   │    └──────────────────┘    │
                   │                            │
                   │    ┌──────────────────┐    │
                   │    │     plans        │    │
                   └────┤──────────────────┤    │
                        │ plan_id (PK)     │────┘
                        │ created_by_      │
                        │   user_id        │
                        │ owner_participant│
                        │   _id            │
                        │ title            │
                        │ status           │
                        │ visibility       │
                        │ ...              │
                        └──────────────────┘
```

---

## 5. Access Control

### 5.1 Access Matrix

| Accessor | Auth Method | Sees Plan + Items | Sees Participant PII | Can Add Items | Can Edit Items | Can Self-Assign | Can Update Own Preferences | Can Confirm RSVP | Can Manage Participants |
|----------|-----------|-------------------|---------------------|---------------|---------------|----------------|---------------------------|-----------------|------------------------|
| Admin | JWT (`app_metadata.role = 'admin'`) | All plans, all items (bypasses visibility) | Yes | Yes | All items | N/A | Yes | N/A | Yes |
| Owner (registered) | JWT | Yes | Yes | Yes | All items | N/A | Yes | N/A | Yes |
| Participant (linked) | JWT | Yes | Yes | Yes | Own assigned only | Yes | Yes | Yes | No |
| Guest (invite token) | Invite token in URL | Own assigned + unassigned only (PII stripped) | displayName + role only | Yes (auto-assigned) | Own assigned only (all fields) | N/A | Yes (anytime) | Yes | No |
| Anonymous | None | No (401) | No | No | No | No | No | No | No |

### 5.2 PII Fields (Hidden from Guests)

These fields are stripped from participant data when responding to guest requests:

- `name` (first name)
- `lastName`
- `contactPhone`
- `contactEmail`

Guests only see: `participantId`, `displayName`, `role`

The existing invite route (`GET /plans/:planId/invite/:inviteToken`) already implements this filtering pattern — reuse the same logic for all guest-level responses.

### 5.3 Auth Detection in Route Handlers

Each route checks auth as follows:

1. **Plans, items, participants routes** — `onRequest` hook requires JWT (`Authorization: Bearer`). Returns 401 without valid token. Route handlers use `request.user` for access control.
2. **Invite routes** (`/plans/:planId/invite/:inviteToken/*`) — Token in URL path. No JWT required. BE validates token against participants table.
3. **Auth routes** (`/auth/*`) — JWT required (route-level check).
4. **Health** — Public, no auth.

### 5.4 API Key: Removed (v1.14.1)

The API key (`x-api-key` header) was a legacy auth mechanism used before JWT was introduced. It has been fully removed:

- `API_KEY` env var removed from `env.ts`, `config.ts`, `.env.example`, and Railway
- Global `onRequest` API key check removed from `app.ts`
- `apiKey` option removed from `BuildAppOptions` (test DI)
- All tests updated to use JWT instead of API key

**Current auth model:**

| User type | Auth mechanism | Routes |
|---|---|---|
| Signed-in user (owner/participant) | JWT (`Authorization: Bearer`) | All plans, items, participants routes |
| Guest | Invite token in URL path | `/plans/:planId/invite/:inviteToken/*` routes |
| Anonymous | None | `/health` only |

---

## 6. Key Flows

### 6.1 Guest Access via Invite Token

```
Owner creates plan, adds participants with name/phone
  → Each participant gets an inviteToken (64-char hex, auto-generated)

Owner copies invite link from FE and shares it (e.g., WhatsApp, SMS, email)
  → Link format: https://app.chillist.com/invite/<inviteToken>

Guest opens invite link
  → FE extracts token from URL
  → FE stores token in local storage
  → FE sends X-Invite-Token header on all /guest/* requests

BE guest-auth plugin (onRequest hook):
  → Reads X-Invite-Token header
  → Looks up participant by inviteToken
  → If found: sets request.guestParticipant = { participantId, planId }
  → Updates lastActivityAt on the participant
  → If not found: request.guestParticipant remains null (guest routes will 401)

Guest can now:
  → View plan (GET /guest/plan) — filtered items, sanitized participants
  → Update RSVP status (PATCH /guest/rsvp)
  → Update preferences (PATCH /guest/preferences)
  → Edit assigned items (PATCH /guest/items/:itemId)
  → Self-assign/unassign items (POST /guest/items/:itemId/assign, /unassign)
```

### 6.2 Guest Preferences Update

```
Guest with active invite token:
  → FE calls: PATCH /guest/preferences (X-Invite-Token header)
    Body: { displayName?, adultsCount?, kidsCount?, foodPreferences?, allergies?, notes? }
  → BE validates: request.guestParticipant is set
  → BE updates participant record on the participants table
  → BE returns: { participantId, displayName, role, rsvpStatus, adultsCount, kidsCount, foodPreferences, allergies, notes }

Preferences are editable anytime — not a one-time onboarding.
Preferences are per-plan — a guest can have different dietary needs for different trips.
```

### 6.3 Guest Plan Access

```
Guest with active invite token:
  → FE calls: GET /guest/plan (X-Invite-Token header)
  → BE validates request.guestParticipant
  → BE returns: plan + filtered items + sanitized participants (displayName + role only)
  → Items filtered: only items assigned to this participant + unassigned items
  → Items assigned to other participants are hidden
```

### 6.3a Guest Item Interaction

```
Guest can edit items assigned to them:
  → FE calls: PATCH /guest/items/:itemId (X-Invite-Token header)
  → BE validates: item exists, item is assigned to this guest's participant
  → BE updates: all item fields (name, status, quantity, unit, notes)
  → BE returns: updated item

Guest can self-assign to an unassigned item:
  → FE calls: POST /guest/items/:itemId/assign (X-Invite-Token header)
  → BE validates: item exists, item has no assignedParticipantId (unassigned)
  → BE updates: SET assignedParticipantId = guest's participantId
  → BE returns: updated item

Guest can self-unassign from an item:
  → FE calls: POST /guest/items/:itemId/unassign (X-Invite-Token header)
  → BE validates: item exists, item is assigned to this guest's participant
  → BE updates: SET assignedParticipantId = null
  → BE returns: updated item
```

### 6.4 User Preferences (Registered User)

```
Signed-in user wants to read their profile + preferences:
  → FE calls: GET /auth/profile (Authorization: Bearer <jwt>)
  → BE returns: { user: { id, email, role }, preferences: { foodPreferences, allergies, defaultEquipment } | null }
  → preferences is null if the user has never saved preferences

Signed-in user wants to save/update default preferences:
  → FE calls: PATCH /auth/profile (Authorization: Bearer <jwt>)
  → Body: { foodPreferences?, allergies?, defaultEquipment? }
  → BE upserts user_details row (creates on first call, updates on subsequent)
  → BE returns: { user: { id, email, role }, preferences: { foodPreferences, allergies, defaultEquipment } }

When signed-in user joins a new plan:
  → BE pre-fills participant record with user_details defaults (foodPreferences, allergies)
  → User can customize per-plan on the participant record
```

No auto-provisioning middleware. The `user_details` row is created lazily on first `PATCH /auth/profile`.

### 6.5 Claim-Via-Invite (Link Registered User to Participant)

```
Registered user clicks invite link → FE detects user is logged in
  → FE calls: POST /plans/:planId/claim/:inviteToken (with JWT)
  → BE validates:
    1. Invite token exists and belongs to this plan
    2. Participant is not already linked to a different user
    3. This user is not already a participant in this plan
  → BE updates: UPDATE participants SET user_id = jwt.sub WHERE invite_token = :token
  → BE returns: full participant data (now linked)
```

After claiming, the user accesses the plan via their JWT (no invite token needed).

### 6.6 Authenticated Plan Access (Registered User)

```
Registered user opens a plan they're linked to
  → FE calls: GET /plans/:planId (with JWT)
  → BE checks: is request.user.id a linked participant or owner of this plan?
    → YES: return full plan + items + full participant data (including PII)
    → NO:  return 403 Forbidden (user has no relationship to this plan)
```

---

## 7. API Changes

### 7.0 FE Integration Reference

**Authentication headers the FE must send:**

| User type | Header | How to get the value |
|-----------|--------|---------------------|
| Signed-in user | `Authorization: Bearer <jwt>` | `supabase.auth.getSession()` → `session.access_token` |
| Guest (invite token) | `X-Invite-Token: <inviteToken>` | Extracted from the invite link URL |
| Unverified guest | None (invite token is in the URL path) | From the shared invite link |
| ~~Legacy~~ | ~~`x-api-key: <key>`~~ | Removed in v1.14.1. No longer accepted. |

**Error responses — all endpoints use the same shape:**

```json
{ "message": "Human-readable error description" }
```

| Status | Meaning | FE action |
|--------|---------|-----------|
| 400 | Validation error (bad input) | Show message to user |
| 401 | Not authenticated (missing/invalid/expired JWT). All plans, items, and participants routes require JWT. Invite routes use token in URL. | Redirect to sign-in, refresh Supabase token |
| 404 | Not found OR not authorized (same response to prevent leaking existence) | Show "not found" screen |
| 429 | Rate limited | Show "too many requests, try again later" |
| 500 | Server error | Show generic error |
| 503 | Database connection error | Show "service unavailable" |

### 7.1 New Endpoints

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| PATCH | `/guest/rsvp` | X-Invite-Token | Update RSVP status (pending/confirmed/not_sure) | Step 2 |
| PATCH | `/guest/preferences` | X-Invite-Token | Update own per-plan preferences | Step 2 |
| PATCH | `/plans/:planId/invite/:inviteToken/preferences` | Token in URL | Update guest per-plan preferences via invite link | ✅ Done |
| GET | `/guest/plan` | X-Invite-Token | Get plan data (sanitized, filtered items, guest view) | Step 2 |
| PATCH | `/guest/items/:itemId` | X-Invite-Token | Edit an item assigned to this guest (all fields) | Step 2 |
| POST | `/guest/items/:itemId/assign` | X-Invite-Token | Self-assign to an unassigned item | Step 2 |
| POST | `/guest/items/:itemId/unassign` | X-Invite-Token | Self-unassign from an item | Step 2 |
| GET | `/auth/profile` | JWT required | Get current user's profile | ✅ Done |
| PATCH | `/auth/profile` | JWT required | Update display name, avatar | ✅ Done |
| POST | `/plans/:planId/claim/:inviteToken` | JWT required | Link authenticated user to participant | ✅ Done |

### 7.2 Modified Endpoints (Access Control Added)

| Endpoint | Change |
|----------|--------|
| `GET /plans/:planId` | Check JWT → return full data if owner/linked participant; 401 if no auth |
| `GET /plans/:planId/participants` | Check JWT → return full PII if owner/linked participant; 401 if no auth |
| `GET /plans/:planId/invite/:inviteToken` | Returns filtered items (own assigned + unassigned only) + stripped participants. After Step 4: returns **minimal data only** (plan title, owner displayName) — acts as landing page before guest accesses `/guest/*` routes. |
| `PATCH /items/:itemId` | Check JWT → owner can edit any item; linked participant can edit only own assigned. Guests use `PATCH /guest/items/:itemId` instead (same logic, different auth). |
| `DELETE /items/:itemId` | Check JWT → owner only |
| `POST /plans/:planId/items` | Check JWT → owner and linked participants can add |
| `POST /plans/:planId/participants` | Check JWT → owner only |
| `PATCH /participants/:participantId` | Check JWT → owner only |
| `DELETE /participants/:participantId` | Check JWT → owner only |
| `GET /plans` | Check JWT → return only plans where user is owner or linked participant |

### 7.3 Unchanged Endpoints

| Endpoint | Reason |
|----------|--------|
| `GET /health` | Public, no auth |
| `GET /auth/me` | Already requires JWT |

### 7.4 New Endpoint Details

**`PATCH /guest/rsvp`**
- Auth: `X-Invite-Token` header required
- Body: `{ rsvpStatus: "pending" | "confirmed" | "not_sure" }`
- Action: Updates `rsvpStatus` on the guest's participant record
- Response: `{ participantId, rsvpStatus }`
- Errors: 400 (validation), 401 (invalid invite token)

**`PATCH /guest/preferences`**
- Auth: `X-Invite-Token` header required
- Body (all optional — send only fields to update):
  - `displayName` (string | null)
  - `adultsCount` (integer | null)
  - `kidsCount` (integer | null)
  - `foodPreferences` (string | null) — send null to clear
  - `allergies` (string | null) — send null to clear
  - `notes` (string | null)
- Action: Updates the guest's participant record on the `participants` table.
- Response: `{ participantId, displayName, role, rsvpStatus, adultsCount, kidsCount, foodPreferences, allergies, notes }`
- Errors: 400 (validation), 401 (invalid invite token)

**`GET /guest/plan`**
- Auth: `X-Invite-Token` header required
- Response:
  - `planId` (UUID)
  - `title`, `description`, `status`, `location`, `startDate`, `endDate`, `tags`, `createdAt`, `updatedAt`
  - `items` — array of items, **filtered**: only items where `assignedParticipantId` matches the guest's `participantId` OR `assignedParticipantId` is null (unassigned). Items assigned to other participants are hidden.
  - `participants` — array of **sanitized** participants: `{ participantId, displayName, role, rsvpStatus }` only. No PII.
- Errors: 401 (invalid invite token)

**`PATCH /guest/items/:itemId`**
- Auth: `X-Invite-Token` header required
- URL params: `itemId` (UUID)
- Body (all optional — send only fields to update):
  - `name` (string)
  - `category` ("equipment" | "food")
  - `quantity` (integer)
  - `unit` ("pcs" | "kg" | "g" | "lb" | "oz" | "l" | "ml" | "m" | "cm" | "pack" | "set")
  - `status` ("pending" | "purchased" | "packed" | "canceled")
  - `notes` (string | null)
- Validation: item must exist AND `assignedParticipantId` must match the guest's `participantId`. Cannot edit items assigned to other participants or unassigned items.
- Response: full updated item object
- Errors: 404 (item not found or not assigned to this guest), 400 (validation), 401 (invalid invite token)

**`POST /guest/items/:itemId/assign`**
- Auth: `X-Invite-Token` header required
- URL params: `itemId` (UUID)
- Body: none
- Validation: item must exist in this plan, `assignedParticipantId` must be null (unassigned)
- Action: `SET assignedParticipantId = guest's participantId`
- Response: full updated item object (now shows `assignedParticipantId` set)
- Errors: 404 (item not found), 400 (item already assigned to someone), 401 (invalid invite token)

**`POST /guest/items/:itemId/unassign`**
- Auth: `X-Invite-Token` header required
- URL params: `itemId` (UUID)
- Body: none
- Validation: item must exist, `assignedParticipantId` must match the guest's `participantId`
- Action: `SET assignedParticipantId = null`
- Response: full updated item object (now shows `assignedParticipantId: null`)
- Errors: 404 (item not found or not assigned to this guest), 401 (invalid invite token)

**`GET /auth/profile`** ✅ (already implemented)
- Auth: `Authorization: Bearer <jwt>` required
- Response:
  - `user` — `{ id: UUID, email: string, role: string }` (from JWT claims)
  - `preferences` — `{ foodPreferences: string | null, allergies: string | null, defaultEquipment: string[] | null }` or `null` if user has never saved preferences
- Errors: 401 (missing/invalid JWT)

**`PATCH /auth/profile`** ✅ (already implemented)
- Auth: `Authorization: Bearer <jwt>` required
- Body (all optional — send only fields to update):
  - `foodPreferences` (string | null) — send null to clear
  - `allergies` (string | null) — send null to clear
  - `defaultEquipment` (string[] | null) — array of equipment names, send null to clear
- Action: Upserts `user_details` row (creates on first call, updates on subsequent). These are **default preferences** that pre-fill participant records on new plans.
- Response: `{ user: { id, email, role }, preferences: { foodPreferences, allergies, defaultEquipment } }`
- Errors: 401 (missing/invalid JWT)

**`POST /plans/:planId/claim/:inviteToken`**
- Auth: `Authorization: Bearer <jwt>` required
- URL params: `planId` (UUID), `inviteToken` (string, 64-char hex)
- Body: none
- Validation:
  - Invite token must exist and belong to this plan
  - Participant must not already be linked to a different user (`userId` must be null)
  - This user must not already be a participant in this plan
- Action: `UPDATE participants SET userId = jwt.sub WHERE inviteToken = :token`. Pre-fills participant preferences from `user_details` defaults if they exist.
- Response: full participant object (now shows `userId` set)
- Errors: 404 (invalid token or plan), 400 (already claimed or user already in plan), 401 (missing/invalid JWT)

**`PATCH /plans/:planId/invite/:inviteToken/preferences`** ✅ (v1.13.0)
- Auth: Invite token in URL path (no header required)
- URL params: `planId` (UUID), `inviteToken` (string, 64-char hex)
- Body (all optional — send only fields to update, send null to clear):
  - `displayName` (string | null, maxLength 255)
  - `adultsCount` (integer | null, minimum 0)
  - `kidsCount` (integer | null, minimum 0)
  - `foodPreferences` (string | null)
  - `allergies` (string | null)
  - `notes` (string | null)
- Validation: Body must have at least one field. Token + planId must match a participant record.
- Action: Updates the matched participant record with the provided fields.
- Response: `{ participantId, displayName, role, rsvpStatus, adultsCount, kidsCount, foodPreferences, allergies, notes }` — no PII fields exposed.
- Errors: 400 (empty body), 404 (invalid token or plan), 500/503 (server/db error)

---

## 8. Infrastructure Security

### 8.1 Database Network Isolation

The Railway PostgreSQL instance must NOT be directly accessible from the internet. All data access goes through the Fastify BE.

```
Internet → Fastify BE (Railway, public) → PostgreSQL (Railway private network, NOT public)
```

**Required checks:**

- **Disable public networking** on the Railway Postgres service (Dashboard → Postgres service → Settings → Networking). Only enable temporarily if needed for local migrations, then disable immediately after.
- **Verify `DATABASE_URL` uses `RAILWAY_PRIVATE_DOMAIN`** (internal hostname), not a public `containers-us-west-xxx.railway.app` hostname. The `.env.example` already documents the correct pattern: `postgresql://${{PGUSER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:5432/${{PGDATABASE}}`
- **Run production migrations via `railway run`** (tunnels through private network) instead of connecting from a local machine to a public DB endpoint.

### 8.2 API-Level Protections

| Layer | Defense | Status |
|-------|---------|--------|
| SQL injection | Drizzle ORM parameterized queries | Done |
| Input validation | Zod schemas on all request bodies | Done |
| Auth | JWT via Supabase JWKS on all protected routes + invite token for guests | Done (v1.14.1) |
| CORS | Restricted to `FRONTEND_URL` in production | Done |
| Credential storage | DB password in Railway env vars only, JWT verified via public keys | Done |
| Rate limiting | `@fastify/rate-limit` — 100 req/min global, 10 req/min on auth endpoints | Done (Phase 2) |
| Security headers | `@fastify/helmet` — X-Content-Type-Options, HSTS, X-Frame-Options, etc. | Done (Phase 2) |
| Request size | Fastify default 1MB body limit | Done (default) |
| Guest permission boundary | JWT hooks reject unauthenticated requests on protected routes (354 tests) | Done (v1.14.1) |

---

## 9. Dependencies and Environment

### 9.1 New Dependencies

| Package | Purpose | Status |
|---------|---------|--------|
| `@fastify/rate-limit` | Rate limiting per IP/route (100 req/min global, 10 req/min auth) | Done (v10.3.0) |
| `@fastify/helmet` | HTTP security headers | Done (v13.0.2) |

> **Note:** Twilio was originally planned for WhatsApp OTP but is deferred. No `twilio` dependency needed.

### 9.2 Environment Variables

No new environment variables needed for guest access (invite token uses existing `inviteToken` field).

> **Deferred:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` — only needed if WhatsApp OTP is added later.

---

## 10. Implementation Phases

Each phase is independently deployable with no breaking changes.

### Phase 1: Database Schema Changes ✅

**Status:** Done (adapted). PR #76.

**Goal:** Add new tables and columns. No behavior changes.

Adapted from original spec:
- Added `user_details` table (replaces `profiles` — PII separation, Supabase is single PII store)
- Added `guest_profiles` table (onboarding columns live here, not on `participants`)
- Added `plan_invites` table (not in original spec — invite tracking with hashed tokens)
- Added `userId`, `guestProfileId`, `inviteStatus` columns to `participants`
- Added `createdByUserId` column to `plans`
- Generated and ran migration
- Updated TypeScript types and test seed helpers

### Phase 1.5: Opportunistic User Tracking ✅

**Status:** Done. PR #80.

**Goal:** Record Supabase user ID on plans/participants when JWT is present. No enforcement.

- `POST /plans` (originally `/plans/with-owner`) sets `createdByUserId` and owner `userId` from `request.user?.id`
- At time of implementation, no route required JWT — API key worked for everything (API key later removed in Phase 8)
- If no JWT present, fields remained null

### Phase 2: Profile Endpoints + Security Hardening ✅

**Status:** Done (adapted). PR #81.

**Goal:** Authenticated users can read/update app preferences. API hardened with rate limiting and security headers.

Adapted from original spec:
- No `profiles` table and no auto-provisioning middleware — Supabase is single PII store
- `GET /auth/profile` returns JWT identity + `user_details` preferences (null if never saved)
- `PATCH /auth/profile` upserts `user_details` row (food prefs, allergies, default equipment)
- Added `@fastify/rate-limit` (100 req/min global, 10 req/min on auth endpoints)
- Added `@fastify/helmet` (security headers, CSP disabled in dev for Swagger UI)
- Integration tests for profile CRUD

### Phase 2.5: Plan Ownership + Access Control ✅

**Goal:** Enforce `visibility` field on plans. Authenticated plan creation defaults to `invite_only`. Only owner/linked participants can read non-public plans.

**Step A — Core access control: Done (PR #84)**

- `POST /plans` (originally `/plans/with-owner`) with JWT defaults `visibility` to `invite_only`
- `checkPlanAccess()` utility in `src/utils/plan-access.ts`: checks visibility + user relationship (owner via `createdByUserId`, participant via `participants.userId`)
- `GET /plans/:planId` enforces access control (returns 404 for unauthorized access to non-public plans — same response as nonexistent plan to prevent information leakage)
- 17 integration tests: visibility defaults, owner/participant/viewer access, expired JWT, orphaned plans, response shape identity, invite route compatibility
- Version 1.7.0

**Step B — Extended protection: Done (PR #84, second commit)**

- `GET /plans` filters results: JWT user sees own plans (owner or linked participant) + public plans; no JWT sees only public plans. Uses `or()` + `exists()` subquery in Drizzle.
- `GET /plans/:planId/participants` enforces plan access via `checkPlanAccess()`
- `GET /plans/:planId/items` enforces plan access via `checkPlanAccess()`
- 12 additional integration tests (list filtering, sub-resource access/denial)
- Invite route item filtering: only returns items assigned to the invited participant + unassigned items
- Version 1.8.0

**Step C — JWT fail-fast + logging: Done (PR #84)**

- JWT verification failure log level upgraded from `debug` to `warn` in `src/plugins/auth.ts` — failures now visible in production logs
- Fail-fast guard on write endpoints (`POST /plans`, `PATCH /plans/:planId`, `DELETE /plans/:planId`): if `Authorization: Bearer` header is present but `request.user` is null, return 401 instead of creating broken resources
- 5 integration tests: invalid JWT on create/patch/delete returns 401, no JWT creates public plan, valid JWT creates invite_only plan with owner

### Phase 3: Guest Access via Invite Token 🔄

> **Redesigned (2026-02-24):** Originally "WhatsApp Verification + Guest Sessions". WhatsApp OTP and guest sessions were deferred. Replaced with persistent invite token auth. Broken into 4 incremental steps, each a separate PR.

#### Step 1: Invite Auth Plugin + DB Migration ✅

**Status:** Done. Version 1.11.0.

**Goal:** Add the guest-auth infrastructure — plugin, schema changes, permission boundaries.

**DB changes:**
- New enum: `rsvp_status` (pending / confirmed / not_sure)
- New columns on `participants`: `rsvp_status` (NOT NULL, default 'pending'), `last_activity_at` (nullable timestamp)
- Migration: `drizzle/0008_unknown_sue_storm.sql`

**New files:**
- `src/plugins/guest-auth.ts` — Fastify plugin that:
  - Reads `X-Invite-Token` header on every request
  - Looks up participant by `inviteToken`
  - Populates `request.guestParticipant = { participantId, planId }`
  - Updates `lastActivityAt` on the matched participant
  - Fails silently (logs warning, leaves `guestParticipant` null) on lookup errors
- `src/types/fastify.d.ts` — Extended `FastifyRequest` with `guestParticipant: GuestParticipant | null`

**Modified files:**
- `src/app.ts` — Registers `guest-auth` plugin, adds `hasInviteToken` to request logging
- `src/db/schema.ts` — Added `rsvpStatusEnum`, `rsvpStatus` and `lastActivityAt` columns to participants
- `src/schemas/participant.schema.ts` — Added `rsvpStatus` and `lastActivityAt` to JSON schema

**Test coverage (51 new tests across 2 files):**

`tests/integration/guest-auth.test.ts` (22 tests):
- Valid token: `lastActivityAt` updated, selective update, incremental timestamps, correct plan resolution
- Invalid/missing token: no `lastActivityAt` update for missing header, nonexistent token, empty/short/long/XSS/SQL-injection tokens
- Route bypass: `/guest/` and `/invite/` routes return 404 not 401
- `rsvpStatus`: defaults to 'pending' on creation (both endpoints), included in list/get/patch responses
- `lastActivityAt`: null on creation, null in list, updated after guest access

`tests/integration/guest-permissions.test.ts` (29 tests):
- Baseline: owner with JWT can access protected routes
- Guest with X-Invite-Token cannot: list plans, create plans, get/update/delete plans, list/create/get/update/delete participants, list/create/update items, access auth endpoints
- Guest CAN: access invite route, health endpoint, `/guest/` and `/invite/` paths (no JWT required)
- No auth at all: rejected on all protected routes

#### Step 2: Guest Endpoints (Done — v1.14.0, issue #98)

**Goal:** Implement guest interaction endpoints via invite token URL.

**Approach:** Rather than `/guest/*` routes with `X-Invite-Token` header, guest endpoints use the invite token in the URL path (`/plans/:planId/invite/:inviteToken/...`). This aligns with how the FE invite page already works — the token is in the URL, not a header.

**Done:**
- `GET /plans/:planId/invite/:inviteToken` — Extended response with `myParticipantId`, `myRsvpStatus`, `myPreferences` (identity + RSVP + preferences for the token's participant)
- `PATCH /plans/:planId/invite/:inviteToken/preferences` — Now accepts `rsvpStatus` (confirmed | not_sure) in request body alongside existing preference fields
- `POST /plans/:planId/invite/:inviteToken/items` — Create item auto-assigned to the token's participant. Equipment defaults to pcs; food requires unit.
- `PATCH /plans/:planId/invite/:inviteToken/items/:itemId` — Update an item. Returns 403 if item is not assigned to the token's participant.
- 26 new integration tests (49 total for invite routes)

**Remaining from original plan (deferred):**
- `POST /guest/items/:itemId/assign` — Self-assign to unassigned item
- `POST /guest/items/:itemId/unassign` — Self-unassign from own item

#### Step 3: Claim + Signed-Up Preferences 🔄

**Goal:** Let a registered user (JWT) claim a participant record and manage per-plan preferences.

**Claim endpoint: Done (v1.12.0)**

- `POST /plans/:planId/claim/:inviteToken` — Link JWT user to participant record. Validates: token exists, participant not already linked, user not already in plan. Sets `participants.userId = jwt.sub`, `inviteStatus = 'accepted'`. Pre-fills empty participant preferences from `user_details` defaults if available. Idempotent — re-claiming by the same user returns 200.
- 13 integration tests: happy path, plan list visibility after claim, idempotency, preference pre-fill, preference preservation, auth errors (no JWT, expired JWT, wrong key), invalid token, cross-plan token, already claimed by other, user already in plan, owner self-claim.
- Added `inviteStatus` to Participant response schema.

**Remaining:**
- Endpoint for signed-up participants to update their own per-plan preferences via JWT (same fields as guest preferences, but authenticated via JWT instead of invite token).

#### Step 4: Invite Route Reduction (BREAKING)

**Goal:** Reduce the data returned by `GET /plans/:planId/invite/:inviteToken` to minimal landing page data only (plan title, owner displayName). Full plan data moves to `GET /guest/plan`.

**This is a BREAKING CHANGE.** The FE must be updated to use `GET /guest/plan` before this step is deployed.

Migration plan:
1. FE switches to `GET /guest/plan` for full plan data
2. BE deploys Step 4 — invite route returns only `{ planId, title, ownerDisplayName }`
3. The invite route becomes a "landing page" endpoint — guest sees plan title and enters via `/guest/*` routes

### Phase 5: ~~Claim-Via-Invite~~ → Merged into Phase 3 Step 3

> Merged with Phase 3 Step 3 above.

### Phase 6: Response Filtering (Read Access Control)

**Goal:** Different auth types see different data.

- Modify `GET /plans/:planId`: check JWT → full data if authorized; 401 if not
- Modify `GET /plans/:planId/participants`: filter PII based on auth
- Modify `GET /plans`: return only user's plans (where they're owner or linked participant)
- Write integration tests for each access pattern (owner, participant, guest, anonymous)

**Risk:** Medium. Changes existing behavior — routes that were public become restricted.

### Phase 7: Edit Permissions (JWT Users)

**Goal:** Enforce who can edit what for JWT-authenticated users (owner + linked participants). Guest edit permissions are handled in Phase 3 Step 2 via `/guest/*` routes.

- `PATCH /items/:itemId`: owner can edit any; linked participant can edit only own assigned
- `DELETE /items/:itemId`: owner only
- `POST /plans/:planId/items`: owner + linked participants
- Participant CRUD (`POST`, `PATCH`, `DELETE`): owner only
- Linked participants can self-assign/unassign items (same logic as guest, but via JWT)
- Write integration tests for each permission boundary

**Risk:** Medium. Changes write behavior. Must coordinate with FE to handle 403 responses.

### Phase 8: Remove API Key ✅

**Status:** Done. Version 1.14.1.

**Goal:** Every protected route requires JWT. Remove the API key entirely.

**Done:**
- Removed `API_KEY` environment variable from Railway, `.env`, `.env.example`
- Removed `API_KEY` from `env.ts` schema and `config.ts`
- Removed the global `onRequest` API key check from `app.ts`
- Added per-route `onRequest` JWT enforcement hooks to `items.route.ts`, `participants.route.ts`, and `plans.route.ts`
- Removed `apiKey` option from `BuildAppOptions` (test DI)
- Updated all tests to use JWT instead of `x-api-key` header
- Removed deprecated `POST /plans` (no owner) and promoted `POST /plans/with-owner` to `POST /plans` (closes #61)
- Removed `CreatePlanBodyLegacy` schema

> **Note:** Phase 8 was implemented before Phases 6 and 7 because the FE was already using JWT for all requests. Phases 6 and 7 (response filtering and fine-grained edit permissions) remain pending and will build on the JWT-only auth model.

---

## 11. Open Questions

| # | Question | Impact | When to Decide |
|---|----------|--------|----------------|
| 1 | ~~What happens to unregistered plan owners after auth enforcement?~~ **Decided:** All plan creation now requires JWT (Phase 8 done). Unregistered owners no longer supported. | Phase 8 | Decided |
| 2 | Should `GET /plans` (list all plans) require auth? Currently returns all plans to anyone with JWT. | Phase 6 | Before Phase 6 |
| 3 | ~~When should the API key be deprecated?~~ **Done:** API key removed in Phase 8 (v1.14.1). See Section 5.4. | Phase 8 | Done |
| 4 | Should a registered user be able to "unclaim" a participant spot? | Phase 3 Step 3 | Before Step 3 |
| 5 | If a participant is linked to a user, should editing their profile (displayName) auto-update the participant's displayName? Or keep them separate? | Phase 3 Step 3 | Before Step 3 |
| 6 | ~~Should plan `visibility` field (public/invite_only/private) be enforced now, or deferred?~~ **Decided:** Enforcing now in Phase 2.5. Authenticated plan creation defaults to `invite_only`. | Phase 2.5 | Decided |
| 7 | ~~Twilio sandbox vs production~~ **Deferred:** WhatsApp OTP not implemented. If added later, start with sandbox for dev. | — | Deferred |
| 8 | ~~Code resend cooldown~~ **Deferred:** No OTP implementation. | — | Deferred |
| 9 | ~~WhatsApp message template~~ **Deferred:** No OTP implementation. | — | Deferred |
| 10 | Should the invite link landing page (pre-guest-access) show any plan info beyond title and owner name? | Phase 3 Step 4 | Before Step 4 |
| 11 | Review `guest_profiles` table role: per-plan preferences now live on `participants`, guest identity (name, phone) is also on `participants`. What remaining purpose does `guest_profiles` serve? Options: (a) cross-plan guest identity lookup by phone, (b) historical record before sign-up, (c) deprecated — remove in cleanup. | Phase 3 Step 2 | Before Step 2 |
| 12 | Should invite tokens be revocable/regeneratable by the owner? If compromised, the owner should be able to invalidate the old token and generate a new one. | Phase 3 Step 2+ | Before production launch |

---

## 12. Migration Strategy

Since all new columns are nullable (or have safe defaults) and all new tables are additive:

1. ~~Deploy schema changes (Phase 1)~~ — Done (PR #76)
2. ~~Deploy opportunistic user tracking (Phase 1.5)~~ — Done (PR #80)
3. ~~Deploy profile endpoints + security hardening (Phase 2)~~ — Done (PR #81)
4. ~~Deploy plan ownership + access control (Phase 2.5)~~ — Done (PR #84)
5. ~~Deploy guest auth plugin + DB migration (Phase 3 Step 1)~~ — Done (v1.11.0)
6. ~~Deploy guest endpoints (Phase 3 Step 2)~~ — Done (v1.14.0, issue #98). **FE: run `npm run api:sync` to update schemas**
7. Deploy claim + signed-up preferences (Phase 3 Step 3) — Claim endpoint done (v1.12.0). **FE: claim flow after sign-up.** JWT preferences endpoint remaining.
8. Deploy invite route reduction (Phase 3 Step 4) — **BREAKING: FE must use /guest/plan first**
9. Deploy response filtering enhancements (Phase 6)
10. Deploy edit permissions (Phase 7) — FE must handle 403s by this point
11. ~~Remove API key entirely (Phase 8)~~ — Done (v1.14.1). JWT enforced on all routes. Deprecated `POST /plans` removed, `POST /plans/with-owner` promoted to `POST /plans`.

Each step is a separate PR with its own tests.
