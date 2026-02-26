# Frontend Rules

Rules specific to the `chillist-fe` repository. Use alongside [common rules](common.md).

---

## Before Coding (after common Starting Work steps)

- Sync the OpenAPI spec and generated types: `npm run api:sync`

## Code Standards (FE-Specific)

- Use `clsx` for all dynamic or conditional `className` values — never use template literals or string concatenation for classNames
- Every API mutation function (`create*`, `update*`) must validate input with `.parse()` before sending — catch bad data client-side, not on the server
- If multiple API functions follow the same pattern, audit them all for consistency when fixing one

## Common Items Data (`src/data/common-items.json`)

- Every item must have a `subcategory` assigned from the taxonomy in `src/data/subcategories.ts`.
- Confirm for each new or edited item that the subcategory is assigned and fitting — avoid `"Other"` when a specific subcategory exists.
- Run `npx tsx scripts/enrich-common-items-with-subcategory.ts` to bulk-assign; then review and refine items in `"Other"`.

## Component Architecture

- **Self-contained features get their own component.** When a feature has its own data fetching, loading/error states, or distinct UI (e.g., weather forecast, map, share panel), extract it into a dedicated component. The parent route/page should only pass minimal props (e.g., coordinates, an ID) — not orchestrate the feature's data or state.
- **Every new component must have unit tests.** At minimum, test: renders correctly with valid data, handles loading state, handles error state, and renders nothing / fallback when data is unavailable.
- Prefer small, focused components over large monolithic ones — easier to read, test, and reuse.

## Route Files (TanStack Router)

- Default to **lazy routes** (`createLazyFileRoute` + `.lazy.tsx` suffix) for code-splitting
- Only use a non-lazy route (`createFileRoute` + plain `.tsx`) when the route needs eagerly-loaded features: `loader`, `beforeLoad`, search param validation, or other non-component route config
- The root route (`__root.tsx`) must always remain non-lazy

## OpenAPI Schema Alignment

### Source of Truth

The **backend** owns the OpenAPI spec. The frontend only **consumes** it.

- `src/core/openapi.json` is gitignored and fetched from the backend via `npm run api:fetch`
- **NEVER** edit `src/core/openapi.json` directly in the frontend repo
- To update the spec, make changes in the backend first, then run `npm run api:sync` to pull + regenerate types
- If you need a new field or endpoint, it must be implemented in the backend first

### NEVER Build FE Ahead of the BE (CRITICAL)

The FE must **never** contain fields, endpoints, or response shapes that don't exist in the BE OpenAPI spec. This applies to **all** FE layers:

- **Zod schemas** (`src/core/schemas/`) — every field must exist in the OpenAPI response schema. No "future" fields, no "optional just in case" fields.
- **Mock server** (`api/server.ts`) — response shapes must match the OpenAPI spec exactly. The mock server is a stand-in for the real BE, not a preview of a future BE.
- **E2E fixtures** (`tests/e2e/fixtures.ts`) — mock responses must match the OpenAPI spec. If the BE doesn't return a field, the fixture must not include it.
- **Component code** — never destructure, read, or render fields that the BE doesn't return. If a feature needs a field the BE doesn't have, **STOP** and tell the user it requires BE work first.

**When asked to build a feature that needs new BE fields or endpoints:**
1. **STOP** — do not write any FE code that depends on the missing field/endpoint
2. Tell the user: "This feature requires BE changes first: [list the fields/endpoints needed]"
3. Only after the BE ships the change and `npm run api:sync` pulls the updated spec should the FE be updated

**Why this is critical:** When the FE adds fields the BE doesn't return, the mock server masks the problem locally. Everything works in dev and tests. Then the page breaks on production because the real BE response doesn't match the FE schema. This is invisible until a real user hits it.

### Layer Checklist (update in this order when spec changes)

