# Backend Dev Lessons

A log of bugs fixed and problems solved in `chillist-be`.

_(Note: All lessons prior to 2026-03-02 have been distilled into `rules/backend.md` to save context tokens. Only add NEW lessons here.)_

---

<!-- Add new entries at the top -->

### [AI] Vercel AI SDK v5 — version compatibility and `generateObject` with `output: 'array'`

**Date:** 2026-03-26
**Problem:** Multiple dependency conflicts when integrating `ai@5` (Vercel AI SDK): (1) `ai@5` requires `zod@^3.25`, but the project had `zod@3.24`. (2) `@ai-sdk/anthropic@3` and `@ai-sdk/openai@3` implement spec v3, but `ai@5` expects v2 providers — causing TS error `Type '"v3"' is not assignable to type '"v2"'`. (3) `ai/test` module requires `msw` as a peer dependency. (4) `generateObject` with `output: 'array'` internally wraps the Zod schema in `{ elements: z.array(schema) }`, so mock models must return `{ "elements": [...] }` not a bare JSON array — this caused all mock tests to fail with "value must be an object that contains an array of elements".
**Solution:** (1) Upgraded Zod to `3.25.76`. (2) Downgraded providers to v2: `@ai-sdk/anthropic@2.0.71` and `@ai-sdk/openai@2.0.101`. (3) Installed `msw` as devDependency. (4) Updated all mock model responses to wrap arrays in `{ elements: [...] }`.
**Prevention:** When installing `ai@5`, pin compatible provider versions (`@ai-sdk/anthropic@2`, `@ai-sdk/openai@2`). Always check the `output: 'array'` wrapping behavior in tests — mock models must return the wrapped format. Check `ai/test` peer dependencies (`msw`).

### [AI] Adding new env vars can break existing env guard tests

**Date:** 2026-03-26
**Problem:** Adding `AI_PROVIDER` (defaulting to `anthropic`) with a `.refine()` guard requiring `ANTHROPIC_API_KEY` in production caused existing WhatsApp and internal-auth env guard tests to fail. Their `PROD_BASE` fixtures didn't include the new AI key, so the global production validation rejected them.
**Solution:** Updated `PROD_BASE` in `tests/unit/whatsapp/env-guards.test.ts` and `tests/unit/internal-auth/env-guards.test.ts` to include `ANTHROPIC_API_KEY: 'sk-ant-test-key'`.
**Prevention:** When adding a new env variable with a production `.refine()` guard, search for all `PROD_BASE` / production env fixtures in test files and add the new variable. Global validation means any production test fixture must satisfy ALL refine guards, not just the ones being tested.

### [AI] Prompt templates should be in a separate file from prompt assembly logic

**Date:** 2026-03-26
**Problem:** Initial prompt builder mixed static instruction text (system role, category rules, closing instructions) with dynamic assembly logic (inserting plan context, computing duration labels) in a single file. This made it hard to iterate on prompt content without risking logic changes.
**Solution:** Extracted all static prompt text into `prompt-templates.ts` (SYSTEM_INSTRUCTION, CONTEXT_GUIDANCE, CATEGORY_RULES, SUBCATEGORY_GUIDANCE, VALID_ENUMS, CLOSING_INSTRUCTION). The `build-prompt.ts` file only handles dynamic assembly: reading plan context and inserting template sections.
**Prevention:** For AI features, always separate prompt content (what the AI sees) from prompt assembly (how plan data is formatted). This lets prompt engineers iterate on wording without touching logic, and lets developers test assembly independently.

### [AI] Self-explanatory naming for AI modules — plan for future AI features

**Date:** 2026-03-26
**Problem:** Initial file names (`context.ts`, `types.ts`) were too generic. As more AI features are added (chatbot, meal planning, etc.), generic names would cause confusion.
**Solution:** Renamed to descriptive names: `plan-context-formatters.ts` (reusable formatters), `item-suggestions/` (feature-specific module), `build-prompt.ts`, `output-schema.ts`, `prompt-templates.ts`, `generate.ts`. Shared utilities live in `src/services/ai/` and feature-specific modules in subdirectories.
**Prevention:** When creating AI service files, use the pattern: shared utilities in `src/services/ai/` with descriptive names, feature-specific code in `src/services/ai/<feature-name>/` subdirectories.

