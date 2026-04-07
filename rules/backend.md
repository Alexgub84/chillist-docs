# Backend Rules & Conventions

Strict, minimal instructions for `chillist-be`. Read these before executing any task.

## 1. Architecture & Data

- **PII Separation:** Supabase is the single source of truth for user identity. The BE database only stores Supabase UUIDs (`userId`). Never duplicate PII (email, name) in the BE database.
- **Per-Plan Preferences:** Store per-plan data (food prefs, RSVP) on the `participants` table, not global profiles.
- **Dependency Injection:** Use DI (`buildApp({ db })`). Never import `db` directly in routes. Tests must inject the testcontainer DB.
- **Enums:** Never hardcode enum values. Derive const arrays and TypeScript types from Drizzle `pgEnum` in `db/schema.ts` and import them everywhere.
- **Service Layer:** Reusable business logic that may be called from multiple routes belongs in `src/services/`. Services are pure functions that receive `db` (or a transaction handle) as their first argument — no Fastify coupling. Route handlers orchestrate (auth, validation, error handling) and delegate to services. Examples: `participant.service.ts` (participant creation), `profile-sync.ts` (identity field mapping).
- **Routes Must Use Services for Side Effects:** When a business action has side effects (auto-assignment, cleanup, notifications), every route that triggers that action must call the same service/side-effect functions. Routes must never do raw DB operations that skip side effects a service already handles. If a route cannot use the full service function (e.g. a required param is unavailable), it must still call every individual side-effect function the service calls.
- **Participant Creation:** All new participant creation (join request approval, future invite flows, etc.) should go through `addParticipantToPlan()` in `src/services/participant.service.ts`. Routes that create participants without `addParticipantToPlan` (e.g. the invite route, which has no `userId` yet) must explicitly call `addParticipantToAllFlaggedItems()` after the insert.
- **Audit When Adding Rules:** When a new rule is added to this file about existing code patterns, audit the codebase for pre-existing violations and fix them in the same commit. A rule added without fixing existing code is a time bomb.

## 2. API & Schema Design

- **API Contract First:** The [user-management spec](../specs/user-management.md) is the FE/BE contract. Update the spec with full endpoint details (request, response, auth, errors) _before_ implementing.
- **Schema Centralization:** Define schemas in `src/schemas/` with `$id`, register via `registerSchemas(fastify)`, and reference in routes using `{ $ref: 'SchemaName#' }`. Never define inline schemas.
- **Simple Schemas:** Keep schemas flat. Do not encode conditional business rules (e.g., `oneOf` with discriminators) in JSON Schema. Enforce business rules in the route handler.
- **AJV Strict Mode:** Avoid OpenAPI-only keywords (`discriminator`, `xml`, `externalDocs`) in schemas validated by AJV.
- **OpenAPI Spec:** Do not hardcode `localhost` servers. Only type responses that clients parse. Run `npm run openapi:generate` after changes and commit `docs/openapi.json`.
- **Schema & Route Descriptions:** Every new or updated route must have a clear `description` in the schema config. Every non-obvious property in request/response schemas must have a `description` explaining what to send and when — especially flags, enums, and assignment fields. The OpenAPI spec is the FE developer's primary reference; bare fields with no description force guesswork.
- **OpenAPI response descriptions:** For each HTTP status you document under `response`, include an explicit `description` string alongside `$ref` (same pattern as `admin-ai-usage` and `ai-suggestions`). Otherwise Fastify may emit generic `"Default Response"` in `docs/openapi.json`, which is useless for API consumers.
- **Error Response Declarations:** Every route schema must declare all status codes the handler can return — including `401` from auth hooks, `400` from validation, `404` from not-found checks, and `500`/`503` from catch blocks. Each error entry must include a `description` field (e.g. `401: { description: 'Authentication required — JWT token missing or invalid', $ref: 'ErrorResponse#' }`). Never leave error codes undeclared or use "Default Response".

## 3. Auth & Security

- **Supabase Auth:** FE calls Supabase directly. BE only verifies JWTs via JWKS (`jose` library). No Supabase client or JWT secrets on the BE.
- **Fail-Fast Auth:** Never silently swallow auth failures. If a token is present but invalid, return 401. Log auth failures at `warn` level (not `debug`, which is invisible in production).
- **Route Protection:** Verify every route has explicit auth enforcement (e.g., `onRequest` JWT hooks). Do not rely on global gates.
- **Preflight Requests:** Any `onRequest` hook that checks headers (auth, API keys) must explicitly skip `OPTIONS` requests.
- **CORS:** Explicitly list all allowed HTTP methods (`['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS']`) in the CORS config.
- **Access Control:** Return `404 Not Found` (not 403) for unauthorized plans to prevent ID enumeration. Use `checkPlanAccess()`.
- **Data Filtering:** Always filter returned items/data by the requester's participant assignment (hide items assigned to others on invite routes).
- **Critical Env Vars:** Make environment variables that disable critical features (like `SUPABASE_URL`) required in production via Zod `.refine()`.
- **Internal API auth (chatbot routes):** Routes under `/api/internal/*` use service-key authentication (`x-service-key` header = `CHATBOT_SERVICE_KEY` env var), enforced by the `internal-auth` Fastify plugin. This mirrors the same two-path model as the FE: registered users send `x-user-id` (analogous to JWT), guest users send `x-guest-participant-id` (analogous to invite token). The `x-service-key` header always comes first and proves the caller is the trusted chatbot service. Registered-user phone-to-identity resolution queries **`users.phone`** (canonical, indexed); guest resolution uses `guest_profiles`. Display name may come from Supabase metadata or a `participants` fallback — see [phone-management.md](../specs/phone-management.md). No Supabase Admin API is required for the phone lookup itself.