1. **Frontend Zod schemas** (`src/core/schemas/`) — mirror OpenAPI format constraints (`date-time` → `.datetime()`, `nullable` → `.nullish()`, `integer` → `.int()`, `maxLength` → `.max()`)
2. **E2E mock fixtures** (`tests/e2e/fixtures.ts`) — `buildPlan`, `buildItem`, `buildParticipant` factories and `mockPlanRoutes`/`mockPlansListRoutes` route handlers must return response shapes that match the OpenAPI response schemas
3. **Mock server for local dev** (`api/server.ts`) — request schemas, response shapes, and status codes must match OpenAPI definitions
4. **Mock data** (`api/mock-data.json`) — all values must satisfy the schemas above (valid UUIDs, RFC 3339 dates, `null` not `""` for nullable fields)
5. **Tests** — all mock/fixture data in unit and e2e test files must use valid formats matching the schemas

### E2E Mock Fixture Alignment

When an API endpoint changes (new fields, renamed fields, new endpoints), update `tests/e2e/fixtures.ts`:

- **Interfaces** — `MockPlan`, `MockItem`, `MockParticipant` must match the API response schemas
- **Builder functions** — `buildPlan`, `buildItem`, `buildParticipant` must produce valid response objects with all required fields
- **Route handlers** — `mockPlanRoutes`, `mockPlansListRoutes` must handle the same HTTP methods and URL patterns as the real API
- **POST/PATCH handlers** — must read the request body and update mock state consistently (e.g., POST adds to array, PATCH merges updates)

### Mock Server Endpoint Alignment (local dev)

For every path in `openapi.json`, verify the mock server (`api/server.ts`):

- **Exists** — every OpenAPI endpoint has a corresponding Fastify route
- **Method** — GET/POST/PATCH/DELETE matches
- **Request body validation** — Zod schema fields, required vs optional, enums, and constraints match the OpenAPI `requestBody` schema
- **Response status code** — matches the OpenAPI success response (e.g. 200, 201)
- **Response shape** — returned JSON matches the OpenAPI response schema
- **Path parameters** — validated the same way (e.g. `format: "uuid"`)

### Enum Alignment (CRITICAL — the backend owns all enum values)

The backend is the **single source of truth** for all enum values (units, statuses, categories, roles, visibility). The FE derives them from the generated types and adds display concerns (translations, groups, colors).

**When asked to add or change an enum value**: **STOP** — it must be added to the **backend** first. Then `npm run api:sync`, then update the FE layers.

**How it's wired:**

| Layer | What | How it stays in sync |
|---|---|---|
| `src/core/api.generated.ts` | Generated types from OpenAPI | `npm run api:sync` (NEVER edit manually) |
| `src/core/schemas/*.ts` | Zod enums | `as const satisfies readonly BEType[]` — TS error if FE has values BE doesn't |
| `src/core/constants/*.ts` | UI display config (groups, colors) | FE-owned, uses Zod `Unit`/`ItemStatus` types |
| `src/i18n/locales/*.json` | Translations (EN + HE) | `enum-translations.test.ts` fails if any value is missing |
| `api/server.ts` | Mock server | Must mirror BE enum values exactly — never more lenient |

**Translation coverage test** (`tests/unit/core/enum-translations.test.ts`): verifies every Zod enum value has a key in both `en.json` and `he.json`. If the BE adds a value and the FE adds it to the Zod array but forgets translations, the test fails.

### Field-Level Checklist

- `format: "date-time"` → `z.string().datetime()` in **create/patch schemas** (input validation); `z.string()` in **response schemas** (BE may return non-strict ISO formats). See dev-lessons 2026-02-25 "Strict Zod .datetime() Breaks Production Responses".
- `nullable: true` + not required → `.nullish()` in frontend, `.nullable().optional()` in mock server and e2e fixtures
- `type: "integer"` → `.int()` everywhere
- `minLength` / `maxLength` → `.min()` / `.max()` everywhere
- `format: "uuid"` → IDs in mock data and e2e fixtures must be valid UUIDs (use `randomUUID()`)
- Required fields in OpenAPI → NOT `.optional()` in Zod, and present in e2e fixture builders
- Fields NOT in an OpenAPI request body → NOT accepted by the mock server's Zod schema
- **Enum values** in OpenAPI → the exact same set in FE Zod schemas, constants, mock server, and translations. No extra values, no missing values.

