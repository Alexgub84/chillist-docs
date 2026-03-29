# Frontend Rules

Strict, minimal rules for `chillist-fe`. Use alongside [common rules](common.md).

## 1) Start Order (Required)

1. Read `README.md` in `chillist-fe`.
2. Identify target files using the route/folder maps.
3. Open only those files.
4. Open deep docs only when needed.

## 2) Non-Negotiables

- **Backend owns OpenAPI.** Frontend consumes it. Never hand-edit `src/core/api.generated.ts` or `src/core/openapi.json`.
- **Never build FE ahead of BE.** Never add fields/endpoints/enums in frontend before backend ships them.
- Use `clsx` for conditional `className` logic.
- Use lazy routes by default (`*.lazy.tsx` + `createLazyFileRoute`). Non-lazy only for route config (`loader`, search validation).
- Treat client auth/role checks as UX only. Backend is the security authority.

## 3) API and Schema Rules

- Mutation functions must validate request input with `.parse()` before sending.
- Response schemas should be strict on structure, lenient on backend date string formatting (`z.string()` for dates in responses, `.datetime()` for inputs).
- Keep schema/mock/fixtures aligned with OpenAPI:
  - `src/core/schemas/*`
  - `api/server.ts`
  - `tests/e2e/fixtures.ts`
- If one API function in a pattern is fixed, audit its siblings for the same issue.
- **Phone numbers must be E.164 before leaving the frontend.** Use `combinePhone` (which delegates to `normalizePhone`) on form submit, then validate with `isValidE164`. If invalid, `setError` on the phone field. If the BE returns 400 with "phone" in the message, surface it as a field-level error, not a toast.
- **Model all response variants.** An endpoint can legitimately return different shapes for the same 2xx status (e.g. `PlanWithDetails` vs `{ status: 'not_participant', preview, joinRequest }`). When implementing or changing any `fetchX` function: (1) check the OpenAPI spec for `oneOf`, `anyOf`, or multiple 2xx response schemas; (2) define a Zod schema for every variant; (3) branch on a discriminant field before parsing. Never assume every successful response is the happy-path shape.

## 4) Auth and Invite Rules

- Read JWT from `supabase.auth.getSession()` right before API calls. Do not cache tokens.
- On backend 401, refresh session and retry once; surface final auth failure with `AuthErrorModal`, not only a toast.
- For invite-auth linking flows, if ordering matters, await side effects before navigation.
- Never use silent `catch {}` in auth/invite paths.

## 5) UI, i18n, and Component Rules

- Extract repeated patterns into shared components when used in 3+ places.
- **Always use `data-testid` for testable elements.** It is the best way to target elements in E2E and unit tests. Add `data-testid` (or a `testId` prop on shared components like Modal) on: buttons, links, dialogs, forms, and any element tests need to interact with or assert on. Prefer `getByTestId` over `getByRole`, `getByText`, or `getByLabel` — test IDs are stable across i18n changes, layout shifts, and Headless UI transitions.
- For auth-gated UI changes, cover owner, non-owner authenticated, and unauthenticated states.
- **AI item suggestions** on the plan page and Manage Items route are **owner-only** in the UI (inline button + floating menu). Wizard step during plan creation remains available to the creator (owner flow).
- All user-facing strings must use `t()` from `useTranslation()`. Add keys to both `en.json` and `he.json`.
- **Form validation messages must use `t()`.** Never hardcode English strings in Zod schemas used by forms. Convert static schemas to factory functions: `function buildXxxSchema(t: (key: string) => string)` and call `buildXxxSchema(t)` inside the component. Use `validation.*` i18n keys. Type inference: `z.infer<ReturnType<typeof buildXxxSchema>>`.
- API enum values must be translated at display time (`t('namespace.${value}')`), not stored translated.

## 6) Testing Rules

