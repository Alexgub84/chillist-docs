# User & Participant Management — Spec

> **Status:** In Progress (Phase 2.5 Step A done)
> **Last updated:** 2026-02-24
> **Depends on:** Supabase Auth (done), existing plans/participants/items schema

---

## 1. Overview

Add user identity, participant linking, guest verification, and access control to Chillist. Currently all plans and participants are public — anyone with an API key can read/write everything. This spec introduces:

- **Registered users** (profiles linked to Supabase Auth)
- **WhatsApp phone verification** for guests (OTP via Twilio)
- **Guest sessions** (30-minute verified access)
- **First-time guest onboarding** (group size, food preferences, allergies)
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

### 2.4 Plan Creation: Open to All (For Now)

Anyone can create plans, with or without a JWT. This preserves current behavior. If the creator is logged in, their `userId` is recorded on the plan. If not, the plan has no linked user.

This may change in the future (require auth for plan creation), but is not part of this spec.

### 2.5 PII Stripping: Always on the BE

**PII is always stripped on the BE, never on the FE.** The BE removes PII fields from the response before sending. Guests never receive this data — not even in the raw JSON. This prevents PII from being visible in the browser Network tab or client-side logs.

### 2.6 WhatsApp Verification via Twilio

Guests verify phone ownership via a 6-digit OTP code sent over WhatsApp using the Twilio WhatsApp Business API.

**Why Twilio:**
- Most developer-friendly WhatsApp BSP (Business Solution Provider)
- Well-documented Node.js SDK
- Pay-per-message, no monthly minimums
- Handles WhatsApp message template approval with Meta
- Sandbox mode for development/testing (no Meta approval needed)

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
- Registered participants can see full plan details but only edit their own assigned items

Three participant states:

| State | `userId` | Description |
|-------|----------|-------------|
| Unlinked | null | Owner added them by name/phone. No user account. |
| Linked | set | A registered user claimed this participant spot. |
| Owner | set or null | The plan creator. Has `role: 'owner'`. May or may not be registered. |

### 3.3 Guest

Not a database entity. A guest is someone accessing a plan via an invite link who verifies their phone via WhatsApp OTP.

- Must verify phone ownership before seeing any plan data (WhatsApp OTP code)
- Gets a 30-minute session after verification; must re-verify when session expires
- First time only: sees an onboarding page to provide group details and dietary info
- Sees plan details and items but only `displayName` and `role` for participants (no full names, phones, or emails)
- Cannot edit anything

---

## 4. Schema Changes

> **Architecture Adaptation (2026-02-22):** The original spec called for a `profiles` table storing email, display_name, and avatar_url locally. Per the PII separation decision, this was replaced by `user_details` (app-specific preferences only). Supabase is the single PII store — Railway DB stores only opaque Supabase UUIDs as references. See [dev-lessons: PII Separation](../dev-lessons/backend.md).
>
> Other adaptations:
> - Onboarding columns (`adultsCount`, `kidsCount`, `foodPreferences`, `allergies`) are on `guest_profiles` table, not on `participants`
> - `plan_invites` table was added (not in original spec) for invite tracking with hashed tokens
> - `participants.userId` has no FK to a local profiles table — it's a plain UUID reference to Supabase

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

### 4.2 New Table: `verification_codes`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT random | |
| `participant_id` | UUID | FK → `participants.participant_id`, CASCADE delete | |
| `code` | VARCHAR(6) | NOT NULL | 6-digit numeric OTP |
| `expires_at` | TIMESTAMPTZ | NOT NULL | 10 minutes from creation |
| `attempts` | INTEGER | NOT NULL, DEFAULT 0 | Brute-force protection (max 5) |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

Notes:
- One active code per participant at a time (old codes deleted on new request)
- After 5 failed attempts the code is invalidated
- Expired codes cleaned up on query or periodically

### 4.3 New Table: `guest_sessions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `session_token` | VARCHAR(64) | PK | Random hex (`randomBytes(32)`) |
| `participant_id` | UUID | FK → `participants.participant_id`, CASCADE delete | |
| `plan_id` | UUID | FK → `plans.plan_id`, CASCADE delete | |
| `expires_at` | TIMESTAMPTZ | NOT NULL | 30 minutes from creation |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