### [Items] Duplicated create/update in routes + empty `assignmentStatusList` for `personal_equipment`

**Date:** 2026-03-24
**Problem:** Invite and JWT item routes duplicated insert/update and assignment merge logic. `personal_equipment` defaulted to `isAllParticipants` in logic but, when the client sent an empty `assignmentStatusList`, the list stayed empty — inconsistent with “assign to all” semantics.
**Solution:** Centralized create in `createPlanItems` (using `prepareItemForCreate` + `getPlanParticipantIds`) and updates in `processItemUpdate`. When `isAllParticipants` is true and the resolved list is empty, fill pending entries for all plan participants. Routed both `items.route` and `invite` item endpoints through these helpers.
**Prevention:** Do not add parallel item insert/update paths in new routes; extend `item.service.ts` / `item-mutation.ts` and reuse. See [item-handling.md](../current/item-handling.md).

### [Testing] Route bypassed service + integration test bypassed route — double false confidence

**Date:** 2026-03-24
**Problem:** `POST /plans/:planId/participants` did a raw `db.insert(participants)` instead of calling `addParticipantToPlan()`, so new participants were never auto-assigned to `isAllParticipants` items. The integration test for this behavior called `addParticipantToPlan(db, ...)` directly instead of `app.inject()`, so it passed despite the route being broken. Three root causes: (1) the route predated the "use `addParticipantToPlan`" rule and was never updated when the rule was added, (2) the integration test called the service function directly instead of the HTTP route, giving false confidence, (3) no audit was done on existing code when the participant creation rule was added to `rules/backend.md`.
**Solution:** (1) Added `addParticipantToAllFlaggedItems()` call to the route handler after the insert. (2) Rewrote the integration test to use `app.inject({ method: 'POST' })` through the actual HTTP endpoint. (3) Added general rules to `rules/backend.md`: routes must use services for side effects, integration tests must use `app.inject()` not direct service calls, and new rules require auditing existing code for compliance.
**Prevention:** Integration tests must always go through `app.inject()` — never call service functions directly to trigger the behavior under test. When multiple routes can trigger the same business action, they must all call the same service/side-effect functions. When adding a new rule to `rules/backend.md`, audit existing code for violations in the same commit.

### [Arch] Supabase phone is in `user_metadata.phone`, not `auth.users.phone`

**Date:** 2026-03-18
**Problem:** Phone saved via `supabase.auth.updateUser({ data: { phone } })` goes into `raw_user_meta_data.phone`, not the top-level `auth.users.phone` column. Reading `auth.users.phone` (or `data.user?.phone` from the Admin SDK) always returns empty unless Supabase phone auth is explicitly enabled (which causes a 500 if not).
**Solution:** Updated `fetchSupabaseUserMetadata` to read `user_metadata.phone` (i.e. `meta.phone` from the Admin REST API response) and return it alongside `displayName`. Updated `POST /auth/sync-profile` to call Supabase Admin API for fresh phone data and merge it into the user object before syncing `participants.contactPhone` — so the sync works even when the JWT is stale.
**Prevention:** Never read from `auth.users.phone` or `data.user?.phone`. Always read from `data.user_metadata?.phone` (REST API) or `data.user?.user_metadata?.phone` (Admin SDK). When syncing identity fields to participant records, always enrich from the Supabase Admin API — don't rely solely on the JWT which may be stale.

### [Arch] Session ID for log correlation — use Supabase JWT session_id, not a custom DB table

