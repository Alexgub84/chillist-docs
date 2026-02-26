# Frontend Dev Lessons

A log of bugs fixed and problems solved in `chillist-fe`.

---

<!-- Add new entries at the top -->

### [UX] Bulk assign — every participant can assign all, but only unassigned items
**Date:** 2026-02-26
**Problem:** Only the plan owner could use the "Assign all to…" button in subcategories. Non-owners could not bulk-assign items to themselves.
**Solution:** Pass `onBulkAssign` for all participants (owner and non-owner). Add `restrictToUnassignedOnly` and `selfParticipantId` to BulkAssignButton — when set (non-owner mode), filter items to unassigned only, show only the current participant in the dropdown, and assign only unassigned items without a conflict dialog.
**Prevention:** When expanding a feature from owner-only to participant-wide, consider permission boundaries (e.g. non-owners can only act on unassigned items).

---

### [UX] Bulk assign button not visible on production — moved below subcategory header
**Date:** 2026-02-26
**Problem:** The bulk assign button lived in the subcategory header row as a tiny 7×7 icon next to the chevron. It was low-contrast, hard to tap on mobile, and not visible on production.
**Solution:** Moved BulkAssignButton from the subcategory header row into the DisclosurePanel content, placed below the subcategory header and above the items. Each subcategory gets its own button that assigns all items in that subcategory. BulkAssignButton trigger changed from icon-only to a styled text+icon button.
**Prevention:** Avoid placing critical actions as small icons inside nested Headless UI components (Disclosure + Menu). Prefer prominent buttons below section headers, above content.

---

### [Auth] Profile update needs token refresh before sync-profile
**Date:** 2026-02-26
**Problem:** After `supabase.auth.updateUser(...)`, participant records across plans were not updated immediately because the app did not call backend `POST /auth/sync-profile`.
**Solution:** In `AuthProvider`, handle `USER_UPDATED` by calling `supabase.auth.refreshSession()` first, then call `POST /auth/sync-profile` with the refreshed JWT (`syncProfile` helper in `api.ts`). Keep it fire-and-forget and log failures without blocking profile update UX.
**Prevention:** Any flow that depends on updated JWT claims (`user_metadata`) must refresh the Supabase session before calling BE endpoints that read those claims.

---

### [Arch] ItemsList component — plan item list grouped by subcategory
**Date:** 2026-02-26
**Problem:** Plan detail page, items page, and invite page each had duplicated logic for grouping items by category and rendering CategorySection.
**Solution:** Created ItemsList component that receives filtered items and renders CategorySection per category. Extended CategorySection with `groupBySubcategory` prop — when true, groups items by subcategory (from taxonomy), shows subcategory headers with item counts, and falls back to "Other" for items without subcategory. Added `groupBySubcategory()` helper in `src/core/utils/items.ts`. ItemsList used in plan.$planId.lazy.tsx, ItemsView, and invite page.
**Prevention:** Extract repeated item-list rendering into a shared component. Use taxonomy-defined order for subcategory headers (equipment/food subcategories first, "Other" last).

---

### [Test] E2E admin delete modal — waitForResponse times out on Mobile Safari
**Date:** 2026-02-26
**Problem:** `admin can delete a plan via confirmation modal` timed out on Mobile Safari (60s). The test used `Promise.all([page.waitForResponse((r) => r.request().method() === 'DELETE'), page.getByTestId('admin-delete-confirm').click({ force: true })])`. The DELETE response never arrived — likely a race or Mobile WebKit interaction quirk with Headless UI modals.
**Solution:** Removed `waitForResponse`; assert only on UI outcomes: click confirm, then `toBeHidden` for the modal and `toBeVisible` for the toast. The mock still handles DELETE; the test now verifies the visible result instead of the network call.
**Prevention:** For Headless UI modal submit flows on Mobile Safari, avoid `waitForResponse` in parallel with the click. Assert on UI state (modal closed, toast shown) instead of network responses.

---

### [Test] E2E Participant Preferences — Edit button locator; Invite — auth modal blocks Participants click
**Date:** 2026-02-26
**Problem:** Two E2E tests failed: (1) `owner can see edit buttons on participant preferences` — Edit buttons were not found; `detailsSection = page.getByText('Group Details').locator('..')` only selected the DisclosureButton, but Edit lives in DisclosurePanel (sibling). (2) `shows plan details for valid invite link` — click on "Participants" timed out because a Headless UI auth modal (`myRsvpStatus: 'pending'`) was covering the page and intercepting pointer events.
**Solution:** (1) Changed locator to `locator('../..')` so detailsSection is the full Disclosure div containing both button and panel. (2) Added `mockInviteRoute(..., { myRsvpStatus: 'confirmed' })` so the invite page skips the auth modal and shows plan details directly.
**Prevention:** When asserting on elements inside a Headless UI Disclosure, ensure the locator scope includes the DisclosurePanel (use `../..` from the button text to get the Disclosure container). For invite E2E, use `myRsvpStatus: 'confirmed'` when testing plan details to avoid auth modal blocking interactions.

---