- Every behavioral change requires matching test updates.
- **MANDATORY: Use `getByTestId` / `data-testid` for ALL interactive elements** in E2E and unit tests. NEVER use `getByText`, `getByRole({ name })`, or `getByPlaceholderText` to click or interact with buttons, links, inputs, or toggles — these break when text changes (i18n, added descriptions, rewording). `getByText` is ONLY acceptable for asserting that data content appears (e.g., checking a plan name is visible). When adding a new interactive element to a component, always add `data-testid` immediately.
- **MANDATORY for “did this step/section render?” assertions:** Treat wizard steps, section headings, empty states, and modal titles as **i18n surfaces** — copy changes constantly. Do **not** use `getByText(/some english/i)` or `getByRole('heading', { name: /…/ })` against UX copy from `t()`. Add or reuse a stable `data-testid` on the step root, form, or region (e.g. `edit-wizard-step2`, `preferences-steppers`) and assert with `getByTestId`. Reserve `getByText` for **domain data** the test created (a specific item name, a known plan title), not for labels that designers/translators edit.
- **Why this keeps getting missed:** Section 6’s first bullet only said “interactive elements,” so tests still used English regex for headings. That is the same class of fragility — extend the rule to **any** selector that would break when `en.json` changes.
- **E2E click on WebKit mobile:** If a Playwright `click()` or `click({ force: true })` silently fails on Mobile Safari (URL doesn't change, handler doesn't fire), use `locator.evaluate((el: HTMLElement) => el.click())` instead. This fires a native DOM click event, bypassing Playwright's touch-event simulation which can silently fail on WebKit after async re-renders. See dev-lesson: *Mobile Safari click + SPA navigation*.
- **E2E SPA navigation assertions:** Use `expect(page).toHaveURL(...)` to assert URL changes after in-app navigation. **NEVER** use `page.waitForURL` — it waits for a browser navigation event that `history.pushState` does not fire. **NEVER** use `toPass` to retry-click a mutation/navigation button — each retry re-triggers the side effect.
- Cross-boundary flow change (route + context + API + UI) requires integration or E2E coverage, not only unit tests.
- E2E should assert final outcomes, not transient loading states.
- For responsive flows, include mobile/desktop paths when UI differs (use Playwright's `isMobile`).
- Wrap async state updates (navigation, timers, provider mounts) in `act()` in unit tests.
- **Test every API response variant, not only the happy path.** For each `fetchX` function in `src/core/api.ts`, write a unit test in `tests/unit/core/api.test.ts` for every shape the backend can return — success, access-restricted (e.g. `not_participant`), empty list, and Zod schema mismatch. A function with only a happy-path test has incomplete coverage and is a production risk.
- **Updating `api/server.ts` is mandatory** whenever any of the following change: a new endpoint is added, an existing endpoint gains a new response shape or access-control state, a field is renamed or removed. The mock server is the test contract — letting it drift from the real API is the most common cause of bugs that pass all tests but fail in production. Treat `api/server.ts` as a first-class code artifact, not a one-time scaffold.
- **`tests/e2e/fixtures.ts` must be updated in the same PR as any API endpoint change.** `api/server.ts` (unit test mock) and `fixtures.ts` (E2E mock) are two separate mock layers — updating one does NOT update the other. Whenever an endpoint URL, HTTP method, or response shape changes: update both files. Common failure: refactoring to a `/bulk` endpoint, updating `api/server.ts`, but leaving `fixtures.ts` pointing at the old URL. This passes all unit tests but breaks every E2E test that exercises the flow.
- **E2E mock responses must match the Zod schema the app parses.** Never mock an endpoint with `{ ok: true }` when the real handler returns a structured response. Check `src/core/api.ts` to see what `bulkItemResponseSchema`, `itemSchema`, etc. require, and make mock responses satisfy those schemas exactly.
- **Every E2E test failure must be recorded in `dev-lessons/frontend.md`.** When an E2E test fails during a push: (1) identify the root cause before patching; (2) fix the underlying issue; (3) add a dev-lesson entry at the top with: date, failing test names, root cause, solution, and lesson. This prevents the same category of breakage from recurring silently.

## 7) Logging and Error Handling

- Every catch block must log context (module + key ids + error message).
- When showing `toast.error`, also log full error details.
- Never log full tokens/secrets. Truncate sensitive values.

## 8) WhatsApp

- For any WhatsApp-related task, read [specs/whatsapp.md](../specs/whatsapp.md) first — it is the single source of truth for current state, planned features, architecture, and BE gaps.

## 9) Pre-Change Checklist

- Confirm backend already provides required contract fields/endpoints.
- Identify route, component, hook, API, and tests that the change touches.
- Confirm whether auth gating, i18n, and owner/admin conditions are affected.
- Does the API endpoint return more than one response shape? If yes: are all shapes defined in `src/core/schemas/`? Is each shape tested in `tests/unit/core/api.test.ts`? Is the mock server handler in `api/server.ts` updated to return the alternative shape when appropriate?

## 10) Pre-Push Checklist

- **NEVER** use `--no-verify` on push or commit. Husky pre-push hooks run typecheck, unit, integration, and E2E tests — they exist to prevent broken code from being pushed. If hooks fail, fix the issue.
- Before running E2E tests locally, kill any stale Vite process on port 5174 (`lsof -i :5174 -P -n -t | xargs kill`). Playwright reuses existing servers locally and a stale server without `VITE_AUTH_MOCK=true` causes mass auth failures.
- Run:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test:unit`
- If API contract changed on backend, run `npm run api:sync`.
- Update `src/data/changelog.ts` for user-visible changes.
- Ensure changed behavior is reflected in tests.
- If you change **i18n** or user-visible labels: grep the test tree for `getByText` / `getByRole` matchers that might target that copy — switch to `data-testid` + `getByTestId` instead of updating English strings in assertions.
- If a new endpoint or response variant was added: confirm **both** `api/server.ts` AND `tests/e2e/fixtures.ts` were updated, and a unit test covers the new variant in `tests/unit/core/api.test.ts`.
- If any E2E tests failed during this push cycle: add a dev-lesson entry in `dev-lessons/frontend.md` before considering the task done.

## 11) Docs Updates

- Only update existing files. Do not create new docs files.

## 12) Escalate Instead of Guessing

Stop and raise to user when:

- Feature needs backend fields/endpoints not in current OpenAPI.
- Requirement conflicts with existing security or contract rules.
- Expected behavior is ambiguous (ownership/auth/invite edge cases).