Notes:
- DB-backed sessions (not JWT) — easy to revoke, clean up, and track
- After 30 minutes, guest must re-verify via WhatsApp OTP
- Expired sessions cleaned up on query or periodically

### 4.4 Modified Table: `participants`

New columns (actually implemented):

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | UUID | nullable (no FK — plain Supabase UUID reference) | Set when a registered user claims this participant spot |
| `guest_profile_id` | UUID | nullable, FK → `guest_profiles.guest_id` | Links to guest profile for unregistered participants |
| `invite_status` | ENUM | NOT NULL, DEFAULT 'pending' | 'pending' / 'invited' / 'accepted' |

> **Adaptation:** Onboarding columns (`adultsCount`, `kidsCount`, `foodPreferences`, `allergies`, `onboardingCompleted`) are on the `guest_profiles` table, not on `participants`. This keeps participant records clean and lets guest profile data be shared or deleted independently.

- Existing columns unchanged (`name`, `lastName`, `contactPhone`, `contactEmail`, `displayName`, `role`, `inviteToken`, etc.)
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
plans    1 ←──── * guest_sessions       (via guest_sessions.plan_id)
participants 1 ←──── * verification_codes (via verification_codes.participant_id)
participants 1 ←──── * guest_sessions     (via guest_sessions.participant_id)
```

### 4.7 Entity Diagram

```
┌─────────────┐         ┌──────────────────┐         ┌──────────┐
│  profiles    │         │   participants   │         │  items   │
├─────────────┤    ┌────►├──────────────────┤    ┌───►├──────────┤
│ user_id (PK)│◄───┤    │ participant_id   │    │   │ item_id  │
│ email       │    │    │ plan_id (FK)     │────┤   │ plan_id  │
│ display_name│    │    │ user_id (FK)     │    │   │ assigned_│
│ avatar_url  │    │    │ name             │    │   │  particip│
│ created_at  │    │    │ last_name        │    │   │  ant_id  │
│ updated_at  │    │    │ contact_phone    │    │   │ name     │
└─────────────┘    │    │ display_name     │    │   │ category │
                   │    │ role             │    │   │ status   │
                   │    │ invite_token     │    │   │ ...      │
                   │    │ adults_count     │    │   └──────────┘
                   │    │ kids_count       │    │
                   │    │ food_preferences │    │
                   │    │ allergies        │    │
                   │    │ onboarding_      │    │
                   │    │   completed      │    │
                   │    │ ...              │    │
                   │    └────────┬─────────┘    │
                   │             │              │
                   │             ▼              │
                   │    ┌──────────────────┐    │
                   │    │ verification_    │    │
                   │    │   codes          │    │
                   │    ├──────────────────┤    │
                   │    │ id (PK)          │    │
                   │    │ participant_id   │    │
                   │    │ code             │    │
                   │    │ expires_at       │    │
                   │    │ attempts         │    │
                   │    └──────────────────┘    │
                   │                            │
                   │    ┌──────────────────┐    │
                   │    │ guest_sessions   │    │
                   │    ├──────────────────┤    │
                   │    │ session_token(PK)│    │
                   │    │ participant_id   │    │
                   │    │ plan_id          │────┘
                   │    │ expires_at       │
                   │    └──────────────────┘
                   │
                   │    ┌──────────────────┐
                   │    │     plans        │
                   └────┤──────────────────┤
                        │ plan_id (PK)     │
                        │ created_by_      │
                        │   user_id (FK)   │
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

| Accessor | Auth Method | Sees Plan + Items | Sees Participant PII | Can Add Items | Can Edit Items | Can Manage Participants |
|----------|-----------|-------------------|---------------------|---------------|---------------|------------------------|
| Owner (registered) | JWT | Yes | Yes | Yes | All items | Yes |
| Owner (unregistered) | API key (legacy) | Yes | Yes | Yes | All items | Yes |
| Participant (linked) | JWT | Yes | Yes | Yes | Own assigned only | No |
| Guest (verified) | X-Guest-Token | Yes | displayName + role only | No | No | No |
| Guest (unverified) | Invite token in URL | Plan title + owner displayName only | No | No | No | No |
| Anonymous | None | No (401) | No | No | No | No |