**Date:** 2026-03-18
**Problem:** Needed to correlate all BE log entries belonging to the same user session without a DB table, complex session management, or inactivity timers.
**Solution:** Supabase JWTs already contain a `session_id` UUID claim that is stable across token refreshes and changes on new login. Extracted it in the auth plugin, stored on `request.sessionId`, and included it in the key log entries (auth, incoming request, response). For guests (no JWT), derived a stable `guest_<sha256-prefix>` from the invite token via `node:crypto`. The `sessionId` is returned from `GET /auth/me` so the FE can use it as a correlation key for client-side logging and future analytics.
**Prevention:** Before adding a new DB table for sessions, check what the auth provider already gives you. Supabase's `session_id` JWT claim is the canonical session identifier — no storage, no expiry logic, no refresh handling needed.

### [Arch] Display name for chatbot resolved from Supabase user_metadata, not participant table

**Date:** 2026-03-17
**Problem:** `resolveUserByPhone` picked the display name from whichever `participants` row matched the phone number. A user can have participant records across many plans with different names (stale syncs, manual edits). The query ordered by `participants.createdAt DESC` which didn't guarantee the most up-to-date name.
**Solution:** (1) After resolving `userId` from DB, call the Supabase Admin REST API (`GET /auth/v1/admin/users/{userId}`) using `SUPABASE_SERVICE_ROLE_KEY` to fetch `user_metadata`. (2) Parse `first_name`/`last_name`/`full_name`/`name` fields (shared `parseNameFromMetadata` util in `src/utils/name.ts`). (3) Fall back to the participant record from the most recently **created plan** (`orderBy(plans.createdAt DESC)` via JOIN) if Supabase has no name. (4) Gracefully returns `null` when `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` are not configured (dev/test safety). Uses native `fetch` — no `@supabase/supabase-js` dependency needed.
**Prevention:** User display name is canonical in Supabase `user_metadata`. Never use the `participants` table as the source of truth for identity fields — it may be stale. When querying participant records as a fallback, always join with `plans` and order by `plans.createdAt DESC` to pick the most recently created plan context.

### [Arch] FakeWhatsAppService leaked into production — fake test doubles must never be a runtime default

**Date:** 2026-03-13
**Problem:** `WHATSAPP_PROVIDER` in `env.ts` defaulted to `'fake'` with no production guard. The factory (`createWhatsAppService`) had a `fake` fallback path, and the plugin caught init errors silently falling back to a `NoopWhatsAppService`. On Railway without `WHATSAPP_PROVIDER=green_api`, the app booted with `FakeWhatsAppService` which returned `{ success: true, messageId: "fake-..." }` for every send — the FE showed "sent successfully" but nothing was actually sent. The `whatsapp_notifications` table was also corrupted with `status: 'sent'` for messages that never left the server.
**Solution:** (1) Added `.refine()` in `env.ts` to block `WHATSAPP_PROVIDER=fake` in production and require `GREEN_API_INSTANCE_ID` + `GREEN_API_TOKEN` when provider is `green_api`. (2) Removed `fake` fallback from the factory — it only creates `GreenApiWhatsAppService` now. `FakeWhatsAppService` is only injectable via `buildApp` options in tests. (3) Removed silent catch/Noop fallback in the plugin — if `createWhatsAppService` throws, the app crashes. (4) Added env guard regression tests. (5) Added E2E prod test (`describe.skipIf(!CREDS)`) that validates the real Green API before deploy.
**Prevention:** When creating a fake service for tests: (a) never make the fake provider a default in env — block it in production via `.refine()`, (b) never let the factory create the fake — only inject via `buildApp` options, (c) add an E2E prod test (`describe.skipIf(!CREDS)`) that validates the real service before deploy. See `.cursor/rules/new-external-service.mdc` for the full checklist.

### [Infra] Drizzle migrator skips migrations with out-of-order timestamps