## Testing

- All tests live under `tests/` with sub-folders: `tests/unit/`, `tests/integration/`, `tests/e2e/`
- Test assertions must verify value **format correctness** (e.g. ISO 8601 dates end with `Z`), not just structural presence
- **Cross-boundary rule:** When a feature flow involves more than one component/layer (e.g. auth form → context → API → server → UI), unit tests alone are NOT sufficient. You MUST also add an integration or E2E test that verifies the full flow end-to-end. Unit tests prove each piece works alone; integration tests prove they work together. Never use independent hardcoded values across unit tests for data that should be consistent (e.g. the same email appearing in the Header and the toast).
- **Async side-effect ordering rule:** When a feature requires an async API call (claim, sync, link) to complete BEFORE navigation or UI update, the integration test must verify the ordering — assert that the side effect completed (e.g. participant has `userId`) AND that navigation happened AFTER, not just that both occurred independently. Fire-and-forget patterns (`.then()` / `.catch()` without await) are red flags — if the ordering matters, the test must prove it.

### Unit Tests — Avoiding `act(...)` Warnings

React warns when state updates happen outside of `act()` during tests. These warnings indicate the test isn't properly accounting for async behavior. Follow these rules to prevent them:

1. **Router navigation** — Wrap `router.navigate()` calls in `act()`:
   ```typescript
   await act(async () => {
     router.navigate({ to: '/plans' });
   });
   ```

2. **Components with async `useEffect`** (e.g., `AuthProvider` calls `getSession()` on mount) — When a component updates state asynchronously on mount, either:
   - Use `await waitFor(() => { ... })` after render to let the async update settle before asserting
   - Wrap `renderHook()` in `act(async () => { ... })` when testing hooks inside such providers

3. **Timers that trigger state updates** — When using `setTimeout` or `new Promise` to wait for component state changes, wrap in `act()`:
   ```typescript
   await act(async () => {
     await new Promise(r => setTimeout(r, 100));
   });
   ```

4. **Headless UI animations** — `tests/setup.ts` polyfills `Element.prototype.getAnimations` to prevent Headless UI's own polyfill warnings. Do NOT use `jsdom-testing-mocks` `mockAnimationsApi()` — it breaks TanStack Router rendering in tests.

5. **Global test setup** (`tests/setup.ts`) — When adding a new context or module with side effects at import time, add a global mock to `tests/setup.ts` immediately. Current global mocks: `useLanguage`, `@vis.gl/react-google-maps`, `supabase`, `getAnimations` polyfill.

- **E2E (Playwright):**
  - Use `page.route()` for all API mocking — no external mock server dependency
  - Use the shared fixtures in `tests/e2e/fixtures.ts` (`buildPlan`, `mockPlanRoutes`, etc.) to set up mock data
  - When adding a new API endpoint or changing response shapes, update `tests/e2e/fixtures.ts` FIRST, then write the test
  - **Add new tests to existing spec files** — only create a new spec file for a major new flow (e.g. a whole new page). Small features, bug fixes, and enhancements go into the existing `main-flow.spec.ts` (plan detail) or `plans.spec.ts` (plans list) under the appropriate describe block
  - Don't test loading states — they are transient and flaky with fast API responses
  - Test final outcomes: wait for content or errors to appear, not spinners
  - Use specific URL patterns in `page.route()` (e.g. `**/localhost:3333/plans`) — broad patterns can intercept page navigation
  - **Pre-push hook runs all browsers** (Chrome, Firefox, Safari, Mobile Safari) for thorough local validation. CI runs Chrome only as the required gate. To test Linux-WebKit parity, run `npm run e2e:docker`
  - **WebKit form submissions** in Headless UI modals require `click({ force: true })` on submit buttons and `toBeHidden({ timeout: 10000 })` — Linux-WebKit behaves differently from macOS-WebKit
  - **Responsive UI tests** must use Playwright's `isMobile` fixture to handle mobile vs desktop paths (e.g., hamburger menu vs desktop nav). Elements hidden behind responsive breakpoints (`hidden sm:flex`) are invisible on mobile viewports
  - **Testing layers:** Pre-push (Husky) runs all 4 browsers for thorough local validation. CI (`ci.yml`) runs Chrome only as the required gate (blocks merge). Deploy (`deploy.yml`) runs no tests — build + deploy only, trusts CI. Branch protection on `main` ensures no untested code is deployed
  - **Auth-gated UI tests** must cover 3 states: owner (authenticated + owns plan), non-owner (authenticated + different userId), unauthenticated (no `injectUserSession`). Any E2E test that interacts with auth-gated elements must call `injectUserSession(page)` first
  - **Locator scoping:** When header and main content share identical links (e.g., both have "Sign In"), scope locators to `page.getByRole('main')` to avoid strict mode violations from multiple matches

