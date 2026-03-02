# Backend Rules & Conventions

Strict, minimal instructions for `chillist-be`. Read these before executing any task.

## 1. Architecture & Data
- **PII Separation:** Supabase is the single source of truth for user identity. The BE database only stores Supabase UUIDs (`userId`). Never duplicate PII (email, name) in the BE database.
- **Per-Plan Preferences:** Store per-plan data (food prefs, RSVP) on the `participants` table, not global profiles.
- **Dependency Injection:** Use DI (`buildApp({ db })`). Never import `db` directly in routes. Tests must inject the testcontainer DB.
- **Enums:** Never hardcode enum values. Derive const arrays and TypeScript types from Drizzle `pgEnum` in `db/schema.ts` and import them everywhere.

## 2. API & Schema Design
- **API Contract First:** The [user-management spec](../specs/user-management.md) is the FE/BE contract. Update the spec with full endpoint details (request, response, auth, errors) *before* implementing.
- **Schema Centralization:** Define schemas in `src/schemas/` with `$id`, register via `registerSchemas(fastify)`, and reference in routes using `{ $ref: 'SchemaName#' }`. Never define inline schemas.
- **Simple Schemas:** Keep schemas flat. Do not encode conditional business rules (e.g., `oneOf` with discriminators) in JSON Schema. Enforce business rules in the route handler.
- **AJV Strict Mode:** Avoid OpenAPI-only keywords (`discriminator`, `xml`, `externalDocs`) in schemas validated by AJV.
- **OpenAPI Spec:** Do not hardcode `localhost` servers. Only type responses that clients parse. Run `npm run openapi:generate` after changes and commit `docs/openapi.json`.

## 3. Auth & Security
- **Supabase Auth:** FE calls Supabase directly. BE only verifies JWTs via JWKS (`jose` library). No Supabase client or JWT secrets on the BE.
- **Fail-Fast Auth:** Never silently swallow auth failures. If a token is present but invalid, return 401. Log auth failures at `warn` level (not `debug`, which is invisible in production).
- **Route Protection:** Verify every route has explicit auth enforcement (e.g., `onRequest` JWT hooks). Do not rely on global gates.
- **Preflight Requests:** Any `onRequest` hook that checks headers (auth, API keys) must explicitly skip `OPTIONS` requests.
- **CORS:** Explicitly list all allowed HTTP methods (`['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS']`) in the CORS config.
- **Access Control:** Return `404 Not Found` (not 403) for unauthorized plans to prevent ID enumeration. Use `checkPlanAccess()`.
- **Data Filtering:** Always filter returned items/data by the requester's participant assignment (hide items assigned to others on invite routes).
- **Critical Env Vars:** Make environment variables that disable critical features (like `SUPABASE_URL`) required in production via Zod `.refine()`.

## 4. Error Logging
- Use Fastify's Pino logger (`request.log`).
- Always pass the error object as `err` and include relevant entity IDs (`planId`, `itemId`) for correlation.
- Use `warn` or `error` for anything that changes request behavior (e.g., auth failure). `debug` is invisible in production.

## 5. Testing
- **Write Alongside Code:** Every new route or behavior change requires a matching integration test *before* finalization.
- **Auth in Tests:** When adding auth to existing routes, update all tests to pass valid JWTs or mock the auth layer.
- **Mocking DB:** If a unit test mocks DB calls, ensure the mock chain matches the exact Drizzle query builder chain used in the handler.
- **Combine Similar Tests:** Use `it.each` for repetitive validation tests.

## 6. Workflow & Safe Deployments
- **Version Bumping:** Bump `package.json` version on every PR (Patch: fixes, Minor: features/DB, Major: breaking).
- **Incremental Migration:** When adding auth or breaking changes, do additive changes first. Keep the old route/auth working, let FE migrate, then enforce/cleanup.
- **Breaking Change Check:** Before committing, check if request/response shapes changed. If breaking, keep the old code path working, deprecate it, and create a cleanup issue.
