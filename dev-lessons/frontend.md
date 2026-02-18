# Frontend Dev Lessons

A log of bugs fixed and problems solved in `chillist-fe`.

---

<!-- Add new entries at the top -->

### [Test] Headless UI Combobox option click fails on Mobile Safari in Playwright — "element is not stable"
**Date:** 2026-02-18
**Problem:** E2E test `Item CRUD › adds items via UI` failed consistently on Mobile Safari (WebKit) in CI. Playwright reported `TimeoutError: locator.click: element is not stable` when clicking a `ComboboxOption` inside a Headless UI dropdown with `transition` + `anchor="bottom start"` (Floating UI). Chrome and Firefox passed. All 3 retries failed identically.
**Solution:** Split the click into two steps: first `await expect(option).toBeVisible()` to confirm the option rendered, then `await option.click({ force: true })` to bypass the stability check. The element was found and correct — only the stability detection was broken due to Floating UI anchor repositioning on WebKit.
**Prevention:** When using Headless UI Combobox/Listbox with `transition` + `anchor` props, use `force: true` on option clicks in Playwright E2E tests after asserting visibility. This is a known Playwright/WebKit issue with floating positioned elements that continuously recalculate position.

---

### [Infra] Deploy validation included legacy VITE_API_KEY — no env var source of truth
**Date:** 2026-02-18
**Problem:** Deploy validation step failed with `Missing required environment variables: VITE_API_KEY VITE_SUPABASE_ANON_KEY`. `VITE_API_KEY` was copied from the old build step into validation without checking if it was required or even existed in GitHub secrets. The code falls back to `''` — it's optional. `VITE_SUPABASE_ANON_KEY` hadn't been added as a GitHub repo variable yet. A commented-out entry in `.env.example` (`# VITE_API_KEY=...`) created the false signal that the var was needed.
**Solution:** Removed `VITE_API_KEY` from validation and build steps. Removed commented-out entry from `.env.example`. Added env var checklist to common rules: before pushing, verify all 6 locations are in sync (`.env.example`, `.env`, GitHub settings, workflow files, validation step, guides doc).
**Prevention:** `.env.example` only contains active uncommented vars — no legacy entries. Deploy validation only checks vars the app requires (throws without). Follow the 6-point env var checklist in common rules before every push that touches env vars.

---

### [Infra] Deploy job must validate all required env vars before building
**Date:** 2026-02-18
**Problem:** The deploy job in `deploy.yml` would silently produce a broken build if any GitHub secret/variable was missing (e.g., `VITE_SUPABASE_URL` not set). The build would succeed but the deployed app would crash at runtime.
**Solution:** Added a "Validate required environment" step as the first step in the deploy job. It checks all 7 required vars (`VITE_API_URL`, `VITE_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PROJECT_NAME`) and fails with a clear `::error::` message listing which ones are missing.
**Prevention:** Every CI deploy job should have an env validation step that runs before checkout/install/build. Fail fast with a clear message, not silently after a 5-minute build.

---

### [Infra] Playwright `html` reporter produces no stdout in CI — can't see test progress
**Date:** 2026-02-18
**Problem:** GitHub Actions E2E step showed only "Run E2E tests" with no output while tests were running. The Playwright config used `reporter: 'html'` which writes to a file, not stdout.
**Solution:** Set CI reporter to `[['list'], ['github'], ['html', { open: 'never' }]]`. `list` prints each test name/result to stdout (visible in Actions logs), `github` adds inline failure annotations on the PR, `html` keeps the artifact for the upload step. Locally it stays `'html'` only.
**Prevention:** Always configure a stdout-friendly reporter (`list` or `dot`) for CI alongside `html`. The `github` reporter is free and adds PR annotations on failures.

---

### [Infra] E2E tests hang in CI — missing VITE_AUTH_MOCK env var
**Date:** 2026-02-18
**Problem:** After adding Supabase auth, E2E tests hung for 12+ minutes in GitHub Actions. The Vite dev server started fine, but the app crashed at runtime because `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` weren't set in the CI environment. Without `VITE_AUTH_MOCK=true`, `supabase.ts` tried to create a real client and threw. Every test timed out (60s × 3 attempts with retries). Locally it worked because `.env` (gitignored) had `VITE_AUTH_MOCK=true` — CI has no `.env` file.
**Solution:** Added `VITE_AUTH_MOCK: 'true'` as an env var on the E2E test steps in both `ci.yml` and `deploy.yml`.
**Prevention:** When a module has env-var-gated behavior (mock vs real), always set the mock flag in CI workflow files. Add it at the same time as the feature, not after CI breaks. Remember: `.env` is gitignored — anything it provides locally must be explicitly set in CI.

---

