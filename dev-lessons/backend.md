# Backend Dev Lessons

A log of bugs fixed and problems solved in `chillist-be`.

---

<!-- Add new entries at the top -->

### [Arch] Silent JWT Failure Creates Ownerless Private Plans
**Date:** 2026-02-24
**Problem:** The auth plugin catches JWT verification errors at `debug` level (invisible in production where `LOG_LEVEL=info`). When verification fails, `request.user` stays null and route handlers silently create resources without user association. Combined with FE defaulting visibility to `private`, plans become permanently inaccessible — private plan with no `createdByUserId` means `checkPlanAccess()` denies everyone.
**Solution:** (1) Upgrade JWT failure logging from `debug` to `warn` so failures are visible in production. (2) Add fail-fast guard on write endpoints: if `Authorization: Bearer` header is present but `request.user` is null, return 401 instead of proceeding with null identity.
**Prevention:** Never silently swallow auth failures. Any catch block in auth middleware should log at `warn` level minimum. Endpoints that depend on user identity should explicitly check for the "token sent but verification failed" case rather than treating it the same as "no token sent."

---

### [Arch] Log Levels Matter — `debug` Is Invisible in Production
**Date:** 2026-02-24
**Problem:** JWT verification failures were logged at `debug` level. Production `LOG_LEVEL` defaults to `info`, so these errors were completely invisible in Railway logs. The bug went undetected because there was no signal.
**Solution:** Changed JWT failure logging to `warn`. Rule: anything that changes request behavior (e.g., user becomes unauthenticated) must be logged at `warn` or higher.
**Prevention:** Before logging at `debug`, ask: "If this happens in production, would I want to see it?" If yes, use `warn`. Reserve `debug` for verbose tracing only useful during local development.

---

### [Arch] Update API Spec Before Implementing — Prevents FE/BE Mismatch
**Date:** 2026-02-24
**Problem:** The user-management spec had outdated sections (guests described as "cannot edit anything," profile auto-provisioning referencing a `profiles` table that was removed months ago, endpoints with no request/response details). If the FE had built against this spec, it would have been wrong. Discovered during access control work when reviewing what guests should be able to do.
**Solution:** Added "API Contract with FE" section to backend rules. Every endpoint must be documented in the spec with: method, path, URL params with types, auth headers, request body fields with types (required/optional/nullable), response JSON shape, error codes. Spec must be updated BEFORE implementing, not after.
**Prevention:** Treat the user-management spec as the FE/BE contract. Never implement an endpoint without its full detail in the spec. Add spec update to the finalization checklist.

---

### [Arch] Per-Plan Preferences Must Live on Participant Record, Not Shared Profile
**Date:** 2026-02-24
**Problem:** The `guest_profiles` table and the `participants` table both had preference columns (`foodPreferences`, `allergies`, `adultsCount`, `kidsCount`). Unclear which was the source of truth. The spec said onboarding data goes to `guest_profiles`, but preferences should be per-plan (different trips = different dietary needs and group sizes).
**Solution:** Per-plan preferences live on the `participants` table — each participant record stores preferences for that specific plan. The `user_details` table stores default preferences for signed-in users, which are pre-filled into participant records when joining a new plan. Guest endpoints update the participant record directly. Added Open Question #11 to review whether `guest_profiles` is still needed.
**Prevention:** When storing user preferences, always decide upfront: is this per-plan or global? Per-plan data goes on the participant record. Global defaults go on `user_details`. Never duplicate the same fields across tables without documenting which is authoritative.

---

### [Arch] Invite Route Must Filter Items by Participant Assignment
**Date:** 2026-02-24
**Problem:** The invite route (`GET /plans/:planId/invite/:inviteToken`) returned ALL items for the plan, including items assigned to other participants. An invite user could see what everyone else was bringing, which leaks assignment data they shouldn't have access to.
**Solution:** Filter items in the invite route response: only return items where `assignedParticipantId` matches the invited participant OR `assignedParticipantId` is null (unassigned). Items assigned to other participants are hidden.
**Prevention:** When returning plan data to non-owner users, always filter items by the requester's participant relationship. Apply the same filtering pattern to `GET /guest/plan` (future) and any other guest-facing route.

---