### 5.2 PII Fields (Hidden from Guests)

These fields are stripped from participant data when responding to guest requests:

- `name` (first name)
- `lastName`
- `contactPhone`
- `contactEmail`

Guests only see: `participantId`, `displayName`, `role`

The existing invite route (`GET /plans/:planId/invite/:inviteToken`) already implements this filtering pattern — reuse the same logic for all guest-level responses.

### 5.3 Auth Detection in Route Handlers

Each protected route checks auth in this order:

1. **JWT present** (`Authorization: Bearer`, `request.user` is set) → registered user flow (look up relationship to plan: owner? linked participant? unrelated?)
2. **Guest session present** (`X-Guest-Token` header) → look up in `guest_sessions` table, check not expired → verified guest flow
3. **Invite token in URL** → landing page / verification flow only (minimal plan info, no full data)
4. **Neither** → 401 Unauthorized

The API key remains as a legacy fallback during transition and will be deprecated later.

---

## 6. Key Flows

### 6.1 WhatsApp Phone Verification (Guest)

```
Owner creates plan, adds participant with phone number
  → Participant gets an inviteToken (existing behavior)

Owner shares invite link manually (e.g., pastes in WhatsApp chat)

Guest opens invite link → FE shows landing page (plan title, owner name)
  → FE calls: POST /invite/:inviteToken/request-code
  → BE validates inviteToken, finds participant's contactPhone
  → BE generates 6-digit code, stores in verification_codes (10 min TTL)
  → BE sends code via Twilio WhatsApp API to contactPhone
  → BE returns: { message: "Code sent", expiresInSeconds: 600 }

Guest receives WhatsApp message: "Your Chillist code: 123456"
  → Guest enters code on FE
  → FE calls: POST /invite/:inviteToken/verify-code { code: "123456" }
  → BE validates: code matches, not expired, attempts < 5
  → BE creates guest_session (random token, 30 min TTL)
  → BE deletes used verification code
  → BE returns: { sessionToken, participantId, planId, onboardingCompleted }

FE stores sessionToken, uses X-Guest-Token header for subsequent requests
After 30 minutes → token expires → guest must re-verify
```

### 6.2 Guest Onboarding (First Time Only)

```
After successful phone verification, if onboardingCompleted = false:
  → FE shows onboarding form:
    - Display name (optional update)
    - How many adults in their group
    - How many kids in their group
    - Food preferences (free text)
    - Allergies (free text)
  → FE calls: POST /guest/onboarding (X-Guest-Token header)
    Body: { displayName?, adultsCount, kidsCount, foodPreferences?, allergies? }
  → BE updates participant record, sets onboardingCompleted = true
  → BE returns: updated participant data

On subsequent visits (after re-verification):
  → onboardingCompleted = true → skip onboarding, go straight to plan view
```

Onboarding data is **per-plan** — a guest can have different group sizes and dietary needs for different trips. If the guest later registers as a user and claims their participant spot, this data is preserved and remains editable.

### 6.3 Guest Plan Access (Verified)

```
Verified guest with active session:
  → FE calls: GET /guest/plan (X-Guest-Token header)
  → BE looks up guest_session, checks not expired
  → BE returns: plan + items + sanitized participants (displayName + role only)
```

### 6.4 Profile Auto-Provisioning (Registered User)

```
User sends request with valid JWT
  → auth plugin verifies JWT, sets request.user = { id, email, role }
  → profile middleware checks: does profiles row exist for request.user.id?
    → NO:  INSERT INTO profiles (user_id, email) VALUES (jwt.sub, jwt.email)
    → YES: continue
  → request.profile is set (or just use request.user.id for queries)
```

This happens transparently on every authenticated request. No explicit "create profile" step for the user.

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