**Date:** 2026-03-07
**Problem:** Migrations 0016 and 0017 were never applied in production. Drizzle's migrator compares `created_at` (the `when` field from `_journal.json`) — it fetches `MAX(created_at)` from `__drizzle_migrations` and skips any migration whose timestamp is lower. Migration 0015 had a manually-set timestamp (`1772870400000`) that was later than 0016/0017's auto-generated timestamps, so they were silently skipped.
**Solution:** Fixed the `when` values in `_journal.json` so timestamps are strictly increasing. Added a CI check (`scripts/check-migration-order.ts`) that validates timestamp order before migrations run.
**Prevention:** Never manually set migration timestamps. After generating a migration on a feature branch, always rebase on main and verify the journal timestamps are monotonically increasing. The CI check now catches this automatically.

### [Arch] Expense access control: check participant ownership, not expense creator

**Date:** 2026-03-06
**Problem:** Initial expense PATCH/DELETE routes checked `expense.createdByUserId === request.user.id` to determine if a non-owner could edit. This meant that when the plan owner added an expense for participant B, participant B could not edit it — the expense was "owned" by whoever typed it in, not the person it was about.
**Solution:** Replaced `isCreator` check with `isExpenseParticipant`: look up the participant record for `expense.participantId` and check if `participant.userId === request.user.id`. Also added `checkPlanAccess()` to PATCH/DELETE so removed participants lose access entirely.
**Prevention:** For entities that belong to a participant (expenses, preferences, etc.), always authorize based on the participant linkage (`participant.userId`), not who happened to create the record. The "creator" may be the plan owner acting on someone's behalf.

### [Logic] GET /plans list only returned plans the user created, not plans they participate in

**Date:** 2026-03-05
**Problem:** The `GET /plans` endpoint filtered by `plans.createdByUserId`, so participants who joined via invite or join request never saw those plans in their list.
**Solution:** Replaced the `createdByUserId` filter with an `innerJoin` on the `participants` table filtered by `participants.userId`. Since the plan creator is always inserted as a participant with `role: 'owner'`, this covers both owned and joined plans.
**Prevention:** Always test list/query endpoints from the perspective of every user role (owner, participant, non-participant). When a query filters by ownership, ask: "are there other ways a user can be associated with this entity?" Write multi-user integration tests that verify visibility from each role's perspective.

### [API] Every route must declare all possible error status codes with descriptions in OpenAPI

**Date:** 2026-03-05
**Problem:** 20 error status codes were missing from route schemas (mostly 401 on JWT-protected routes). All existing error entries used "Default Response" as the description. The FE had no way to know which errors a given endpoint could return, and backend logs showed `statusCode: 400` with no context about the actual error message or request body.
**Solution:** Audited all 8 route files and added every missing error code (401, 404, 503). Added a `description` field to every error response entry (e.g. `'Bad request — check the message field for details'`, `'Authentication required — JWT token missing or invalid'`). Also added a global `onSend` hook in `app.ts` that logs a WARN for every 4xx response with request body and response message.
**Prevention:** When creating or updating a route, always declare every status code the handler can return — including 401 from auth hooks. Add a meaningful `description` to each response entry so the OpenAPI spec is self-documenting for FE developers.

### [API] Simplified item assignment API — unified item-object shape

**Date:** 2026-03-05
**Problem:** Item PATCH had four assignment-specific fields (`assignToAll`, `assignmentStatusList`, `forParticipantId`, `unassign`) with role-dependent semantics. FE had to branch on user role to pick the correct payload shape. Participants hit `400 "Only the plan owner can modify assignments"` when using the wrong fields.
**Solution:** Removed all action-hint fields. FE now sends the full desired `assignmentStatusList` array and `isAllParticipants` boolean on every create/update. Backend validates non-owners via diff (only their own entry may change). One payload shape for all users.
**Prevention:** Prefer "send the desired state" APIs over "send an action command" APIs. Action-hint fields multiply client complexity and create role-dependent branching bugs. When access control is needed, validate by diffing incoming vs current state server-side.

### [Arch] All-participants item assignment replaced groupId duplication with JSONB column