### [Arch] Plan Access Control — Return 404 Instead of 403 for Unauthorized Plans
**Date:** 2026-02-23
**Problem:** When enforcing visibility on `GET /plans/:planId`, returning 403 (Forbidden) leaks the existence of private plans to unauthorized users. An attacker could enumerate plan IDs and learn which ones exist.
**Solution:** Return 404 for both "plan not found" and "plan exists but you're not authorized." The response body is identical in both cases (`{ message: "Plan not found" }`). Created a shared `checkPlanAccess()` utility (`src/utils/plan-access.ts`) that returns `{ allowed: false, plan: null }` for unauthorized access — callers see the same result as a missing plan.
**Prevention:** Always return 404 (not 403) when hiding the existence of a resource. Test that the 404 response shape is identical for unauthorized vs nonexistent resources.

---

### [Arch] Access Control Changes Break Existing Tests That Skip Auth
**Date:** 2026-02-23
**Problem:** Adding visibility enforcement to `GET /plans/:planId` broke the user-tracking integration test and two unit tests. The user-tracking test created a plan with JWT (now defaults to `invite_only`) then did a GET without JWT — returned 404 instead of 200. The unit tests mocked `db.query.plans.findFirst` but `checkPlanAccess()` now calls `db.select().from().where()` first, which wasn't mocked.
**Solution:** Updated user-tracking test to send JWT on the GET request. Updated unit test mocks to simulate the `select→from→where` chain that `checkPlanAccess()` uses.
**Prevention:** When adding authorization checks to existing routes, search for all tests that call those routes and verify they still have valid credentials. Unit tests with mocked DBs need their mock chains updated when new DB queries are added to the handler.

---

### [Arch] PII Separation — Supabase as Single Source of User Identity
**Date:** 2026-02-22
**Problem:** Initial implementation duplicated Supabase user PII (email, name) into a local `profiles` table in Railway DB. This created two sources of truth for user data and added an INSERT on every authenticated request.
**Solution:** Removed `profiles` table. Supabase is the single PII store for registered users. Railway DB stores only Supabase UUIDs as plain references (`plans.createdByUserId`, `participants.userId`) — no FK, no PII. New `user_details` table holds only app-specific preferences (food prefs, equipment). New `guest_profiles` table holds temporary PII for unregistered participants (deleted on sign-up).
**Prevention:** Never duplicate auth provider PII in app DB. Store only opaque user IDs as references. Keep app-specific data separate from identity data.

---

### [Arch] Incremental Auth Migration — Don't Break the FE
**Date:** 2026-02-22
**Problem:** Attempted to add JWT enforcement on all routes in one step. FE currently uses API key only — deploying JWT-required routes would break everything.
**Solution:** Broke the work into incremental steps: (1) schema only, (2) opportunistic tracking, (3) new endpoints, (4) FE migration, (5) enforce JWT, (6) cleanup. Each BE step is backward-compatible — API key keeps working until FE switches to JWT.
**Prevention:** When adding auth requirements, always check what the FE currently sends. Deploy BE changes that are additive first, let FE migrate, then enforce.

---

### [Arch] Use JWKS (Asymmetric Keys) for Supabase JWT Verification
**Date:** 2026-02-17
**Problem:** Legacy Supabase JWT secret (HS256 shared secret) requires storing a secret on the BE. Supabase strongly discourages this — secrets can leak, are hard to rotate, and require coordination to revoke.
**Solution:** Use Supabase's JWKS endpoint (`/auth/v1/.well-known/jwks.json`) with asymmetric keys (ES256). The `jose` library's `createRemoteJWKSet()` fetches and caches public keys automatically. No secrets stored on the BE.
**Prevention:** Always use `createRemoteJWKSet()` for Supabase JWT verification. Never store JWT secrets in env vars. If the Supabase dashboard shows JWK format keys (not a plain string), you're on the new asymmetric system — use JWKS.

---

### [Arch] FE Calls Supabase Directly for Auth (Not Proxied Through BE)
**Date:** 2026-02-17
**Problem:** Considered building `POST /auth/signup` and `POST /auth/signin` endpoints on the BE to proxy auth through the backend.
**Solution:** FE calls Supabase directly for sign-up/sign-in. The BE only verifies JWTs. This is simpler, supports Google OAuth (browser redirects), and lets the Supabase client handle token refresh and email confirmation automatically.
**Prevention:** Do not add Supabase client (`@supabase/supabase-js`) to the BE. The BE only needs `jose` for JWT verification via JWKS.

---

### [Arch] Write Tests Alongside New Routes, Not After

**Date:** 2026-02-15
**Problem:** New invite routes were implemented and validated (typecheck + lint + existing tests pass) without writing any new tests. "All tests pass" only proved nothing was broken — not that the new endpoints work.
**Solution:** Added 15 integration tests for invite endpoints. Added a Testing section to backend rules requiring tests before finalization.
**Prevention:** Every new route or behavior change gets a matching test file written as part of implementation, not as a separate step. The finalization checklist now starts with "write tests" before "run tests."

