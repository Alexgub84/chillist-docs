# User & Participant Management — Spec

> **Status:** Planning
> **Last updated:** 2026-02-18
> **Depends on:** Supabase Auth (Phase 2 done), existing plans/participants/items schema

---

## 1. Overview

Add user identity, participant linking, and access control to Chillist. Currently all plans and participants are public — anyone with an API key can read/write everything. This spec introduces:

- **Registered users** (profiles linked to Supabase Auth)
- **Guest access** (invite token, limited view)
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

### 2.2 Authorization: Application-Level (Not RLS)

Authorization is enforced in Fastify route handlers, not via PostgreSQL Row-Level Security.

**Why:**
- The existing BE architecture (Drizzle ORM + Fastify routes + DI) is well-established with tests and CI/CD
- RLS would require either adopting the Supabase client on BE or passing JWT context to DB — both are architectural rewrites
- Application-level auth is straightforward: check `request.user`, query DB, filter response
- Easier to test (inject mock users in integration tests)

### 2.3 Database: Keep Railway PostgreSQL

All tables (including the new `profiles` table) stay in the existing Railway PostgreSQL instance.

**Why:**
- There is currently ONE database (Railway PostgreSQL). Supabase is only used for auth tokens — no data lives in Supabase's DB
- Adding a `profiles` table to Railway PostgreSQL does not create "two databases"
- PII protection comes from authorization logic in route handlers, not from which PostgreSQL instance hosts the data
- No migration effort, no deployment changes, no Supabase DB vendor lock-in

### 2.4 Plan Creation: Open to All (For Now)

Anyone can create plans, with or without a JWT. This preserves current behavior. If the creator is logged in, their `userId` is recorded on the plan. If not, the plan has no linked user.

This may change in the future (require auth for plan creation), but is not part of this spec.

---

## 3. Terms and Roles

### 3.1 User (Registered)

A person who signed up via Supabase Auth (email/password or Google OAuth).

- Represented by a `profiles` row in our DB, linked to Supabase `auth.users.id`
- Profile is auto-created on first authenticated request to the BE
- Can create plans, claim participant spots, see full PII, edit assigned items

### 3.2 Participant

A per-plan entity representing someone involved in the plan.

- Created by the plan owner (name, phone, etc.)
- Exists independently of user accounts — most participants won't have accounts
- Has a nullable `userId` that links to a `profiles` row when claimed
- Has an `inviteToken` for sharing access

Three participant states:

| State | `userId` | Description |
|-------|----------|-------------|
| Unlinked | null | Owner added them by name/phone. No user account. |
| Linked | set | A registered user claimed this participant spot. |
| Owner | set or null | The plan creator. Has `role: 'owner'`. May or may not be registered. |

### 3.3 Guest

Not a database entity. A guest is anyone accessing a plan via an invite token without a valid JWT.

- Sees plan details and items
- Sees only `displayName` and `role` for participants (no full names, no phones, no emails)
- Cannot edit anything

---

## 4. Schema Changes

### 4.1 New Table: `profiles`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | UUID | PK | Matches Supabase `auth.users.id` |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | From JWT claims |
| `display_name` | VARCHAR(255) | nullable | User-chosen display name |
| `avatar_url` | TEXT | nullable | From OAuth provider or upload |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

Notes:
- `user_id` is NOT auto-generated — it comes from Supabase's `auth.users.id` (the JWT `sub` claim)
- No password or credential fields — Supabase owns authentication
- Lightweight: only app-specific profile metadata

### 4.2 Modified Table: `participants`

Add one column:

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | UUID | nullable, FK → `profiles.user_id` | Set when a registered user claims this participant spot |

- Existing columns unchanged (`name`, `lastName`, `contactPhone`, `contactEmail`, `displayName`, `role`, `inviteToken`, etc.)
- PII stays on the participant row regardless of linking — this is plan-specific data the owner entered
- When `userId` is set, the participant is "linked" to a registered user

### 4.3 Modified Table: `plans`

Add one column:

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `created_by_user_id` | UUID | nullable, FK → `profiles.user_id` | The registered user who created this plan (null if created anonymously) |

- Separate from `owner_participant_id` (which is a participant, not a user)
- Populated automatically if the plan creator has a valid JWT

### 4.4 Relations

```
profiles 1 ←──── * participants  (via participants.user_id)
profiles 1 ←──── * plans         (via plans.created_by_user_id)
plans    1 ←──── * participants  (existing, via participants.plan_id)
plans    1 ←──── * items         (existing, via items.plan_id)
```

### 4.5 Entity Diagram