### [Infra] E2E running 30 tests on 1 worker in CI — slow pipeline
**Date:** 2026-02-18
**Problem:** Playwright E2E tests ran 30 tests (3 browsers × ~10 specs) on a single worker in GitHub Actions, making CI very slow. The config had `fullyParallel: true` but no explicit `workers`, and the 2-core CI runner defaulted to 1.
**Solution:** Set `workers: process.env.CI ? 2 : undefined` in `playwright.config.ts`. Split CI: PR checks install and run Chrome only (`--project="Desktop Chrome"`), while `main` pushes run all 3 browsers. This cuts PR E2E time by ~2/3 (fewer browsers + fewer browser installs).
**Prevention:** Always set explicit `workers` for CI in Playwright config. Only run the minimum browser set needed for fast PR feedback; save full cross-browser coverage for post-merge.

---

### [Logic] Mock auth must fire all Supabase events — updateUser needs USER_UPDATED
**Date:** 2026-02-18
**Problem:** After saving profile data on `/complete-profile`, the name wasn't reflected in the Header. The mock `updateUser` in `mock-supabase-auth.ts` saved to localStorage but never fired `onAuthStateChange` with `USER_UPDATED`. The real Supabase client fires this event, which AuthProvider already handles generically (it updates user state for any event). Without the event, the React state stayed stale.
**Solution:** Added `notify('USER_UPDATED', session)` to the mock `updateUser` method, and the same pattern in the integration test's `updateUser` mock.
**Prevention:** When adding a new Supabase auth method to the mock, check what events the real client fires (see Supabase docs: `onAuthStateChange` events) and replicate them in the mock. Add an integration test that verifies the UI updates after the operation, not just that the method was called.

---

### [Test] Unit tests in isolation miss cross-boundary bugs — add integration tests
**Date:** 2026-02-18
**Problem:** Header showed one email (from Supabase session) while the sign-in toast showed a different email (from mock server `/auth/me`). Three unit test suites (Header, AuthProvider, mock server) each used their own hardcoded emails independently and all passed, but no test verified the values matched across boundaries.
**Solution:** Created `tests/integration/auth-flow.test.tsx` that wires mock Supabase auth → AuthProvider → real mock server (on a dynamic port via `buildServer()`) → Header, testing the full sign-up/sign-in/OAuth/sign-out flows end-to-end. The key assertion: the email in the toast (from `/auth/me` JWT decode) matches the email in the Header (from session).
**Prevention:** When a value flows through multiple systems (auth provider → API → backend → UI), add an integration test that crosses all boundaries. Unit tests only prove each piece works alone.

---

### [Logic] Mock server /auth/me must read JWT payload, not return hardcoded data
**Date:** 2026-02-18
**Problem:** Header showed one email (from Supabase mock session) while the sign-in toast showed a different email (from `GET /auth/me`). The mock server's `/auth/me` endpoint always returned a hardcoded `test@chillist.dev` regardless of who signed in.
**Solution:** Updated `/auth/me` in `api/server.ts` to decode the JWT payload from the Authorization header and extract `email` and `sub` from it, falling back to defaults for malformed tokens.
**Prevention:** Mock server auth endpoints should always derive user identity from the token, not return static data. This keeps mock behavior consistent with real Supabase+BE behavior.

---

### [Arch] New domain concerns need their own file from day one
**Date:** 2026-02-17
**Problem:** `fetchAuthMe` schema and function were added to `api.ts` alongside plans/participants/items CRUD, making the file 270+ lines with mixed concerns. Discovered during separation audit.
**Solution:** Extracted `authMeResponseSchema` and type to `src/core/auth-api.ts`. `api.ts` imports from it.
**Prevention:** When adding a new domain (auth, weather, assignments), create a dedicated file (`auth-api.ts`, `weather-api.ts`) instead of appending to the existing CRUD file. One domain per file.

---

### [Test] Export route components for testability
**Date:** 2026-02-17
**Problem:** `SignIn` and `SignUp` components in `.lazy.tsx` route files were not exported, only passed to `createLazyFileRoute`. Tests couldn't import them directly. The existing `About` component already followed the export pattern but it wasn't replicated.
**Solution:** Added `export` keyword to `function SignIn()` and `function SignUp()`. Tests import the named export directly.
**Prevention:** Every component in a `.lazy.tsx` route file should be a named export (`export function X`), matching the pattern in `about.lazy.tsx`. This allows direct imports in unit tests without dynamic import hacks.

---

### [Test] Module-level side effects break unrelated tests — mock globally
**Date:** 2026-02-17
**Problem:** Adding `import { supabase } from '../lib/supabase'` to `api.ts` caused 3 unrelated test files (ErrorPage router tests, CreatePlan navigation test) to crash. `supabase.ts` throws at import time when env vars are missing, and these tests transitively import `api.ts`.
**Solution:** Added a global Supabase mock in `tests/setup.ts` so every test file gets the mock automatically. Individual test files can override it with their own `vi.mock()`.
**Prevention:** When a new module has side effects at import time (env validation, network calls, etc.), immediately add it to the global test setup mock. Don't wait for tests to break.

---

### [Arch] react-refresh/only-export-components and React Context
**Date:** 2026-02-17
**Problem:** Exporting both a React context (`createContext`) and a component (`AuthProvider`) from the same `.tsx` file triggers `react-refresh/only-export-components`.
**Solution:** Split into three files: `auth-context.ts` (context + type), `AuthProvider.tsx` (component only), `useAuth.ts` (hook only).
**Prevention:** Never export `createContext` and a component from the same file. Separate context definition, provider component, and consumer hook into distinct files.