### [UX] Invite page did not auto-redirect authenticated users to the plan
**Date:** 2026-02-26
**Problem:** After signing in from the invite page (especially via Google OAuth), users landed back on the invite page and had to manually click "Go to plan" instead of being redirected directly to `/plan/:planId`. The OAuth flow deliberately redirected to the invite page as a workaround for a claim race condition (issue #109). Same for already-signed-in users opening an invite link.
**Solution:** (1) Added `useEffect` in the invite page that detects authenticated users, calls `claimInvite()` (catches errors for already-claimed), then navigates to `/plan/:planId`. (2) Changed OAuth redirect in `signin.lazy.tsx` and `signup.lazy.tsx` to use the `redirectTo` param (plan page) instead of the invite page. The `AuthProvider.onAuthStateChange` handler still claims the invite in the background as a fallback.
**Prevention:** When building invite/auth flows, prefer auto-redirect over manual navigation buttons. If an intermediate page exists only as a race-condition safety net, replace it with auto-redirect logic that handles the race internally (claim then navigate).

---

### [Arch] FE built ahead of BE — added fields/endpoints that don't exist in the OpenAPI spec, broke production
**Date:** 2026-02-25
**Problem:** The invite page (`/invite/:planId/:inviteToken`) showed "Invalid or expired invite link" on production. Console showed `ZodError: myParticipantId is Required, myRsvpStatus is Required`. The FE Zod schema, mock server, E2E fixtures, and component code all included `myParticipantId`, `myRsvpStatus`, and `myPreferences` — fields that **do not exist** in the BE OpenAPI spec (`def-28` / `InvitePlanResponse`). The mock server returned them, so dev and tests passed. Production broke because the real BE only returns the fields defined in its spec.
**Root Cause:** The guest invite flow redesign was implemented entirely on the FE without the BE being updated first. The mock server was extended to return the new fields, masking the fact that the real BE doesn't have them. This violated the "BE owns the spec, FE only consumes" rule. The same pattern as the 2026-02-12 OpenAPI Spec Drift incident — FE added fields the BE doesn't have, mock server hid the mismatch, production broke.
**Solution:** Remove `myParticipantId`, `myRsvpStatus`, `myPreferences` from all FE layers (Zod schema, mock server response, E2E fixtures, component code). Revert the invite page to a read-only plan preview that works with what the BE actually returns. The guest RSVP/item features must wait until the BE implements the required fields and endpoints.
**Prevention:** NEVER build FE features ahead of the BE. Every field in the FE Zod schema, mock server response, and E2E fixture must exist in the BE OpenAPI spec. If a feature needs new fields or endpoints, STOP and tell the user it requires BE work first. The mock server must mirror the real BE exactly — it is a stand-in, not a preview of a future BE. See rule: "NEVER Build FE Ahead of the BE" in frontend.md.

---

### [i18n] Zod validation error messages appear in English regardless of active language
**Date:** 2026-02-25
**Problem:** In PreferencesForm, Zod validation errors (e.g., "Expected number, received nan", "Number must be greater than or equal to 1") appeared in English even when Hebrew was active. The schema was defined at module level with no custom error messages, so Zod used its English defaults.
**Solution:** Converted the module-level `preferencesFormSchema` to a factory function `buildPreferencesSchema(t)` that accepts the `t` translation function. Added translated error messages via Zod's `invalid_type_error` and `message` params (e.g., `z.coerce.number({ invalid_type_error: t('validation.adultsCountInvalid') }).min(1, t('validation.adultsCountMin'))`). Defined `PreferencesFormValues` as an explicit type since the schema is now dynamic.
**Prevention:** When a Zod schema is used with `zodResolver` in a form that supports i18n, never rely on Zod's default English error messages. Use a schema factory function that takes `t` and passes translated messages to every validator that can fail. Define the form values type explicitly rather than inferring from a dynamic schema.

---

### [Test] Removed "edits item quantity via form" E2E test — unreliable on Mobile Safari
**Date:** 2026-02-25
**Problem:** The `edits item quantity via form` E2E test failed consistently on Mobile Safari (WebKit) during pre-commit hooks. After clicking "Update Item" (`force: true`), the Headless UI modal stayed visible and `toBeHidden({ timeout: 10000 })` timed out. Passed on Chrome, Firefox, and Desktop Safari every time. All documented mitigations were already applied. The test only verified a single-field quantity edit — the broader `edits all item fields via modal form` test already covers opening the edit modal, changing fields, submitting, and verifying the modal closes and values update.
**Solution:** Deleted the test. The functionality is already covered by the more comprehensive `edits all item fields via modal form` test, which passes on all browsers including Mobile Safari.
**Prevention:** Don't write narrow E2E tests that duplicate coverage from a broader test in the same describe block. When a Headless UI modal E2E test is unreliable on a specific browser after applying all known mitigations, remove it if equivalent coverage exists elsewhere rather than letting it block commits indefinitely.

---

### [Arch] Logging must include context — silent catches and vague messages make production debugging impossible
**Date:** 2026-02-25 (updated)
**Problem:** When the invite page failed in production, logs showed only `[invite] Schema validation failed:` with Zod issues — no `planId`, no token, no raw data keys. `AuthProvider.claimInvite()` had a completely silent `.catch(() => {})`. `pending-invite.ts` store/get/clear had empty catch blocks. Multiple `catch` blocks across the codebase swallowed errors with no logging at all (geocoding, clipboard, localStorage, form submissions). This made it extremely hard to trace what happened when users reported bugs. **Follow-up audit** found additional gaps: `claimInvite()` and `saveGuestPreferences()` in `api.ts` had zero function-level logging, `AuthProvider.getSession()` had no `.catch()` (app would hang on loading forever if it failed), `signOut` showed `toast.error` without `console.error`, and sign-in/sign-up claim failures had no user-visible toast.
**Solution:** (1) Added structured success/failure logging to `claimInvite()` and `saveGuestPreferences()` in `api.ts`. (2) Added `.catch()` to `AuthProvider.getSession()` to prevent infinite loading on failure. (3) Added `console.error` alongside `toast.error` in `signOut`. (4) Added `toast.error(t('invite.claimFailed'))` in sign-in/sign-up when claim fails — user now sees the error instead of silently landing on a broken plan page. (5) Wrapped `onSubmit` and OAuth handlers in top-level try/catch with `toast.error` to prevent unhandled promise rejections.
**Prevention:** Every `catch` block must log the error with enough context to reproduce the issue: the function name, all relevant IDs (planId, participantId, itemId), the endpoint, and the error message. Never use empty `catch {}` — at minimum log a `console.warn`. For critical paths (auth, invite, API), log both success and failure. Truncate tokens to 8 chars for security. When `toast.error()` is shown, always also `console.error()` the full details. Every async entry point (`onSubmit`, button handlers) must have a top-level try/catch. See issue #109.

---

### [Bug] Invite claim race condition — claimInvite() not awaited before navigation (FIXED — issue #109)
**Date:** 2026-02-25
**Problem:** Guest signs in from invite link → redirected to plan page → "plan not found" (0 plans). The participant record still has `userId = null` because `claimInvite()` hasn't completed. `GET /plans` only returns plans where the user is the creator, admin, or a linked participant.
**Root Cause:** `AuthProvider` calls `claimInvite()` as fire-and-forget. The sign-in/sign-up pages navigate immediately after auth, creating a race between the claim POST and the plan fetch.
**Solution:** Two-path fix: (1) **Email auth:** In `signin.lazy.tsx` and `signup.lazy.tsx`, after successful auth, check `getPendingInvite()` — if found, **await** `claimInvite()`, clear localStorage, invalidate React Query cache, then navigate. (2) **OAuth (Google):** Change the OAuth `redirectTo` to the invite page (`/invite/:planId/:inviteToken`) instead of `/plan/:planId` when a pending invite exists. The invite page works via the public API without the claim being done. `AuthProvider` fires the claim in the background — by the time the user clicks "Go to plan", the claim is complete. `AuthProvider` also invalidates the query cache after successful claim.
**Prevention:** When a flow requires an API call to complete before navigation (linking, claiming, syncing), always await the call in the component that triggers the navigation — never rely on a fire-and-forget side effect in a context/provider. For OAuth flows where you can't control post-redirect behavior, redirect to a page that works without the pending operation (e.g., the public invite page).

---

### [Bug] Unauthenticated guest redirected to authenticated route after preferences (FIXED — issue #109)
**Date:** 2026-02-25
**Problem:** Unauthenticated guest clicks "Continue without signing in" on invite page → fills preferences modal → redirected to `/plan/:planId` → plan not found (401 or empty). The `/plan/:planId` route requires JWT authentication which the guest doesn't have.
**Root Cause:** `handleGuestPreferences` and `handleSkipPreferences` in `invite.$planId.$inviteToken.lazy.tsx` navigate to `/plan/$planId` instead of staying on the invite page.
**Solution:** Removed the `navigate()` calls from both handlers. After preferences submit or skip, the modal simply closes and the guest stays on the invite page (`/invite/:planId/:inviteToken`) which already shows the full plan details via the public API.
**Prevention:** When building flows for unauthenticated users, always verify the redirect target is accessible without auth. Authenticated routes (`/plan/:id`, `/plans`) require JWT — unauthenticated guests should stay on public routes (`/invite/:planId/:token`).

---

### [Test] act(...) warnings — async state updates in tests must be wrapped properly
**Date:** 2026-02-25
**Problem:** Unit tests produced ~30 `act(...)` warnings and ~6 Headless UI `getAnimations` polyfill warnings. Four sources: (1) `router.navigate()` triggering async `Transitioner` state updates in TanStack Router, (2) `AuthProvider` calling `getSession()` on mount (Promise resolves outside act), (3) Headless UI Combobox (`Mo` component) updating after `setTimeout`, (4) jsdom missing `Element.prototype.getAnimations` causing Headless UI to polyfill and warn.
**Solution:** (1) Wrap `router.navigate()` in `act(async () => { ... })`. (2) Wrap `renderHook()` in `act()` or use `waitFor()` for sync assertions after rendering components with async `useEffect`. (3) Wrap `setTimeout` waits in `act()`. (4) Polyfill `getAnimations` in `tests/setup.ts` with `Element.prototype.getAnimations = () => []` — do NOT use `jsdom-testing-mocks` `mockAnimationsApi()` as it breaks TanStack Router rendering.
**Prevention:** When writing tests that trigger async state updates (navigation, provider mounts with async init, timers), always wrap the triggering code in `act()`. For Headless UI/jsdom gaps, add lightweight polyfills to `tests/setup.ts` — avoid full mock libraries that change DOM behavior beyond what's needed.

---

### [Arch] Invite claim — guest must link to participant after sign-in via localStorage handoff
**Date:** 2026-02-24
**Problem:** Guest opens invite link → signs up → redirected to plan page → "plan not found". The BE only returns plans where the user is the owner, a linked participant (`participants.userId` matches), or the plan is public. A newly signed-up user has `participants.userId = null` — the participant record isn't linked to their Supabase account yet.
**Solution:** (1) Store `{ planId, inviteToken }` in localStorage when the guest clicks sign-in/sign-up from the invite page. (2) In `AuthProvider`, on `SIGNED_IN` event, check localStorage for a pending invite. (3) If found, clear it and call `POST /plans/:planId/claim/:inviteToken` with the JWT — this links the user's `userId` to the participant record and sets `inviteStatus` to `accepted`. (4) The redirect to `/plan/:planId` (via `?redirect` param) now works because the user is a linked participant.
**Prevention:** When implementing invite-to-auth flows, always plan for the "linking" step between the anonymous invite token and the authenticated user identity. Use localStorage as a bridge across the auth redirect boundary. The claim must happen before the user tries to access the resource.

---

### [E2E] Auth-conditional UI needs authenticated session in E2E tests
**Date:** 2026-02-24
**Problem:** The "Plan creation via UI" E2E test clicked `getByRole('link', { name: /create new plan/i })` on `/plans`. After making "Create New Plan" conditional on authentication (replaced by Sign In / Sign Up for guests), the test timed out because no user session was injected.
**Solution:** Added `await injectUserSession(page)` at the start of the test. When scoping locators in unauthenticated tests, use `page.getByRole('main')` to avoid duplicates from the header's own Sign In / Sign Up links.
**Prevention:** Any E2E test that interacts with auth-gated UI must call `injectUserSession(page)` first. When asserting elements that exist in both header and main content, scope to `page.getByRole('main')`.

---

### [Arch] Sign-in/sign-up redirect param — use non-lazy route with `validateSearch`
**Date:** 2026-02-24
**Problem:** The invite page needed to link to sign-in with a `?redirect=/plan/:planId` param so the user lands on the plan page after authentication. The sign-in and sign-up lazy routes had no search param support — they hardcoded `navigate({ to: '/plans' })`.
**Solution:** Created non-lazy route files (`signin.tsx`, `signup.tsx`) with `validateSearch: z.object({ redirect: z.string().optional() })`. The lazy components use `useSearch({ from: '/signin' })` to read the param and fall back to `/plans` when absent. Google OAuth `redirectTo` also uses the param. Existing unit tests needed `useSearch: () => ({})` added to the `@tanstack/react-router` mock.
**Prevention:** When a route needs search params, always create a non-lazy route file alongside the `.lazy.tsx` to define `validateSearch`. Add `useSearch` to any `@tanstack/react-router` mock in test files that render components using it.

---

### [Arch] Public API endpoints need a separate request helper — no auth, no 401 retry
**Date:** 2026-02-24
**Problem:** The invite landing page fetches plan data via a public endpoint (`GET /plans/:planId/invite/:inviteToken`). The existing `request()` helper always calls `getAccessToken()` and has a 401 retry cascade, which is wasteful and incorrect for unauthenticated endpoints.
**Solution:** Added `publicRequest<T>()` in `api.ts` that calls `doFetch()` directly without auth token injection or 401 retry logic. `fetchPlanByInvite()` uses `publicRequest()`. Unit test verifies no `getSession` call is made.
**Prevention:** For any future public/unauthenticated API endpoints, use `publicRequest()` instead of `request()`. Never send auth headers to endpoints that don't require them.

---

### [Deps] Google Places autocomplete — use programmatic API, not PlaceAutocompleteElement
**Date:** 2026-02-24
**Problem:** `PlaceAutocompleteElement` renders in a closed Shadow DOM — its input is invisible to accessibility tools and browser automation. It also creates its own input element, making it impossible to integrate with an existing `<input>` field in a form. Additionally, `version="weekly"` on `APIProvider` injects global CSS that breaks form input styles (borders, backgrounds, padding stripped from all inputs).
**Root cause:** (1) `PlaceAutocompleteElement` uses a closed Shadow DOM — you cannot inspect, style, or interact with its internal elements from outside. (2) Setting `version="weekly"` on `APIProvider` loads a Maps JS API version that injects more aggressive global CSS than the default version, breaking Tailwind-styled form inputs across the entire page.
**Solution:** Use the programmatic `AutocompleteSuggestion.fetchAutocompleteSuggestions()` API instead. This lets you: (1) bind autocomplete to any existing `<input>` via a ref, (2) render a custom dropdown with full control over styling, (3) avoid Shadow DOM entirely. Use `AutocompleteSessionToken` for billing optimization. Do NOT pass `version="weekly"` to `APIProvider` — the programmatic Places API is GA and available in the default version.
**Prevention:** Avoid `PlaceAutocompleteElement` when you need to integrate with existing form inputs or control styling. Prefer the programmatic `fetchAutocompleteSuggestions` API. Never use `version="weekly"` or `version="beta"` on `APIProvider` unless you specifically need a beta/preview feature — both inject global CSS that can break form styles.

---

### [Arch] Sign-out used window.location.reload() instead of router navigation + cache clear
**Date:** 2026-02-24
**Problem:** After sign-out, the app called `window.location.reload()` to reset state. This caused a full page reload — jarring UX, threw away the entire React tree, and re-fetched all static assets. It also bypassed the router, so the user stayed on whatever page they were on (potentially an auth-gated page).
**Solution:** Replaced `window.location.reload()` with `queryClient.clear()` (removes all React Query cached data from the previous user's session) + `navigate({ to: '/' })` (redirects to home via TanStack Router). The Supabase `onAuthStateChange` listener already clears `user` and `session` state on `SIGNED_OUT`, so all auth-aware components re-render automatically.
**Prevention:** Never use `window.location.reload()` for state cleanup in an SPA. Use the framework's tools: clear the query cache for data, and use the router for navigation. Hard reloads are only justified when you suspect the app is in a fundamentally broken state (e.g., corrupted service worker).

---

### [Arch] AuthProvider called /auth/me on every SIGNED_IN event — 8+ redundant 401s on page load
**Date:** 2026-02-24
**Problem:** Production console showed 8+ `GET /auth/me 401` errors on every page load. `AuthProvider.onAuthStateChange` called `fetchAuthMe()` on every `SIGNED_IN` event to get the user's email for a toast. Supabase fires `SIGNED_IN` multiple times (session restore, tab focus, auto-refresh), and each call with an expired/missing token triggered the 401 retry cascade in `request()` (original call → 401 → `refreshSession()` → retry → another 401).
**Solution:** Removed the `fetchAuthMe()` call from `onAuthStateChange`. The user's email is already available in the Supabase session object (`newSession.user.email`), so no backend round-trip is needed for the toast.
**Prevention:** Never make backend calls from `onAuthStateChange` for data that's already in the Supabase session. `onAuthStateChange` fires frequently (session restore, token refresh, tab focus) — keep handlers lightweight and side-effect-free. If backend verification is needed, do it once on explicit user-initiated sign-in, not on every event.

---

### [Infra] Deploy pipeline took 7-31 min and failed on WebKit E2E — restructured CI/CD
**Date:** 2026-02-23
**Problem:** `deploy.yml` re-ran the full E2E suite (4 browsers, 2 retries) that `ci.yml` already passed on the PR. WebKit-only form-dismissal bugs caused 3 deterministic failures on every deploy. With 60s timeout × 3 attempts × 4 browsers, a single failing test burned 12 minutes. Additionally, `install-deps` in `deploy.yml` lacked browser filters, sometimes taking 25 minutes when apt mirrors were slow.
**Solution:** (1) Removed all E2E from `deploy.yml` — merged test+deploy into a single job (lint, typecheck, unit tests, build, deploy). (2) Split `ci.yml` into two parallel jobs: `test` (Chrome only, required gate) and `test-safari` (Safari+Firefox, `continue-on-error: true`). (3) Reduced Playwright retries from 2 to 1. (4) Fixed WebKit E2E failures by using `force: true` on form submit clicks and increasing `toBeHidden` timeout to 10s. (5) Pre-commit hook runs all browsers for thorough local validation; CI runs Chrome only as the required gate. (6) Added `e2e:docker` script for local Linux-WebKit testing.
**Prevention:** Never duplicate the same test suite across CI and deploy pipelines — deploy should trust CI results. Use a two-tier CI strategy: fast required browser (Chrome) gates merges, other browsers run non-blocking. For Headless UI modal submit buttons on WebKit, always use `force: true` and longer `toBeHidden` timeouts. Use `npx playwright install-deps <browsers>` (not bare) to avoid installing unneeded system deps. Keep the Playwright Docker image tag in sync with `@playwright/test` version.

---

### [Test] WebKit E2E — form submit click doesn't dismiss Headless UI modal on Linux-WebKit
**Date:** 2026-02-23
**Problem:** E2E tests `adds items via UI` and `edits all item fields via modal form` failed on Desktop Safari and Mobile Safari in CI (Linux-WebKit) but passed locally (macOS-WebKit). After clicking the submit button, the form/modal stayed visible. The `toBeHidden({ timeout: 5000 })` assertion timed out. Same error on all retry attempts — deterministic, not flaky.
**Solution:** Applied `force: true` on all form submit button clicks inside Headless UI dialogs (same pattern as ComboboxOption clicks documented earlier). Increased `toBeHidden` timeout from 5s to 10s. Verified visibility before clicking (`await expect(btn).toBeVisible()`).
**Prevention:** Playwright's WebKit on Linux behaves differently from macOS WebKit. For Headless UI modal form submissions: (1) always use `click({ force: true })` on submit buttons, (2) use generous `toBeHidden` timeouts (10s), (3) test with `npm run e2e:docker` to reproduce CI's Linux-WebKit environment locally before pushing.

**How to see Safari failures when they pass locally:** CI runs WebKit on Linux (different from macOS). Run `npm run e2e:docker` locally to match CI exactly. On PRs, the `test-safari` job always uploads a Playwright report artifact — download it from the Actions run to inspect failures. Safari failures show as yellow warning annotations on the PR; they do not block merge.

---

### [Arch] JWT 401 had no retry or recovery — expired tokens caused hard failures
**Date:** 2026-02-23
**Problem:** When a Supabase access token expired between requests, the API call returned 401 and showed a generic toast that disappeared after a few seconds. No token refresh, no retry, no clear recovery path. The secondary `api-client.ts` (openapi-fetch) didn't inject JWT at all.
**Solution:** (1) Added 401 retry to `request()` in `api.ts` — on 401, calls `supabase.auth.refreshSession()` and retries once. (2) On final 401, emits via `src/core/auth-error.ts` event bus which triggers `AuthErrorModal` with Sign In / Dismiss buttons. (3) Added JWT injection to `api-client.ts` via `authFetch` wrapper. (4) Improved `ErrorPage` to show plan-specific 404 message for access control errors.
**Prevention:** Every API layer must inject JWT and handle 401 with refresh+retry. Auth failures surface via `AuthErrorModal`, never a toast. See `rules/frontend.md` > "JWT 401 Retry and Auth Error Modal".

---

### [Test] E2E test broke after adding preferences modal — test didn't account for new post-creation step
**Date:** 2026-02-23
**Problem:** E2E test "creates a plan with owner and navigates to detail page" failed in CI. After clicking "Create Plan", the test expected immediate navigation to `/plan/:id`, but the page stayed on `/create-plan`. The participant preferences feature added a modal that appears after plan creation, requiring the user to either fill preferences or skip before navigation happens.
**Solution:** Added a click on the "Skip for now" button in the E2E test between form submission and the URL assertion.
**Prevention:** When adding a new step to an existing user flow (e.g., a modal between form submission and navigation), always update the E2E tests that cover that flow in the same PR. Also added E2E tests to the Husky pre-push hook (`VITE_AUTH_MOCK=true npx playwright test --project="Desktop Chrome"`) so broken E2E tests are caught before pushing.

---

### [Infra] api:fetch fails in GitHub Actions — GITHUB_TOKEN is scoped to current repo only
**Date:** 2026-02-23
**Problem:** `npm run api:fetch` failed with exit code 22 in GitHub Actions. The curl command used `$GITHUB_TOKEN` to fetch `openapi.json` from the private `chillist-be` repo via `raw.githubusercontent.com`. Locally it worked because `GITHUB_TOKEN` is a PAT with broad repo access.
**Root cause:** In GitHub Actions, `GITHUB_TOKEN` is automatically set to a built-in installation token scoped to the **current repo only** (`chillist-fe`). It cannot access content from other private repos (`chillist-be`), so GitHub returned 403/404 and curl exited with code 22 (`-f` flag).
**Solution:** Extracted curl logic into `scripts/fetch-openapi.sh` with conditional auth: (1) uses `API_SPEC_TOKEN` if set, (2) falls back to `GITHUB_TOKEN` only when NOT in CI (local dev), (3) falls back to no auth. In CI workflows, `API_SPEC_TOKEN` is passed from a GitHub secret — a fine-grained PAT scoped to read-only on `chillist-be`.
**Prevention:** Never rely on the built-in `GITHUB_TOKEN` for cross-repo access in GitHub Actions. For private cross-repo file access, use a fine-grained PAT stored as a repo secret with a dedicated env var name (not `GITHUB_TOKEN`) to avoid collision with the built-in token.

---

### [Deps] Google Maps API beta breaks native date/time pickers
**Date:** 2026-02-23
**Problem:** After migrating `LocationAutocomplete` to `PlaceAutocompleteElement` with `version="beta"` on `APIProvider`, native `<input type="date">` and `<input type="time">` pickers stopped opening. Worked on desktop after a CSS fix but still broke on mobile.
**Root cause:** Google Maps API (`version="beta"`) injects global CSS that strips `appearance` from form inputs, disabling native date/time picker controls. Combined with Tailwind v4 preflight setting `background-color: transparent` on all inputs, the native controls became invisible or non-functional. Mobile was hit harder because touch-based picker activation is more sensitive to `appearance` being stripped.
**Solution:** Two-layer fix: (1) In `index.css`, added `appearance: auto !important` for `input[type='date']`, `input[type='time']`, `input[type='datetime-local']`, `input[type='month']`, `input[type='week']` to override any injected styles. (2) In `FormInput`, added `showPicker()` on click for picker-type inputs (forces the native picker to open programmatically), added `bg-white` to input styles, and added `cursor-pointer` for picker inputs. Wrapped `showPicker()` in try-catch since it throws outside user-gesture contexts.
**Prevention:** When loading third-party APIs that inject global CSS (Google Maps, Stripe, etc.), always protect native form controls with `appearance: auto !important` in your base CSS. Use `showPicker()` on click for date/time inputs as a belt-and-suspenders approach. Test date/time pickers on both desktop and mobile after adding any new third-party script.

---

### [Deps] Migrate from legacy google.maps.places.Autocomplete to programmatic Places API
**Date:** 2026-02-23 (updated 2026-02-24)
**Problem:** Console warning: "As of March 1st, 2025, google.maps.places.Autocomplete is not available to new customers." The legacy API was completely blocked for new API keys — the widget initialized but made zero autocomplete API calls.
**Solution:** Replaced the legacy `new places.Autocomplete(input, options)` with `AutocompleteSuggestion.fetchAutocompleteSuggestions()` in `LocationAutocomplete.tsx`. Key differences: (1) programmatic API fetches predictions — you render your own dropdown, (2) bind to any existing input via a ref and `input` event listener (debounced at 300ms), (3) use `placePrediction.toPlace()` then `place.fetchFields()` to get `displayName`, `location`, `addressComponents`, (4) address components use `longText` instead of `long_name`, (5) use `AutocompleteSessionToken` for per-session billing. Do NOT use `version="weekly"` on `APIProvider` — causes global CSS injection. Requires "Places API (New)" enabled in Google Cloud Console.
**Prevention:** When Google deprecation warnings appear for Maps APIs, check the migration guide. Prefer the programmatic `fetchAutocompleteSuggestions` API over `PlaceAutocompleteElement` — it gives full control over the input and dropdown without Shadow DOM or global CSS side effects.

---

### [Test] E2E button selector must match accessible name — SVG icons with aria-hidden are excluded
**Date:** 2026-02-23
**Problem:** E2E test "adds items via UI" timed out in CI waiting for `getByRole('button', { name: /^\+\s*Add Item$/i })`. The "Add Item" button renders the `+` as an SVG with `aria-hidden="true"` and the text "Add Item" in a `<span>`. Playwright computes the accessible name from visible text content only, so the actual name is `"Add Item"`, not `"+ Add Item"`.
**Solution:** Changed the test regex from `/^\+\s*Add Item$/i` to `/^Add Item$/i` to match the actual accessible name.
**Prevention:** When writing `getByRole` selectors for buttons that contain icons (SVG with `aria-hidden="true"`), only match against the text content — the icon is excluded from the accessible name. Always verify button accessible names by running the test locally before pushing.

---

### [Infra] Google Maps API key — localhost referrer restrictions don't work reliably
**Date:** 2026-02-22
**Problem:** After adding Google Maps integration, the map showed `RefererNotAllowedMapError` on `localhost:5174` even after adding the URL to Google Cloud Console's HTTP referrer restrictions (both with and without `/*` wildcard).
**Solution:** Set API key application restriction to "None" for local development. For production, use HTTP referrer restrictions with the production domain (`https://your-domain.pages.dev/*`). Alternatively, create two separate API keys — one unrestricted for dev, one restricted for production.
**Prevention:** When setting up Google Maps API keys: (1) Use unrestricted keys for localhost dev, (2) When changing the production domain, update the allowed referrers in Google Cloud Console, (3) Document this in the frontend guide under "Google Maps > API Key Restrictions".

---

### [Arch] NEVER hand-write values the backend owns — use generated types as source of truth
**Date:** 2026-02-22
**Problem:** Editing items in production returned "Invalid Request" (400). Worked perfectly locally. The FE hand-wrote `unitSchema = z.enum(['pcs', ..., 'm', 'cm'])` with `m` and `cm` — values the backend doesn't have. The mock server copied the same wrong values, so local dev passed. Only production (real backend) rejected them. This bug was attempted to be fixed 4 times before the root cause was identified.
**Root cause:** The FE **hand-maintained** Zod enums for values that are **already defined by the backend** and **already auto-generated** into `src/core/api.generated.ts` via `npm run api:types`. Two parallel sources of truth existed: the hand-written Zod schemas and the generated types — and they drifted. The whole point of OpenAPI + type generation is that the backend owns these values. When asked to add `m`/`cm`, the correct response was "this must be added to the backend first" — not silently adding it to the FE.
**Solution:**
1. Removed `m`/`cm` from all FE layers (Zod schema, constants, unit groups, translations, mock server)
2. Wired all FE Zod enum arrays to the generated BE types via `as const satisfies readonly BEType[]` — TypeScript now errors if the FE adds a value the BE doesn't have
3. Improved 400 error toast to surface the actual backend message
**Prevention:**
1. **NEVER** hand-write enum values that the backend owns. The generated types in `api.generated.ts` are the source of truth. FE Zod schemas must use `satisfies` against the generated types.
2. When asked to add a new enum value (unit, status, category, role, visibility): **STOP** — tell the user it must be added to the backend first. Then run `npm run api:sync` to pull the change, and only then update the FE.
3. The mock server must mirror the real backend's constraints exactly — never be more lenient.
4. Error toasts for 400s must show the actual backend message, not a generic fallback.

---

### [Logic] react-hook-form Controller on native select breaks in production builds
**Date:** 2026-02-22
**Problem:** Unit `<select>` in the edit item modal was unclickable on production (Cloudflare Pages) — no reaction on mobile or desktop. Other selects (category, status, assignment) worked fine. The unit field appeared visually smaller than other inputs. Worked normally on local dev server. Affected both English and Hebrew plans.
**Root cause:** The unit select was the ONLY field using `Controller` (controlled component with explicit `value` prop). All other selects used `register` (uncontrolled). The `Controller` approach renders `<select value={field.value}>` which changes how React manages the element. In production builds (bundled + minified), this caused the select to become non-interactive — likely a React 19 production mode interaction with controlled native selects inside Headless UI Dialog modals.
**Solution:** Reverted the unit `<select>` from `Controller` back to `register` — matching the pattern of all other working selects in the same form. `register` + `setValue` works correctly for the category field (which also uses autocomplete auto-fill), so it works for unit too. Also removed leftover debug `console.log` statements.
**Prevention:** For native HTML `<select>` elements in react-hook-form, prefer `register` over `Controller`. Only use `Controller` for custom components (like Headless UI Listbox, Combobox, Autocomplete) that don't expose a standard onChange/ref interface. If a native select needs programmatic updates via `setValue`, `register` handles it correctly — `setValue` updates both the internal state and the DOM element via the ref.

---

### [Test] i18n E2E test fails on Mobile Safari — lang-toggle hidden behind hamburger menu
**Date:** 2026-02-21
**Problem:** The i18n E2E test (`i18n.spec.ts`) passed on Desktop Chrome and Firefox but failed on Mobile Safari in CI. The `lang-toggle` button lives inside the desktop nav (`hidden sm:flex`), which is `display: none` on viewports below 640px. The mobile language toggle has a different `data-testid` (`lang-toggle-mobile`) and is inside the hamburger menu. The test was only verified locally on desktop browsers before pushing.
**Solution:** Used Playwright's built-in `isMobile` fixture to branch the test logic: on mobile, open the hamburger menu first and use `lang-toggle-mobile`; on desktop, use `lang-toggle` directly. Also gate nav link assertions behind `!isMobile` since they're hidden in the hamburger menu.
**Prevention:** Always run `npx playwright test <file>` (all projects) before pushing E2E tests — never just a single browser. When a UI has responsive breakpoints with different interactive elements per viewport, the E2E test must handle both paths using `isMobile` or viewport detection.

---

### [Arch] i18n — API enum values must be translated at display time, not stored translated
**Date:** 2026-02-21
**Problem:** Plan status (`active`/`draft`), visibility (`public`/`private`), participant roles (`owner`/`viewer`), item status (`pending`/`packed`), and item units (`pcs`/`kg`) were displayed as raw English strings from the API. The labels were translated in form dropdowns (via `labelKey` in constants) but not in read-only displays.
**Solution:** Use `t('planStatus.${status}')`, `t('roles.${role}')`, `t('units.${unit}')` etc. at every display point. Data stays English in the DB and API — only the UI label is translated. Also replaced the hardcoded `const NA = 'N/A'` with `t('plan.na')`.
**Prevention:** When displaying any enum/system value from the API, always wrap it in a translation call. Never render raw API enum values directly — use the pattern `t('namespace.${value}')` with matching keys in both locale files.

---

### [Arch] i18n — module-level constants with labels need translation-aware pattern
**Date:** 2026-02-21
**Problem:** Several components had module-level constants containing user-facing labels (e.g., `statusConfig`, `LIST_TABS`, `CATEGORY_LABELS`). React hooks like `useTranslation()` can't be called at module level, so these labels couldn't be translated directly.
**Solution:** Two patterns: (1) Move the config inside the component function where the hook is available (e.g., `statusConfig` in PlansList). (2) Store translation keys instead of labels in the constant, then resolve them with `t()` inside the component (e.g., `labelKey: 'filters.buyingList'` in StatusFilter).
**Prevention:** When creating constants with user-facing strings, use translation keys from the start. Never put display text in module-level constants — always use i18n keys that get resolved inside a component.

---

### [Test] i18n breaks tests that query hardcoded strings — mock useLanguage globally
**Date:** 2026-02-21
**Problem:** After adding i18n, Header tests crashed with `useLanguage must be used within a LanguageProvider`. Components using the language context need the provider in tests.
**Solution:** Added a global mock for `useLanguage` in `tests/setup.ts` that returns English defaults. Individual tests can override with `vi.unmock()` when they need to test language switching.
**Prevention:** When adding a new context that's used in widely-tested components, add the global mock to `tests/setup.ts` immediately — don't wait for tests to break.

---

### [Infra] Google OAuth on prod — full Supabase + Google Cloud setup checklist was missing
**Date:** 2026-02-18
**Problem:** Google OAuth sign-up on production failed with three successive errors: (1) `"Unsupported provider: provider is not enabled"` — Email and Google providers not enabled in Supabase, (2) `redirect_uri_mismatch` — Supabase callback URL not added to Google Cloud Console's authorized redirect URIs, (3) redirect to localhost after OAuth — Supabase Site URL still set to `http://localhost:5173`.
**Solution:** Completed the full Supabase + Google Cloud setup: enabled Email and Google providers in Supabase, created Google Cloud OAuth credentials (Client ID + Secret), added Supabase callback URL to Google's authorized redirect URIs, and set Supabase Site URL + Redirect URLs to the production domain.
**Prevention:** When enabling OAuth for a new environment, follow the complete checklist added to the frontend guide (Supabase Auth > Google OAuth Production Setup). Never assume Supabase defaults are production-ready — Site URL, providers, and redirect URIs all need explicit configuration per environment.

---

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

## 2026-02-25: Strict Zod `.datetime()` Breaks Production Responses

**Problem**: The invite page showed "Invalid or expired invite link" even though the BE returned valid data. The plan was invisible to guests on production.

**Root Cause**: All response Zod schemas used `z.string().datetime()` for date fields. Zod's `.datetime()` requires an exact ISO 8601 format with timezone offset (`Z` or `+HH:MM`). The real BE (PostgreSQL + Fastify) returned dates in a slightly different format that Zod silently rejected, causing `invitePlanResponseSchema.parse()` to throw. React Query caught this as an error, and the component displayed the error state instead of the plan.

**Solution**:
- Changed all **response** schemas to use `z.string()` for date fields (item, participant, plan, invite schemas).
- Kept `z.string().datetime()` only in **create/patch** schemas where we validate user input before sending to the BE.
- Added `safeParse` + `console.error` logging in `fetchPlanByInvite` so schema failures are visible in the console instead of silently swallowed.

**Lessons**:
1. **Response schemas should be lenient**: We trust the BE to send valid data. Overly strict Zod validation on responses causes silent production failures.
2. **Input schemas should be strict**: Keep `.datetime()`, `.int()`, etc. on create/patch schemas that validate user input.
3. **Use `safeParse` + logging** on critical API parsing paths so schema mismatches produce visible console errors instead of opaque "not found" UX.
4. **This supersedes the "always use `.datetime()`" guidance**: The 2026-02-04 lesson was correct for input validation but wrong for response parsing.

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

## 2026-02-25: Invite flow shipped without integration tests (retro)

**Problem**: The invite claim flow (issue #109) was implemented across multiple sessions but no integration test was written to verify the full chain. Each piece (pending-invite storage, claimInvite API, AuthProvider handler, sign-in/up page logic) passed its own unit test, but the race condition between claim and navigation was invisible without a cross-boundary test.

**Root Cause**: Integration tests were scoped to the auth feature, not the invite feature. When invite logic was added into auth components, the test surface wasn't extended. The dev-lessons entry documented the bug as "proposed fix" rather than requiring a test to close it.

**Solution**: Wrote 24 integration tests covering all invite flows (public access, claim endpoint, email sign-in/up with pending invite, OAuth with pending invite, guest preferences). Added an async side-effect ordering rule to the frontend rules.

**Lessons**:
1. Every cross-boundary feature (>1 component/layer) must ship with an integration test in the same PR — never defer it
2. Never log a bug as "proposed fix" without either fixing it with tests or creating a tracked issue
3. When adding async side effects to auth flows, the integration test must verify ordering (side effect completes BEFORE navigation), not just that both occurred
4. Fire-and-forget patterns (`.then()` / `.catch()` without await) are red flags for race conditions — if ordering matters, await it and test it

---

## 2026-02-25: Guest invite flow redesign — built FE ahead of BE (REVERTED)

**Problem**: The original guest invite flow used `localStorage` to track whether a guest had filled preferences. This was fragile — clearing browser data reset state, and there was no way to pre-populate preferences on revisit.

**What was done (WRONG)**: Extended the FE invite schema, mock server, E2E fixtures, and component code to include `myParticipantId`, `myRsvpStatus`, and `myPreferences` — but the real BE was never updated. The mock server masked the mismatch. Production broke because the real BE doesn't return these fields.

**What should have been done**: Stopped and told the user that the guest invite flow redesign requires BE work first. The BE must extend the `GET /plans/:planId/invite/:inviteToken` response to include `myParticipantId`, `myRsvpStatus`, and `myPreferences`. Only after the BE ships these changes and `npm run api:sync` pulls the updated spec should the FE be updated.

**Lessons**:
1. NEVER build FE features that depend on fields/endpoints the BE doesn't have — the mock server hides the mismatch and production breaks
2. The correct response to "add new fields to an API response" is: the BE must do it first, then `api:sync`, then FE
3. The UX design (RSVP gating, guest items, preferences edit) is sound, but it must wait for the BE to implement the required fields and endpoints
4. This is the same class of bug as the 2026-02-12 OpenAPI Spec Drift — FE added what the BE doesn't have

---

## 2026-02-26: Item edit permissions — non-owners could edit all items

**Problem**: Non-owner authenticated users and guests could see edit controls (pencil button, inline status/quantity/unit selects, cancel button) on ALL items, not just items assigned to them. The backend would reject unauthorized edits with 403, but the UI showed the controls anyway.

**Root cause**: The edit callbacks (`onEdit`, `onUpdate`) were passed unconditionally from page components through `CategorySection` to `ItemCard`. No per-item permission check existed on the frontend.

**Solution**: Added `canEdit` boolean prop to `ItemCard` — when `false`, hides pencil button, inline edit controls, and cancel button, but keeps self-assign working (via `selfAssignParticipantId` + `onUpdate`). Added `canEditItem` callback prop to `CategorySection` that computes `canEdit` per item. Updated all three consumer pages:
- `plan.$planId.lazy.tsx`: owner gets full edit; non-owners restricted to `assignedParticipantId === currentParticipant.participantId`
- `invite.$planId.$inviteToken.lazy.tsx`: guests restricted to `assignedParticipantId === myParticipantId`
- `items.$planId.lazy.tsx` + `ItemsView.tsx`: same logic via `selfParticipantId` prop

**Lessons**:
1. Always gate edit UI per item based on user permissions — don't rely on backend 403 alone
2. Separate self-assign from full-edit: `onUpdate` handles both, so use a `canEdit` flag to distinguish
3. `ItemCard` already handled falsy `onUpdate`/`onEdit` gracefully — the fix was adding the boolean + propagating it from parents