**Date:** 2026-03-05
**Problem:** The original "assign to all" model duplicated items (N copies with a shared `allParticipantsGroupId`). This made queries, updates, and lifecycle management (participant join/leave) complex and error-prone.
**Solution:** Replaced with a single `assignmentStatusList` JSONB column (`[{ participantId, status }]`) and `isAllParticipants` boolean on the items table. One item row per logical item. Migration backfilled and consolidated duplicates. Deleted `all-participants-items.service.ts`.
**Prevention:** For per-participant status on shared entities, use a JSONB array column rather than row duplication. It simplifies queries, avoids cascade/sync bugs, and makes lifecycle hooks (participant add/remove) trivial.

### [Arch] All-participants item assignment uses groupId + flat duplication (SUPERSEDED)

**Date:** 2026-03-03
**Problem:** Needed to support assigning equipment items to all participants — each participant gets their own copy with independent status, and the system auto-creates/deletes copies as participants join/leave.
**Solution:** Added `isAllParticipants` boolean + `allParticipantsGroupId` UUID to items table. When owner assigns to all, the original item is flagged and N-1 copies are created (one per other participant), all sharing the same groupId. Re-toggling reconciles with current participant roster (revives canceled copies, creates new ones for joiners). All multi-write operations use `db.transaction()` for atomicity. Core field updates (name, qty, unit) cascade across the group; status stays local per participant.
**Prevention:** For "assign to all" patterns, prefer flat duplication with a shared groupId over parent/child hierarchies. Use transactions for multi-write operations. Add idempotency guards (NOT EXISTS checks) for operations that may be retried.

### [Arch] Item change tracking uses separate table and fire-and-forget recording

**Date:** 2026-03-02
**Problem:** Needed to persist audit history for every item create/update (status changes, assignments, etc.) without slowing down or breaking the main API response.
**Solution:** Added `item_changes` table and `src/utils/item-changes.ts`. All 8 item mutation endpoints call `recordItemCreated` / `recordItemUpdated` after successful writes. Recording is fire-and-forget — errors are logged but never thrown, so a failed audit write cannot break the user's request.
**Prevention:** For audit/change-tracking features, use a separate table (not a JSONB column on the hot table) and fire-and-forget recording. This keeps item reads fast and ensures the main operation always succeeds.

### [Arch] Decouple business logic from route handlers into services

**Date:** 2026-03-02
**Problem:** Business logic (participant creation, user_details pre-fill) was embedded directly in route handlers (plans.route.ts, participants.route.ts, claim.route.ts). When join-request approval needed the same participant creation logic, there was no reusable function to call — only copy-paste from other handlers.
**Solution:** Extracted `addParticipantToPlan()` into `src/services/participant.service.ts`. The service is a pure function that receives `db` as its first argument — no Fastify coupling. Route handlers do orchestration (auth, validation, error responses) and delegate business logic to the service.
**Prevention:** Route handlers should only handle HTTP concerns (auth, validation, status codes, error formatting). When business logic is needed in 2+ routes or is complex enough to warrant its own tests, extract it to `src/services/` immediately. Services are the single place for side effects (notifications, activity logs) that should fire regardless of which route triggers the action.

### [Security] WebSocket plan membership check was missing

**Date:** 2026-03-09
**Problem:** The WebSocket `/plans/:planId/ws` endpoint validated the JWT and checked that the plan existed, but did not verify the authenticated user was actually a participant/creator of the plan. Any user with a valid JWT could subscribe to any plan's WebSocket.
**Solution:** Replaced the raw plan-exists query with `checkPlanAccess()` — the same utility used by REST routes — which enforces creator, participant, public/private visibility, and admin checks. Also added warn/error logs on all rejection paths and try/catch on `ws.send()` in broadcast.
**Prevention:** When adding new access-controlled endpoints (including WebSocket), always reuse the existing access-check utility (`checkPlanAccess`) rather than writing ad-hoc queries. Every new feature should pass through a log-level analysis per backend rule #4.

### [AI] Anthropic model IDs get deprecated — use latest aliases or dated IDs