## Logging and Error Handling

- **Every `catch` block must log the error** with enough context to reproduce the issue: function/module name, relevant IDs (planId, participantId, itemId, endpoint), and the error message. Never use empty `catch {}`.
- **Log format:** `[Module] What happened — key="value", token="first8…". Error: message`
- **Log levels:** `console.error` for failures that break functionality; `console.warn` for recoverable issues and fallbacks; `console.info` for important flow events (auth attempts, claims, invite storage); `console.debug` for no-op/skip paths.
- **Security:** Truncate tokens/secrets to first 8 characters in logs. Never log full JWTs or invite tokens.
- **Critical API paths** (auth, invite, claim) should log both success and failure so you can trace the full flow in the console.
- When `toast.error()` is shown to the user, also `console.error()` the full error details (the toast only shows a friendly message, the console log helps debugging).

## Auth and User Data

- The Supabase client (`@supabase/supabase-js`) is the source of truth for auth state. Do NOT duplicate session data in separate state stores.
- Use `supabase.auth.onAuthStateChange()` to react to session changes (login, logout, token refresh). Update app-level auth context from this listener.
- Always read the access token from `supabase.auth.getSession()` right before making BE API calls. Do NOT cache tokens in variables or state — they expire and auto-refresh.
- After `supabase.auth.updateUser(...)` profile changes, handle `USER_UPDATED` by calling `supabase.auth.refreshSession()` first, then `POST /auth/sync-profile` with the refreshed JWT. The sync call should be non-blocking (fire-and-forget) and failures should be logged without breaking UX.
- Pre-fill owner info from `session.user` (email, `user_metadata.full_name`) when creating plans via `POST /plans/with-owner`.
- Do NOT make authorization decisions client-side. The BE enforces access via JWT verification. Client-side checks are for UX only (e.g., hiding an "Edit" button), not security.
- **Plan visibility is gated by auth state in `PlanForm`:** signed-in users see `private` (default) and `invite_only`; not-signed-in users see only `public`. The `useAuth` hook determines auth state.
- Never log access tokens or refresh tokens to the browser console in production.

### Admin Role Detection

- The admin role is stored in `app_metadata.role` in the Supabase JWT. After sign-in, `AuthProvider` reads `user.app_metadata.role` — if it equals `"admin"`, `isAdmin` is set to `true` in the auth context.
- Use `const { isAdmin } = useAuth()` in components to conditionally render admin-only UI (e.g., delete buttons on the plans list).
- Admin checks are UX-only — the BE enforces access control. Never trust `isAdmin` for security decisions.
- The mock auth (`src/lib/mock-supabase-auth.ts`) supports `app_metadata` on mock users. E2E tests inject admin sessions via `injectAdminSession(page)` from `tests/e2e/fixtures.ts`.

### Auth-Gated UI Pattern