---

### [Test] Auth E2E tests deferred
**Date:** 2026-02-17
**Problem:** Supabase auth flows in E2E tests require either mocking the Supabase client in Playwright or a dedicated test project.
**Solution:** Deferred to issue #67. Unit tests cover JWT injection, fetchAuthMe, and the mock server /auth/me endpoint. Component-level integration tests for sign-in/sign-up pages are also deferred.
**Prevention:** When adding auth, plan the E2E test strategy upfront.

---

### [Types] tsc --noEmit Can Miss Errors the IDE Catches (TanStack Router)
**Date:** 2026-02-15
**Problem:** `npm run typecheck` passed with exit 0, but the IDE flagged 3 type errors in `plan.$planId.lazy.tsx` — a `Promise<void>` mismatch and `useNavigate` search callback inference failures.
**Solution:** Fixed by typing `useNavigate({ from: '/plan/$planId' })`, using direct search objects instead of callbacks, and wrapping `mutateAsync` to return `void`.
**Prevention:** After editing route files, always check IDE linter diagnostics (`ReadLints`) in addition to running `tsc`. TanStack Router's type inference depends on the generated route tree, which the dev server keeps fresh but `tsc` may run against a stale version.

---

## 2026-02-12: OpenAPI Spec Drift — Frontend Edited the Contract Directly

**Problem**: Backend query failed with `column plans_items.assigned_participant_id does not exist`. The backend Drizzle ORM schema referenced a column that was never added to the database.

**Root Cause**: The OpenAPI spec (`src/core/openapi.json`) was edited directly in the frontend repo — `assignedParticipantId` was added to the Item, CreateItemBody, and UpdateItemBody schemas. All frontend layers (Zod schemas, mock server, generated types) were aligned to the updated spec, but no database migration was ever created on the backend. The backend ORM picked up the new field from the shared contract, generating SQL for a column that didn't exist.

**Solution**:
- Gitignored `src/core/openapi.json` so it can never be edited locally again
- Added `predev` script to auto-fetch the spec from the backend on `npm run dev`
- Added `npm run api:fetch` step to CI pipeline before lint/typecheck/build
- Updated workflow rules to clarify the backend owns the spec

**Lessons**:
1. The OpenAPI spec must be owned by the backend — the frontend should only fetch and consume it, never edit it
2. A committed spec file with no guardrails can be silently modified, causing schema drift between frontend and backend
3. Gitignoring generated/fetched files and auto-fetching them in dev/CI is the strongest guardrail against accidental edits
4. When aligning schemas, always verify changes flow from backend (migration + spec) to frontend (fetch + regenerate), not the other way around

---

## 2026-02-08: Zod Schemas Must Mirror OpenAPI Format Constraints

**Problem**: Creating a new plan failed with `body/startDate must match format "date-time"`. The `makeDateTime` helper produced `2025-12-20T10:00:00` (no timezone designator), which is not valid RFC 3339.

**Root Cause**: Three layers of defense all had gaps:
1. Zod schemas used `z.string().optional()` instead of `z.string().datetime().optional()`, silently dropping the `format: "date-time"` constraint from the OpenAPI spec.
2. `createPlan()` and `updatePlan()` did not validate input before sending (unlike `createParticipant()` / `createItem()` which already called `.parse()`).
3. Tests asserted the wrong date format (`'2025-12-20T10:00:00'` instead of `'2025-12-20T10:00:00Z'`), encoding the bug as expected behavior.

**Solution**:
- Appended `Z` to `makeDateTime` output in `PlanForm.tsx`.
- Added `.datetime()` to all date fields in Zod schemas (`planSchema`, `planCreateSchema`).
- Added input validation (`.parse()`) to `createPlan()` and `updatePlan()` for parity.
- Fixed all test assertions and added schema-level + API-level tests for date format.

**Lessons**:
1. When hand-writing Zod schemas from an OpenAPI spec, always translate `format` constraints (e.g. `date-time` → `z.string().datetime()`), not just the `type`.
2. Every API mutation function should validate input with `.parse()` before sending — catch bad data client-side.
3. Tests that assert payload shape should verify format correctness, not just structural presence.
4. If multiple API functions follow the same pattern, audit them all for consistency.

---

## 2026-02-05: E2E Testing Best Practices

**Problem**: Playwright E2E tests were flaky — checking for "Loading..." state was unreliable because data loads too fast.

**Root Cause**: Loading states are transient and timing-dependent. In E2E tests with a local mock server, API responses return almost instantly, making loading states appear for only milliseconds.

**Solution**: Don't test loading states in E2E tests. Instead, wait for the final content to appear.

**Lessons**:
1. Don't check loading states in E2E — they're too fast/flaky to reliably test
2. Use specific route patterns — when mocking API calls with `page.route()`, use specific URL patterns (e.g., `**/localhost:3333/plans`) to avoid intercepting page navigation
3. Test final outcomes, not intermediate states — wait for content/errors to appear, not loading spinners