**Date:** 2026-03-26
**Problem:** `claude-3-5-haiku-20241022` returned 404 from the Anthropic API — the model was deprecated without warning.
**Solution:** Updated `model-provider.ts` to use `claude-haiku-4-5-20251001` (the current Haiku model as of March 2026).
**Prevention:** When setting AI model IDs, periodically verify they are still active. Consider using `latest` aliases where available, or pin to a dated version and add a comment noting when to check for updates.

### [AI] generateObject with output:'array' rejects entire response if one item fails validation

**Date:** 2026-03-26
**Problem:** The AI model occasionally drops required fields (quantity, unit) on 1-2 items out of 40. `generateObject` validates all items and throws `NoObjectGeneratedError` if any single item fails, discarding 38+ valid items.
**Solution:** Added `salvageFromRawText()` fallback: when `NoObjectGeneratedError` is caught, extract the raw JSON text, parse each item individually with `safeParse`, and return only the valid items.
**Prevention:** When using `generateObject` with `output: 'array'` and large output arrays, always implement a salvage/fallback path. LLMs will occasionally produce malformed items in large batches — don't let one bad item destroy the entire response.

### [AI] AI models return decimal quantities for food items — schema must allow floats

**Date:** 2026-03-26
**Problem:** Schema used `z.number().int().positive()` for quantity, but the AI naturally returns fractional values like `0.5 kg cheese`, `1.5 l milk`. Every food-heavy scenario failed Zod validation.
**Solution:** Changed to `z.number().positive()` (allowing decimals). Updated JSON schema from `type: 'integer'` to `type: 'number'`.
**Prevention:** When designing schemas for AI-generated content, consider how the model naturally expresses quantities. Food/weight/volume quantities are inherently fractional — don't force integers.

### [AI] Personal equipment qty=1 rule must be stated THREE times in the prompt

**Date:** 2026-03-26
**Problem:** Prompt said "Quantity = 1 per person" for personal_equipment, but the AI interpreted this as "1 × N people = N" and set qty to match group size.
**Solution:** Added the instruction in THREE places: (1) CATEGORY_RULES with "IMPORTANT:" prefix, (2) explicit "Do NOT multiply by group size", (3) CLOSING_INSTRUCTION reminder. After this triple reinforcement, all scenarios produce qty=1 consistently.
**Prevention:** For critical constraints the AI must follow, state them multiple times in different parts of the prompt — definition, explicit do/don't, and closing reminder. One mention is not enough.

### [Docker] New env vars break Docker E2E tests when required in production

**Date:** 2026-03-28
**Problem:** After adding `AI_PROVIDER` / `ANTHROPIC_API_KEY` env vars with production-required Zod `.refine()` guards, the `docker-compose.test.yml` (which uses `NODE_ENV=production`) was missing them. The API container crashed on startup during the Docker E2E test (`docker-health.test.ts`), blocking `git push`.
**Solution:** Added dummy values (`AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=sk-ant-docker-test-dummy`) to `docker-compose.test.yml`.
**Prevention:** Whenever adding a new env var that is required in production, immediately update `docker-compose.test.yml` with a dummy value. Treat it as part of the same change.

### [AI] Localized subcategories break "known vocabulary" assertions

**Date:** 2026-03-28
**Problem:** After updating the prompt to generate subcategories in the plan language (he/es) and encouraging custom labels, the prompt-quality test assertion `≥70% subcategories from known vocabulary` failed on every non-camping scenario (hotel 27%, winter 12%).
**Solution:** Replaced with a simpler `every item has a non-empty subcategory` assertion. Also removed the duplicated subcategory guidance from `plan-context-formatters.ts` (imported `SUBCATEGORY_GUIDANCE` from `prompt-templates.ts` instead).
**Prevention:** When changing prompt guidance from "prefer this list" to "use as inspiration", immediately check test assertions that assumed the old behavior (percentage-based vocabulary compliance checks).

### [Category] Short Title

**Date:** YYYY-MM-DD
**Problem:** One sentence describing what went wrong
**Solution:** One sentence describing the fix
**Prevention:** How to avoid this in the future