The app conditionally renders UI elements based on authentication state and plan ownership. These checks are **UX-only** — the BE enforces real access control via JWT.

**Authentication state** (signed in vs not):
- Use `const { user } = useAuth()` → `const isAuthenticated = !!user`
- Example: Plans list shows "Create New Plan" for signed-in users, "Sign In" / "Sign Up" for guests
- Example: Invite page auto-redirects to the plan for signed-in users, shows "Sign in to join" / "Create an account" for guests

**Plan ownership** (owner vs non-owner):
- Derive from participants: `const owner = plan.participants.find(p => p.role === 'owner')` → `const isOwner = !!user && !!owner?.userId && user.id === owner.userId`
- Gate edit actions with `isOwner` — pass `undefined` as callback props to hide edit buttons (e.g., `onEditPreferences={isOwner ? handler : undefined}`)
- Example: Only the owner sees "Edit" buttons on participant preference cards, the "Edit Plan" button, and RSVP status badges

**When adding new auth-gated UI:**
1. Determine the gating level: authentication (signed in?) or ownership (is owner?)
2. Pass the boolean as a prop or derive it locally
3. Conditionally render or pass `undefined` for optional callback props — component hides the UI when the prop is falsy
4. Add E2E tests for all 3 states: owner, non-owner (authenticated), unauthenticated

### JWT 401 Retry and Auth Error Modal

- On 401 from the BE, the API layer (`src/core/api.ts` `request()`) must call `supabase.auth.refreshSession()` and retry the request **once** with the new token before failing.
- On final 401 (after retry fails or refresh fails), show the `AuthErrorModal` — a modal dialog prompting the user to sign in or dismiss. Never use a transient toast for auth failures; the modal forces the user to acknowledge the problem.
- The auth error bus (`src/core/auth-error.ts`) bridges the non-React API layer and the React modal. Use `emitAuthError()` in API code, subscribe via `onAuthError()` in React (`AuthProvider`).
- Both API layers (`api.ts` primary and `api-client.ts` openapi-fetch) must inject the JWT `Authorization: Bearer` header on every request when the user is signed in.

## i18n (Internationalization)

- All user-facing strings must use `t()` from `useTranslation()` (react-i18next) — never hardcode text in JSX
- Translation files: `src/i18n/locales/en.json` (English) and `src/i18n/locales/he.json` (Hebrew)
- When adding a new string: add the key + value to **both** locale files in the same PR
- For module-level constants that contain labels (e.g., status configs, tab labels), either move them inside the component or use translation keys instead of literal strings
- Use `i18n.t()` (imported from `src/i18n`) for non-component code (e.g., toast messages in AuthProvider)
- Use Tailwind logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`) instead of directional ones (`ml-*`, `mr-*`, etc.) so layouts work in both LTR and RTL
- API enum values (status, visibility, roles, units, categories) must be translated at display time with `t('namespace.${value}')` — never render raw API strings directly
- Language context: `useLanguage()` hook provides `language` and `setLanguage`. `LanguageProvider` wraps the app in `__root.tsx`
- Language is persisted to `localStorage('chillist-lang')`

## Changelog (`src/data/changelog.ts`)

Before every push, update the changelog with entries for any **user-visible** changes included in the branch:

- New features, UI changes, new pages/routes, new language support, layout improvements — anything a user would notice.
- Do **NOT** add entries for: refactors, test-only changes, dependency bumps, docs updates, or purely internal fixes with no visible effect.

Each entry has `date` (YYYY-MM-DD), `title` (short feature name), and `description` (1–2 sentences explaining the change from a user's perspective).

**Newest entries go at the top** of the `changelog` array.

The changelog is displayed on the admin-only `/admin/last-updated` page (English-only, hardcoded strings — no `t()` calls). The page is excluded from tests.

## Finalization

1. Run validation: `npm run typecheck && npm run lint && npm run test:unit`
2. Fix any failures automatically
3. Ask for user confirmation
4. Follow the common [Git Workflow](common.md#git-workflow) (commit, push, PR)