### 7.1 New Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/invite/:inviteToken/request-code` | None (rate-limited) | Send WhatsApp OTP to participant's phone |
| POST | `/invite/:inviteToken/verify-code` | None (rate-limited) | Validate OTP, issue guest session token |
| POST | `/guest/onboarding` | X-Guest-Token | Submit onboarding data (first time) |
| GET | `/guest/plan` | X-Guest-Token | Get plan data (sanitized, guest view) |
| GET | `/auth/profile` | JWT required | Get current user's profile |
| PATCH | `/auth/profile` | JWT required | Update display name, avatar |
| POST | `/plans/:planId/claim/:inviteToken` | JWT required | Link authenticated user to participant |

### 7.2 Modified Endpoints (Access Control Added)

| Endpoint | Change |
|----------|--------|
| `GET /plans/:planId` | Check JWT → return full data if owner/linked participant; 401 if no auth |
| `GET /plans/:planId/participants` | Check JWT → return full PII if owner/linked participant; 401 if no auth |
| `GET /plans/:planId/invite/:inviteToken` | Now returns **minimal data only** (plan title, owner displayName) — acts as landing page before verification |
| `PATCH /items/:itemId` | Check JWT → owner can edit any item; linked participant can only edit own assigned items |
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
| `POST /plans` / `POST /plans/with-owner` | Open to all (decision: plan creation stays public) |

### 7.4 New Endpoint Details

**`POST /invite/:inviteToken/request-code`**
- Auth: None (public, rate-limited: 3 requests per token per hour)
- Action: Validates invite token, generates 6-digit code, stores in `verification_codes`, sends via Twilio WhatsApp to participant's `contactPhone`
- Response: `{ message: "Code sent", expiresInSeconds: 600 }`
- Errors: 404 (invalid token), 429 (too many requests)

**`POST /invite/:inviteToken/verify-code`**
- Auth: None (public, rate-limited)
- Body: `{ code: "123456" }`
- Action: Validates code (max 5 attempts, 10 min expiry), creates guest session (30 min TTL), deletes used code
- Response: `{ sessionToken, participantId, planId, onboardingCompleted }`
- Errors: 400 (wrong code), 404 (invalid token/expired code), 429 (max attempts exceeded)