## 4. Error Logging

- Use Fastify's Pino logger (`request.log` in routes, `fastify.log` in plugins).
- Always pass the error object as `err` and include relevant entity IDs (`planId`, `itemId`) for correlation.
- Use `warn` or `error` for anything that changes request behavior (e.g., auth failure). `debug` is invisible in production.
- **Every new feature must include a log-level analysis before finalization.** Walk through every code path and classify:
  - `error` — unexpected failures the system cannot recover from (unhandled exceptions, DB connection failures, data corruption). These indicate bugs or infrastructure problems.
  - `warn` — expected-but-abnormal situations that change behavior (invalid token, access denied, missing required data, send failures to external clients). The system recovers, but an operator should know.
  - `info` — normal successful operations (resource created, connection opened, notification sent). Already standard practice.
  - Never leave a rejection/failure path without a log. If a request is denied, a connection is closed, or an error is caught, log it at `warn` or `error` with enough context (entity IDs, error type) to debug from production logs alone.
  - Never log at `debug` if the answer to "would I want to see this in production?" is yes.

## 5. Testing

- **Write Alongside Code:** Every new route or behavior change requires a matching integration test _before_ finalization.
- **Test Layering:** Unit tests cover service functions in isolation. Integration tests cover full route behavior via `app.inject()`. Never call service functions directly in an integration test — that bypasses route-level logic (middleware, hooks, side effects) and creates false confidence. If a test description says "when X happens via the API" but the code calls a service function directly, the test is wrong.
- **Happy + Unhappy Paths:** Every integration test for a route must include the happy path (success) and key unhappy paths (validation errors, auth failures, not-found, conflicts).
- **Auth in Tests:** When adding auth to existing routes, update all tests to pass valid JWTs or mock the auth layer.
- **Mocking DB:** If a unit test mocks DB calls, ensure the mock chain matches the exact Drizzle query builder chain used in the handler.
- **Combine Similar Tests:** Use `it.each` for repetitive validation tests.
- **All Entry Points:** When writing tests for a new handler behavior, cover every entry point that reaches that behavior — DM and group — in the same commit. Do not test only the path you just modified.
- **Fake Services:** When creating a fake/mock service for tests (e.g., `FakeWhatsAppService`): (a) block the fake provider in production via env `.refine()`, (b) never let the factory function create the fake — only inject via `buildApp` options, (c) add env guard unit tests that verify `fake` is rejected in production, (d) add an E2E prod test (`describe.skipIf(!CREDS)`) that validates the real service with real credentials before deploy.

## 6. Seed Maintenance

- **Update on new features:** The seed (`src/db/seed.ts`) should be updated with each new feature and endpoint, or reviewed to determine if an update is needed.
- When adding a new table or entity, add representative seed data and include it in the TRUNCATE list if applicable.
- When adding a new endpoint that returns data, consider whether the seed should provide sample data to exercise that endpoint.

## 7. WhatsApp

- For any WhatsApp-related task, read [specs/whatsapp.md](../specs/whatsapp.md) first — it is the single source of truth for current state, planned features, architecture, and FE/BE alignment.

## 8. AI

- **AI Usage Tracking:** Every AI model invocation must be recorded via `recordAiUsage()` from `src/services/ai/usage-tracking.ts`. This applies to all current and future AI features (item suggestions, chatbot, meal planning, etc.). Never call an AI model without recording the usage.
- **Model Changes Require Pricing Update:** When adding, replacing, or upgrading an AI model in `model-provider.ts`, immediately update the `MODEL_PRICING` table in `src/services/ai/usage-tracking.ts` with the new model's per-token pricing. If the model is missing from the pricing table, `estimatedCost` will be stored as `null` — a silent data gap.
- **Model-Pricing Sync Test:** The unit test `tests/unit/ai/usage-tracking.test.ts` asserts that every model ID returned by `resolveLanguageModel` (all provider/lang combinations) has a matching entry in `MODEL_PRICING`. This test breaks automatically when a model is added to the provider but not to the pricing table.

## 9. Workflow & Safe Deployments

- **Repo boundary:** Do not modify `chillist-fe` (or any non-docs sibling app repo) when executing tasks in `chillist-be`. Deliver API changes, `docs/openapi.json`, and updates under `chillist-docs/` (specs, guides, dev-lessons). Frontend consumers are implemented in `chillist-fe` separately — describe the contract in OpenAPI and [user-management spec](../specs/user-management.md); open or link an FE issue when the UI must change.
- **Version Bumping:** Bump `package.json` version on every PR (Patch: fixes, Minor: features/DB, Major: breaking).
- **Incremental Migration:** When adding auth or breaking changes, do additive changes first. Keep the old route/auth working, let FE migrate, then enforce/cleanup.
- **Breaking Change Check:** Before committing, check if request/response shapes changed. If breaking, keep the old code path working, deprecate it, and create a cleanup issue.