---

## 2026-02-12: Always Create Feature Branch Before Making Changes

**Problem:** Started implementing code changes directly on the current branch without first creating a feature branch from main, violating the git workflow defined in `chillist-docs/rules/common.md`.

**Solution:** Must follow the git workflow: stash changes, checkout main, pull latest, create feature branch, pop stash, then commit.

**Prevention:** Before any code changes, always check git status and create a feature branch. Read `chillist-docs/rules/common.md` at the start of every session.

---

## 2026-02-11: API Key onRequest Hook Must Skip OPTIONS Preflight

**Problem:** The `onRequest` API key check ran on OPTIONS preflight requests. Browsers cannot send custom headers on preflight, so OPTIONS always got 401 — causing `@fastify/cors` and the hook to both call `reply.send()`, which Fastify 5 rejects as `FST_ERR_REP_ALREADY_SENT`.

**Solution:** Added `request.method === 'OPTIONS'` guard to skip preflight in the API key hook. Added CORS integration tests to prevent regression.

**Prevention:** Any `onRequest` middleware that checks headers (auth, API key) must explicitly skip OPTIONS. Add CORS preflight tests when touching auth hooks.

---

## 2026-02-11: CORS Must Explicitly Allow All HTTP Methods

**Problem:** `@fastify/cors` defaults to `GET, HEAD, POST` only. Adding PATCH/DELETE routes without updating CORS caused preflight rejections in production.

**Solution:** Added explicit `methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS']` to the CORS config.

**Prevention:** Whenever adding a route with a non-simple HTTP method (PATCH, DELETE, PUT), verify the CORS config allows it.

---

## 2026-02-09: AJV Strict Mode Rejects OpenAPI-Only Keywords

**Problem:** Used `discriminator` keyword in JSON Schema `oneOf` for the CreateItemBody schema. Fastify's AJV runs in strict mode and rejected it with "unknown keyword: discriminator".

**Solution:** Removed `discriminator` — AJV doesn't need it. Single-value enums in each sub-schema (`['equipment']` vs `['food']`) already act as natural discriminators for validation.

**Prevention:** Avoid OpenAPI-only keywords (`discriminator`, `xml`, `externalDocs`) in schemas that AJV validates. Use simple flat schemas when possible.

---

## 2026-02-09: Keep Schemas Simple — Handle Conditional Logic in Handlers

**Problem:** Tried to express "equipment items don't need unit, food items require unit" via `oneOf` with two sub-schemas and a discriminator. This caused AJV validation failures and added unnecessary complexity.

**Solution:** One flat `CreateItemBody` schema with `unit` optional. Handler checks: if food and no unit, return 400. If equipment, auto-set unit to `pcs`.

**Prevention:** Don't encode conditional business rules in JSON Schema. Use a simple flat schema for validation, enforce business rules in the handler.

---

## 2026-02-05: OpenAPI Schemas Must Use Centralized $ref System

**Problem:** Inline JSON schemas in routes cause duplication, are hard to maintain, and result in bloated OpenAPI spec.

**Solution:** Create `src/schemas/` folder with schemas that have `$id`, register via `registerSchemas(fastify)`, reference in routes with `{ $ref: 'SchemaName#' }`.

**Prevention:** Never define schemas inline in routes. Always create in `src/schemas/`, register in index.ts, use $ref.

---

## 2026-02-05: Don't Hardcode Localhost in OpenAPI Servers

**Problem:** OpenAPI spec had hardcoded `http://localhost:3333` in servers array, which gets committed and is irrelevant for frontend.

**Solution:** Removed `servers` section entirely — frontend configures API URL via its own environment variables.

**Prevention:** Don't include environment-specific URLs in OpenAPI spec. Let clients configure their own base URL.

---

## 2026-02-05: Don't Over-Engineer Error Response Schemas

**Problem:** Created separate HealthyResponse and UnhealthyResponse schemas for health endpoint, but 503 response body is never parsed by clients.

**Solution:** Single HealthResponse schema for 200 only. Unhealthy = any non-200 status, body doesn't matter.

**Prevention:** Only type responses that clients actually parse. Error responses often just need status code check.

---

## 2026-02-02: Use Dependency Injection for Testable Services

**Problem:** Routes imported db directly, making tests require env vars before module load and coupling code to specific implementations.

**Solution:** Use DI pattern — `buildApp({ db })` accepts dependencies, routes use `fastify.db` from context, tests inject testcontainer db.

**Prevention:** Always inject services into app, never import directly in routes. Entry point creates real services, tests create test services.