**`POST /guest/onboarding`**
- Auth: `X-Guest-Token` header required
- Body: `{ displayName?, adultsCount, kidsCount, foodPreferences?, allergies? }`
- Action: Updates participant record, sets `onboardingCompleted = true`
- Response: Updated participant (sanitized — own data only, no other participants' PII)

**`GET /guest/plan`**
- Auth: `X-Guest-Token` header required
- Action: Returns plan + items + sanitized participants (displayName + role only)
- Response: Same shape as current invite route response, but authenticated via guest session

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
| Auth | JWT via Supabase JWKS + API key fallback | Done (being enhanced) |
| CORS | Restricted to `FRONTEND_URL` in production | Done |
| Credential storage | DB password in Railway env vars only, JWT verified via public keys | Done |
| Rate limiting | `@fastify/rate-limit` — 100 req/min global, 10 req/min on auth endpoints | Done (Phase 2) |
| Security headers | `@fastify/helmet` — X-Content-Type-Options, HSTS, X-Frame-Options, etc. | Done (Phase 2) |
| Request size | Fastify default 1MB body limit | Done (default) |
| OTP brute-force | Max 5 attempts per code, 10 min code expiry, 3 requests/hour per token | To add (Phase 3) |

### 8.3 Security Hardening Tasks (Phase 2)

Add these two Fastify plugins as part of Phase 2 (profile provisioning), since that's when auth-dependent routes start appearing:

1. **`@fastify/rate-limit`** — protect against brute-force and DDoS. Apply stricter limits to auth, claim, and verification endpoints (e.g., 10 req/min) vs general routes (e.g., 100 req/min).
2. **`@fastify/helmet`** — standard HTTP security headers. Default config is sufficient.

---

## 9. Dependencies and Environment

### 9.1 New Dependencies

| Package | Purpose | Status |
|---------|---------|--------|
| `twilio` | WhatsApp Business API — send OTP codes via WhatsApp | Not yet added |
| `@fastify/rate-limit` | Rate limiting per IP/route (100 req/min global, 10 req/min auth) | Done (v10.3.0) |
| `@fastify/helmet` | HTTP security headers | Done (v13.0.2) |

### 9.2 New Environment Variables

| Variable | Description | Where |
|----------|-------------|-------|
| `TWILIO_ACCOUNT_SID` | Twilio account identifier | Railway env + `.env` |
| `TWILIO_AUTH_TOKEN` | Twilio auth secret | Railway secrets |
| `TWILIO_WHATSAPP_FROM` | Twilio WhatsApp sender number (e.g., `whatsapp:+14155238886`) | Railway env + `.env` |

### 9.3 Twilio Setup

1. Create a Twilio account
2. Enable WhatsApp sandbox for development (no Meta approval needed — only pre-registered numbers can receive messages)
3. For production: register a WhatsApp Business sender number and submit an OTP message template for Meta approval (OTP templates are fast-tracked)
4. Twilio service module uses DI pattern — tests inject a mock Twilio client (no real WhatsApp messages in tests)

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

NOT yet added (deferred to when needed):
- `verification_codes` table (needed for Phase 3: WhatsApp verification)
- `guest_sessions` table (needed for Phase 3: guest sessions)

### Phase 1.5: Opportunistic User Tracking ✅

**Status:** Done. PR #80.

**Goal:** Record Supabase user ID on plans/participants when JWT is present. No enforcement.

- `POST /plans/with-owner` sets `createdByUserId` and owner `userId` from `request.user?.id`
- No route requires JWT — API key still works for everything
- If no JWT present, fields remain null

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

### Phase 2.5: Plan Ownership + Access Control 🔄

**Goal:** Enforce `visibility` field on plans. Authenticated plan creation defaults to `unlisted`. Only owner/linked participants can read non-public plans.

**Step A — Core access control: Done (PR #84)**

- `POST /plans/with-owner` with JWT defaults `visibility` to `unlisted`
- `checkPlanAccess()` utility in `src/utils/plan-access.ts`: checks visibility + user relationship (owner via `createdByUserId`, participant via `participants.userId`)
- `GET /plans/:planId` enforces access control (returns 404 for unauthorized access to non-public plans — same response as nonexistent plan to prevent information leakage)
- 17 integration tests: visibility defaults, owner/participant/viewer access, expired JWT, orphaned plans, response shape identity, invite route compatibility
- Version 1.7.0

**Step B — Extended protection: Next**

- `GET /plans` filters by user's plans + public plans
- `GET /plans/:planId/participants` and `GET /plans/:planId/items` enforce plan access
- Invite route unchanged — still the guest access path with PII stripping
- Additional integration tests

### Phase 3: WhatsApp Verification + Guest Sessions

**Goal:** Guests can verify phone ownership and get a time-limited session.

- Add Twilio service module (with DI — tests inject mock)
- Add `POST /invite/:inviteToken/request-code` endpoint (send WhatsApp OTP)
- Add `POST /invite/:inviteToken/verify-code` endpoint (validate OTP, create guest session)
- Add guest session validation middleware (checks `X-Guest-Token` header, looks up in DB)
- Implement code expiry (10 min) and attempt limits (max 5)
- Implement session expiry (30 min)
- Add expired code/session cleanup (on-query deletion of expired rows)
- Write integration tests with mocked Twilio (send code, verify code, wrong code, expired code, max attempts, expired session)

**Risk:** Medium. Introduces external dependency (Twilio). Requires Twilio account setup and WhatsApp sandbox for dev.

### Phase 4: Guest Onboarding

**Goal:** First-time verified guests fill in group details and dietary info.

- Add `POST /guest/onboarding` endpoint (requires X-Guest-Token)
- Add `GET /guest/plan` endpoint (requires X-Guest-Token, returns sanitized plan data)
- Modify `GET /plans/:planId/invite/:inviteToken` to return minimal data only (plan title, owner displayName — landing page before verification)
- Write integration tests (onboarding submit, skip on repeat visit, plan access with/without session)

**Risk:** Low. New endpoints only. Modifies one existing endpoint (invite route returns less data).

### Phase 5: Claim-Via-Invite (Registered Users)

**Goal:** Registered users can link themselves to participant records.

- Add `POST /plans/:planId/claim/:inviteToken` endpoint
- Validation: token valid, participant not already linked to another user, user not already in this plan
- On success: set `participants.userId = jwt.sub`
- Write integration tests (happy path, already claimed, duplicate user, invalid token)

**Risk:** Low. New endpoint only. Existing invite flow unchanged.

### Phase 6: Response Filtering (Read Access Control)

**Goal:** Different auth types see different data.

- Modify `GET /plans/:planId`: check JWT → full data if authorized; 401 if not
- Modify `GET /plans/:planId/participants`: filter PII based on auth
- Modify `GET /plans`: return only user's plans (where they're owner or linked participant)
- Keep API key as legacy fallback (full access) during transition
- Write integration tests for each access pattern (owner, participant, guest, anonymous)

**Risk:** Medium. Changes existing behavior — routes that were public become restricted. Must keep API key fallback to avoid breaking existing FE until FE is updated.

### Phase 7: Edit Permissions

**Goal:** Enforce who can edit what.

- `PATCH /items/:itemId`: owner can edit any; linked participant can edit only own assigned
- `DELETE /items/:itemId`: owner only
- `POST /plans/:planId/items`: owner + linked participants
- Participant CRUD (`POST`, `PATCH`, `DELETE`): owner only
- Write integration tests for each permission boundary

**Risk:** Medium. Changes write behavior. Must coordinate with FE to handle 403 responses.

---

## 11. Open Questions

| # | Question | Impact | When to Decide |
|---|----------|--------|----------------|
| 1 | What happens to unregistered plan owners after auth enforcement? They can't use API key forever. Should they get an owner-specific invite token? Or must they sign up? | Phase 6 | Before Phase 6 |
| 2 | Should `GET /plans` (list all plans) require auth? Currently returns all plans to anyone. | Phase 6 | Before Phase 6 |
| 3 | When should the API key be deprecated? It's a blanket bypass of all permissions. | Phase 6-7 | After FE fully uses JWT |
| 4 | Should a registered user be able to "unclaim" a participant spot? | Phase 5 | Before Phase 5 |
| 5 | If a participant is linked to a user, should editing their profile (displayName) auto-update the participant's displayName? Or keep them separate? | Phase 2-5 | Before Phase 5 |
| 6 | ~~Should plan `visibility` field (public/unlisted/private) be enforced now, or deferred?~~ **Decided:** Enforcing now in Phase 2.5. Authenticated plan creation defaults to `unlisted`. | Phase 2.5 | Decided |
| 7 | Twilio sandbox vs production: start with sandbox for dev (only pre-registered numbers)? When to get Meta approval for production WhatsApp? | Phase 3 | Before Phase 3 |
| 8 | Code resend cooldown: how long before allowing a resend? Suggested: 60 seconds. | Phase 3 | Before Phase 3 |
| 9 | WhatsApp message template: what text? OTP templates are fast-tracked by Meta. Suggested: "Your Chillist verification code is: {{1}}. It expires in 10 minutes." | Phase 3 | Before Phase 3 |
| 10 | Should the invite link landing page (pre-verification) show any plan info beyond title and owner name? | Phase 4 | Before Phase 4 |

---

## 12. Migration Strategy

Since all new columns are nullable (or have safe defaults) and all new tables are additive:

1. ~~Deploy schema changes (Phase 1)~~ — Done (PR #76)
2. ~~Deploy opportunistic user tracking (Phase 1.5)~~ — Done (PR #80)
3. ~~Deploy profile endpoints + security hardening (Phase 2)~~ — Done (PR #81)
4. Deploy plan ownership + access control (Phase 2.5) — **Step A done (PR #84), Step B next**
5. Deploy WhatsApp verification + guest sessions (Phase 3)
6. Deploy guest onboarding (Phase 4)
7. Deploy claim endpoint (Phase 5)
8. Deploy response filtering enhancements (Phase 6) with API key fallback
9. Deploy edit permissions (Phase 7) — FE must handle 403s by this point
10. Remove API key fallback — once FE fully uses JWT

Each phase is a separate PR with its own tests. No phase depends on the FE being updated (except Phase 7 which needs FE to handle 403 errors gracefully).
