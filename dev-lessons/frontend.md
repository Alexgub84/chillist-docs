# Frontend Dev Lessons

A log of bugs fixed and problems solved in `chillist-fe`.

---

<!-- Add new entries at the top -->

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

---

## Toast Notifications Pattern

**Context**: The app uses `react-hot-toast` for non-blocking feedback. The Toaster is in the root layout, so any screen can show toasts.

**How to show error messages**: In mutation handlers (e.g. create/update item), wrap the call in try/catch and use `getApiErrorMessage()` from `src/core/error-utils.ts` to get user-friendly `{ title, message }`, then call `toast.error(\`${title}: ${message}\`)`. This keeps error copy consistent and avoids exposing raw API messages.