```
┌─────────────┐         ┌──────────────┐         ┌──────────┐
│  profiles    │         │ participants │         │  items   │
├─────────────┤    ┌────►├──────────────┤    ┌───►├──────────┤
│ user_id (PK)│◄───┤    │ participant_ │    │   │ item_id  │
│ email       │    │    │   id (PK)    │    │   │ plan_id  │
│ display_name│    │    │ plan_id (FK) │────┤   │ assigned_│
│ avatar_url  │    │    │ user_id (FK) │    │   │  particip│
│ created_at  │    │    │ name         │    │   │  ant_id  │
│ updated_at  │    │    │ last_name    │    │   │ name     │
└─────────────┘    │    │ contact_phone│    │   │ category │
                   │    │ display_name │    │   │ status   │
                   │    │ role         │    │   │ ...      │
                   │    │ invite_token │    │   └──────────┘
                   │    │ ...          │    │
                   │    └──────────────┘    │
                   │                        │
                   │    ┌──────────────┐    │
                   │    │    plans     │    │
                   └────┤──────────────┤    │
                        │ plan_id (PK) │────┘
                        │ created_by_  │
                        │   user_id(FK)│
                        │ owner_partic │
                        │   ipant_id   │
                        │ title        │
                        │ status       │
                        │ visibility   │
                        │ ...          │
                        └──────────────┘
```

---

## 5. Access Control

### 5.1 Access Matrix

| Accessor | Auth Method | Sees Plan + Items | Sees Participant PII | Can Add Items | Can Edit Items | Can Manage Participants |
|----------|-----------|-------------------|---------------------|---------------|---------------|------------------------|
| Owner (registered) | JWT | Yes | Yes | Yes | All items | Yes |
| Owner (unregistered) | API key (legacy) | Yes | Yes | Yes | All items | Yes |
| Participant (linked) | JWT | Yes | Yes | Yes | Own assigned only | No |
| Guest | Invite token | Yes | displayName + role only | No | No | No |
| Anonymous | None | No (401) | No | No | No | No |

### 5.2 PII Fields (Hidden from Guests)

**PII is always stripped on the BE, never on the FE.** The BE removes PII fields from the response before sending. Guests never receive this data — not even in the raw JSON. This prevents PII from being visible in browser Network tab or client-side logs.

These fields are stripped from participant data when responding to guest requests:

- `name` (first name)
- `lastName`
- `contactPhone`
- `contactEmail`

Guests only see: `participantId`, `displayName`, `role`

The existing invite route (`GET /plans/:planId/invite/:inviteToken`) already implements this pattern — reuse the same filtering logic for all guest-level responses.

### 5.3 Auth Detection in Route Handlers

Each protected route checks auth in this order:

1. **JWT present** (`request.user` is set) → look up the user's relationship to this plan (owner? linked participant? unrelated?)
2. **Invite token present** (query param or URL path) → validate token, return guest-level data
3. **Neither** → 401 Unauthorized

The API key remains as a legacy fallback during transition and will be deprecated later.

---

## 6. Key Flows

### 6.1 Profile Auto-Provisioning

```
User sends request with valid JWT
  → auth plugin verifies JWT, sets request.user = { id, email, role }
  → profile middleware checks: does profiles row exist for request.user.id?
    → NO:  INSERT INTO profiles (user_id, email) VALUES (jwt.sub, jwt.email)
    → YES: continue
  → request.profile is set (or just use request.user.id for queries)
```

This happens transparently on every authenticated request. No explicit "create profile" step for the user.

### 6.2 Claim-Via-Invite (Link User to Participant)

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

### 6.3 Guest Access (Existing, Modified)

```
Guest clicks invite link → no JWT
  → FE calls: GET /plans/:planId/invite/:inviteToken (no auth header)
  → BE validates invite token
  → BE returns: plan + items + sanitized participants (displayName + role only)
```

This is the existing invite route with no changes needed.

### 6.4 Authenticated Plan Access

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
| GET | `/auth/profile` | JWT required | Get current user's profile |
| PATCH | `/auth/profile` | JWT required | Update display name, avatar |
| POST | `/plans/:planId/claim/:inviteToken` | JWT required | Link authenticated user to participant |

### 7.2 Modified Endpoints (Access Control Added)

| Endpoint | Change |
|----------|--------|
| `GET /plans/:planId` | Check JWT → return full data if owner/linked participant; 401 if no auth |
| `GET /plans/:planId/participants` | Check JWT → return full PII if owner/linked participant; 401 if no auth |
| `GET /plans/:planId/invite/:inviteToken` | No change (already returns sanitized data) |
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
| Rate limiting | `@fastify/rate-limit` — limits requests per IP | To add (Phase 2) |
| Security headers | `@fastify/helmet` — X-Content-Type-Options, HSTS, X-Frame-Options, etc. | To add (Phase 2) |
| Request size | Fastify default 1MB body limit | Done (default) |

### 8.3 Security Hardening Tasks (Phase 2)

Add these two Fastify plugins as part of Phase 2 (profile provisioning), since that's when auth-dependent routes start appearing:

1. **`@fastify/rate-limit`** — protect against brute-force and DDoS. Apply stricter limits to auth and claim endpoints (e.g., 10 req/min) vs general routes (e.g., 100 req/min).
2. **`@fastify/helmet`** — standard HTTP security headers. Default config is sufficient.

---

## 9. Implementation Phases

Each phase is independently deployable with no breaking changes.

### Phase 1: Database Schema Changes + Security Verification

**Goal:** Add tables and columns. No behavior changes.

- Add `profiles` table to Drizzle schema
- Add `userId` column (nullable) to `participants` table
- Add `createdByUserId` column (nullable) to `plans` table
- Add Drizzle relations for new FKs
- Generate and run migration
- Update TypeScript types (`Profile`, `NewProfile`)
- Update test helpers with new seed functions

**Risk:** None. All new columns are nullable. Existing code continues to work.

Additionally in this phase:
- Verify Railway Postgres public networking is disabled
- Verify production `DATABASE_URL` uses `RAILWAY_PRIVATE_DOMAIN`

### Phase 2: Profile Auto-Provisioning + Security Hardening

**Goal:** Registered users get a profile row automatically. API endpoints are hardened.

- Add middleware/hook: on authenticated request, upsert `profiles` row
- Add `GET /auth/profile` endpoint
- Add `PATCH /auth/profile` endpoint (update displayName, avatarUrl)
- Add `@fastify/rate-limit` (stricter limits on auth/claim endpoints)
- Add `@fastify/helmet` (security headers)
- Write integration tests (profile creation, retrieval, update)
- Populate `plans.createdByUserId` when a logged-in user creates a plan

**Risk:** Low. Additive behavior. Existing routes unaffected.

### Phase 3: Claim-Via-Invite

**Goal:** Registered users can link themselves to participant records.

- Add `POST /plans/:planId/claim/:inviteToken` endpoint
- Validation: token valid, participant not already linked to another user, user not already in this plan
- On success: set `participants.userId = jwt.sub`
- Write integration tests (happy path, already claimed, duplicate user, invalid token)

**Risk:** Low. New endpoint only. Existing invite flow unchanged.

### Phase 4: Response Filtering (Read Access Control)

**Goal:** Different auth types see different data.

- Modify `GET /plans/:planId`: check JWT → full data if authorized; 401 if not
- Modify `GET /plans/:planId/participants`: filter PII based on auth
- Modify `GET /plans` : return only user's plans (where they're owner or linked participant)
- Keep existing `GET /plans/:planId/invite/:inviteToken` as the guest path
- Keep API key as legacy fallback (full access) during transition
- Write integration tests for each access pattern (owner, participant, guest, anonymous)

**Risk:** Medium. This changes existing behavior — routes that were public become restricted. Must keep API key fallback to avoid breaking existing FE until FE is updated.

### Phase 5: Edit Permissions

**Goal:** Enforce who can edit what.

- `PATCH /items/:itemId`: owner can edit any; linked participant can edit only own assigned
- `DELETE /items/:itemId`: owner only
- `POST /plans/:planId/items`: owner + linked participants
- Participant CRUD (`POST`, `PATCH`, `DELETE`): owner only
- Write integration tests for each permission boundary

**Risk:** Medium. Changes write behavior. Must coordinate with FE to handle 403 responses.

---

## 10. Open Questions

| # | Question | Impact | When to Decide |
|---|----------|--------|----------------|
| 1 | What happens to unregistered plan owners after auth enforcement? They can't use API key forever. Should they get an owner-specific invite token? Or must they sign up? | Phase 4 | Before Phase 4 |
| 2 | Should `GET /plans` (list all plans) require auth? Currently returns all plans to anyone. | Phase 4 | Before Phase 4 |
| 3 | When should the API key be deprecated? It's a blanket bypass of all permissions. | Phase 4-5 | After FE fully uses JWT |
| 4 | Should a registered user be able to "unclaim" a participant spot? | Phase 3 | Before Phase 3 |
| 5 | If a participant is linked to a user, should editing their profile (displayName) auto-update the participant's displayName? Or keep them separate? | Phase 2-3 | Before Phase 3 |
| 6 | Should plan `visibility` field (public/unlisted/private) be enforced now, or deferred? | Phase 4 | Before Phase 4 |

---

## 11. Migration Strategy

Since all new columns are nullable and all new tables are additive:

1. Deploy schema changes (Phase 1) first — no code behavior changes
2. Deploy profile provisioning (Phase 2) — starts populating profiles, no access restrictions yet
3. Deploy claim endpoint (Phase 3) — users can start linking to participants
4. Deploy response filtering (Phase 4) with API key fallback — FE can migrate gradually
5. Deploy edit permissions (Phase 5) — FE must handle 403s by this point
6. Remove API key fallback — once FE fully uses JWT

Each phase is a separate PR with its own tests. No phase depends on the FE being updated (except Phase 5 which needs FE to handle 403 errors gracefully).
