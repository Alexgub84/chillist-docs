# Frontend Guide

Setup, development, and deployment guide for `chillist-fe`.

---

## README-first Workflow (Minimal Context Per Task)

Before opening deep docs or scanning folders, start in the frontend repo with:

1. `README.md` (route map, folder map, "how to find files")
2. `../chillist-docs/rules/frontend.md` (strict minimal execution rules)

Then open only files relevant to the task. Use this guide when you need deeper setup and operational detail.

**Subcategories + multiple languages:** see [`frontend-subcategories-i18n.md`](./frontend-subcategories-i18n.md) for refactor guidance (grouping, autocomplete, bulk-add, AI alignment).

## Tech Stack

React 19, TypeScript, Vite 7, Tailwind CSS v4, TanStack Router, TanStack React Query, React Hook Form + Zod, openapi-fetch, Headless UI, i18next, Vitest, Playwright.

## Setup & Running Locally

```bash
npm install
cp .env.example .env
```

**With mock server (no backend needed):**

```bash
npm run mock:server   # starts mock API on localhost:3333
npm run dev           # starts Vite dev server
```

**With real backend:**
Ensure `chillist-be` is running on localhost:3333, then `npm run dev`.

## Format on Save & Pre-Commit

- **Format on save:** `.vscode/settings.json` enables `source.fixAll.eslint` on save — ESLint (including Prettier) auto-fixes when you save.
- **Pre-commit:** Husky runs `lint-staged` before each commit (eslint --fix + prettier --write on staged files), so unformatted code is fixed automatically.

## Key Scripts

- `npm run dev`: Start dev server (auto-fetches OpenAPI spec first)
- `npm run build`: Production build
- `npm run typecheck` / `npm run lint`: Validation
- `npm run test`: Run all tests (unit + integration + E2E)
- `npm run mock:server`: Start Fastify mock server
- `npm run api:sync`: Fetch OpenAPI spec from backend and regenerate types
- `npm run e2e`: Run Playwright tests
- `npm run screenshots`: Legacy script — writes `step-*` and `feat-*` PNGs to `public/` (EN + `-he` Hebrew) via mock API + Vite + mock auth; the **current** marketing home page does not render those assets (bento + cards use inline UI). Still useful if you reintroduce screenshot strips or need marketing assets. Ensure ports **3333** and **5173** are free. Flags: `--verbose`, `--skip-servers`. See `scripts/take-screenshots.ts`; pitfalls in `dev-lessons/frontend.md`.
- `npm run posthog` — Query PostHog events via API (`scripts/fetch-posthog-events.ts`); requires `POSTHOG_API_KEY` and `POSTHOG_PROJECT_ID` in `.env`. Example: `npm run posthog -- --list-events --days 7`.

## Third-Party Client Pattern

Every external service (analytics, auth, payments, logging, etc.) follows the same pattern. **Check this section before integrating any new SDK.**

### Pattern

| Layer         | File                                    | Rule                                                               |
| ------------- | --------------------------------------- | ------------------------------------------------------------------ |
| Init + export | `src/lib/<service>.ts`                  | All config and init lives here. One exported instance.             |
| App code      | `src/core/<service>.ts` or `src/hooks/` | Imports from `src/lib/<service>`, never from the package directly. |
| Tests         | `vi.mock('../../../src/lib/<service>')` | Mock the lib boundary, not the third-party package.                |
| Entry point   | `src/main.tsx`                          | Imports from `src/lib/<service>`. No init logic in `main.tsx`.     |

### Existing clients

| File                  | Package                 | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/supabase.ts` | `@supabase/supabase-js` | Real vs. mock controlled by `VITE_AUTH_MOCK=true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/lib/posthog.ts`  | `posthog-js`            | Real init when token is set and not `"token"`. Token and host env vars are `.trim()`-ed to guard against trailing whitespace from GitHub Variables (see dev-lessons: PostHog token `\r\n`). `VITE_POSTHOG_MOCK=true` exports `src/lib/mock-posthog.ts` (no network). Production uses `api_host: '/ingest'` (same-origin proxy via Cloudflare Pages Function); dev uses `VITE_PUBLIC_POSTHOG_HOST`. `ui_host: 'https://us.posthog.com'` (hardcoded US). `disable_compression: true` + `__preview_disable_beacon: true` because the Pages Function proxy corrupts gzip bodies and sendBeacon ignores `disable_compression` (see dev-lessons). Session replay is **opt-in** via `VITE_PUBLIC_POSTHOG_SESSION_RECORDING=true` (default off — avoids loading `posthog-recorder.js`). |

### PostHog — local dev, staging, and toolbar

- **Production proxy:** Browser sends analytics to `https://<your-site>/ingest/*`. A Cloudflare Pages Function at `functions/ingest/[[path]].ts` proxies to PostHog US hosts (`us.i.posthog.com` / `us-assets.i.posthog.com`). The function follows the [official PostHog Cloudflare Workers guide](https://posthog.com/docs/advanced/proxy/cloudflare) exactly (copy all headers, delete cookie, set X-Forwarded-For). `src/lib/posthog.ts` sets `api_host: '/ingest'` automatically when `import.meta.env.PROD` is true.
- **Session replay vs. browser blockers:** Chrome’s `net::ERR_BLOCKED_BY_CONTENT_BLOCKER` on `/ingest/static/posthog-recorder.js` is almost always an **extension** (uBlock, Privacy Badger, Brave Shields, etc.) or strict mobile content blocking — not Cloudflare. The path is already first-party; blocklists still match the **filename** (`posthog-recorder.js`). The app defaults to **`disable_session_recording: true`** so that script is not requested unless you set **`VITE_PUBLIC_POSTHOG_SESSION_RECORDING=true`** in GitHub Variables (and accept that many users will still block replays). **Events and pageviews still work** without replay. To verify prod without blockers, use a clean profile / incognito with extensions disabled.
- **Separate project for local noise:** In PostHog, create a dedicated project (e.g. “Chillist Dev”) and put its `phc_…` API key in local `.env` as `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN`. Production keeps using the production project key in GitHub Variables / deploy env. That way Live events and funnels stay meaningful in prod.
- **Console debug:** Set `VITE_PUBLIC_POSTHOG_DEBUG=true` in `.env` to enable verbose SDK logging. Alternatively append `?__posthog_debug=true` to the app URL (PostHog built-in). Do **not** set debug to `true` in production CI or deploy env.
- **Toolbar on localhost:** In PostHog → **Project settings** → **Toolbar** (or authorized domains / toolbar access, depending on UI version), allow your dev origins, e.g. `http://localhost:5173` (default Vite) and `http://localhost:5174` (Playwright / `npm run e2e` webServer). Then use **Toolbar** → launch / heatmaps from the PostHog UI for that URL. Official reference: [PostHog toolbar](https://posthog.com/docs/toolbar).

**CLI — query events locally:** `npm run posthog -- --list-events` (and other flags; see script usage) runs `scripts/fetch-posthog-events.ts` against PostHog’s API. Requires `POSTHOG_API_KEY` (personal API key) and `POSTHOG_PROJECT_ID` in `.env` — see `.env.example`. Not used in CI or production deploy.

### Analytics — events and properties (`src/core/analytics.ts`)

Implementation lives in `src/core/analytics.ts` (calls `src/lib/posthog`). **Super properties** (attached to every event, including autocaptured pageviews, while registered): `session_id` (boot via `initAnalytics()` in `main.tsx`), `user_id` (after sign-in via `registerUserContext`), `plan_id` (while a plan route is mounted — `PlanProvider`). **Identity:** `identifyUser` on `SIGNED_IN`, `resetAnalytics` on `SIGNED_OUT`.

**PostHog autocapture** (SDK defaults): e.g. `$pageview` on navigation, `$autocapture` for clicks — exact set depends on [project settings](https://us.posthog.com/settings/project) in PostHog.

#### Custom events — currently emitted in the app

| Event name               | Properties                                                                                                      | Wired from                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `user_signed_in`         | `method`: `email` \| `google`                                                                                   | `AuthProvider` (Supabase `SIGNED_IN`)                                      |
| `user_signed_out`        | —                                                                                                               | `AuthProvider` (`SIGNED_OUT`)                                              |
| `item_updated`           | `plan_id`, `fields` (sorted keys from the `ItemPatch` the client sent, e.g. `quantity`, `assignmentStatusList`) | `useUpdateItem` (`onSuccess` after a successful `updateItem`)              |
| `profile_completed`      | —                                                                                                               | `complete-profile.lazy.tsx` (after successful `updateUserProfile`)         |
| `invite_link_copied`     | `plan_id`                                                                                                       | `copyInviteLink` / `shareInviteLink` in `src/core/invite.ts`               |
| `invite_claimed`         | `plan_id`                                                                                                       | `claimInvite` in `src/core/api.ts`                                         |
| `join_request_submitted` | `plan_id`                                                                                                       | `RequestToJoinPage.tsx` (after successful `createJoinRequest`)             |
| `participant_added`      | `plan_id`                                                                                                       | `manage-participants` route (after successful `createParticipantMutation`) |
| `participant_left`       | `plan_id`                                                                                                       | `useLeaveParticipant` hook (`onSuccess`)                                   |
| `ownership_transferred`  | `plan_id`                                                                                                       | `manage-participants` route + `usePlanActions` (`transferPlanOwnership`)   |
| `join_request_moderated` | `plan_id`, `decision` (`approved` \| `rejected`)                                                                | `manage-participants` route (approve/reject handlers)                      |

#### Custom events — defined in code, not yet called from UI/hooks

These `track*` helpers exist for the taxonomy; wire them when the corresponding feature work lands. Until then they only appear in unit tests.

| Event name                 | Properties (summary)                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `plan_created`             | `plan_id`, `has_location`, `has_dates`, `tags_count`, `visibility`                                                       |
| `plan_updated`             | `plan_id`                                                                                                                |
| `plan_deleted`             | `plan_id`                                                                                                                |
| `items_added`              | `plan_id`, `count`, `source` (`single` \| `bulk` \| `ai` \| `guest`)                                                     |
| `item_status_changed`      | `plan_id`, `from`, `to` — not wired; status changes are reflected in `item_updated.fields` (e.g. `assignmentStatusList`) |
| `ai_suggestions_requested` | `plan_id`                                                                                                                |
| `ai_suggestions_confirmed` | `plan_id`, `count`                                                                                                       |
| `expense_created`          | `plan_id`, `has_linked_items`                                                                                            |

When you add a new custom event or wire an existing `track*` call, update this table in the same PR.

### Adding a new client

1. Create `src/lib/<service>.ts`:
   ```typescript
   import { createClient } from "<package>";
   const token = import.meta.env.VITE_ < SERVICE > _TOKEN;
   // init conditionally, or export a no-op when token is absent
   export default token ? createClient(token) : noOpClient;
   ```
2. Import from `src/lib/<service>` everywhere — never from the package directly.
3. In tests, mock at the lib boundary:
   ```typescript
   vi.mock("../../../src/lib/<service>", () => ({
     default: { method: vi.fn() },
   }));
   ```
4. Add `VITE_<SERVICE>_TOKEN` to `.env.example`, `.env`, and the GitHub Secrets/Vars table below.

## API Layer & OpenAPI

The backend owns the OpenAPI spec. The frontend fetches and generates types from it.

- **Primary:** `src/core/api.ts` (custom fetch with Zod validation)
- **Secondary:** `src/core/api-client.ts` (openapi-fetch)
- **Sync:** `npm run api:sync` (uses `API_SPEC_TOKEN` or `GITHUB_TOKEN` to fetch from private BE repo)

## Supabase Auth

The FE handles sign-up/sign-in directly with Supabase — the BE only verifies JWTs.

### Google OAuth Production Setup

Complete this checklist when enabling Google OAuth for a new Supabase environment (dev/staging/prod):

1. **Supabase Dashboard > Auth > Providers:** Enable Email and Google. Paste Google Client ID + Secret.
2. **Supabase Dashboard > Auth > URL Configuration:** Set Site URL to production domain (e.g., `https://chillist.pages.dev`). Add Redirect URLs (`https://.../complete-profile`).
3. **Google Cloud Console > Credentials:** Create OAuth 2.0 Client ID (Web application). Add Supabase callback URL to Authorized redirect URIs.

_Common errors:_

- `Unsupported provider`: Provider not toggled ON in Supabase.
- `redirect_uri_mismatch`: Supabase callback URL missing from Google Cloud.
- Redirects to localhost after OAuth: Supabase Site URL still set to localhost.

### User Profile Data & Storage

- **Safe for React state/UI:** `session.user.id`, `email`, `user_metadata.full_name`, `avatar_url`.
- **Tokens:** `access_token` and `refresh_token` are managed automatically by the Supabase client. Do NOT store, copy, or log them manually.
- **Security:** NEVER trust client-side user data for authorization decisions. The BE enforces access via JWT verification.

## User Management & Auth-Gated Access

The app gates UI elements based on authentication state and plan ownership. These checks are **UX-only** — the BE enforces real access control via JWT.

- **Unauthenticated:** Read-only plan view. Plans list shows "Sign In". Invite page shows "Sign in to join".
- **Authenticated (non-owner):** Can view plans they have access to. No edit buttons on other owners' plans.
- **Authenticated (owner):** Full edit access (Edit Plan, participant preferences, RSVP badges).
- **Admin:** `isAdmin` from `user.app_metadata.role`. Sees red delete buttons on plans list.

### Invite Claim Flow

1. Guest clicks "Sign in to join" on invite page → `storePendingInvite(planId, inviteToken)` saves to localStorage.
2. Guest authenticates (Email or OAuth).
3. Post-auth, app checks `getPendingInvite()`. If found, it awaits `claimInvite()` (POST with JWT) to link the user, clears localStorage, and redirects to the plan.

## Features Overview

### Google Maps (Location Picker + Map Display)

- **Setup:** Requires `VITE_GOOGLE_MAPS_API_KEY`. Enable Maps JavaScript API and Places API (New) in Google Cloud.
- **Restrictions:** In Google Cloud, add HTTP referrer restrictions for your production domain. Leave unrestricted for local dev.
- **Library:** Uses `@vis.gl/react-google-maps`. Uses programmatic `fetchAutocompleteSuggestions` API to avoid Shadow DOM/CSS issues.

### Weather Forecast

- **API:** Open-Meteo (free, no API key). Fetches 7-day forecast if plan has lat/lon coordinates. Non-blocking.

### i18n (Internationalization)

- **Stack:** `i18next` + `react-i18next`. English (default) and Hebrew (RTL).
- **Usage:** All user-facing strings use `t()`. Add keys to both `en.json` and `he.json`.
- **RTL:** Use Tailwind logical properties (`ms-*`, `me-*`, `text-start`) instead of directional ones (`ml-*`, `text-left`).

#### Geo-based default language

A Cloudflare Pages Function (`functions/_middleware.ts`) sets a `chillist-geo-lang` cookie (`he` for Israel, `en` for all others) on every response. `getSavedLanguage()` in `src/i18n/index.ts` reads this cookie as the initial language when no explicit `localStorage['chillist-lang']` is present. Logged-in users always follow `preferences.preferredLang` from the backend; the cookie is never used for authenticated sessions.

**Language precedence (low → high):**

1. Geo cookie (`chillist-geo-lang`) — anonymous first visit only
2. `localStorage['chillist-lang']` — user's explicit choice (JSON-quoted, via `useLocalStorage`)
3. `preferences.preferredLang` from `GET /auth/profile` — logged-in users, applied by `ProfileLanguageSync`

**Testing the geo feature locally:**

_Client logic only (no Wrangler needed):_

1. Open DevTools → Application → Cookies → add `chillist-geo-lang=he`
2. Clear `localStorage` item `chillist-lang` (Application → Local Storage)
3. Hard-reload (`Cmd+Shift+R`) → page should open in Hebrew
4. Switch language via the toggle → reload → should stay on chosen language (localStorage wins)

_Test the Pages Function with Wrangler:_

```bash
npm run build
npx wrangler pages dev dist --compatibility-date=2024-01-01
# open http://localhost:8788
```

`request.cf.country` is not injected locally, so the function always sets `en`. To simulate Israel, pass the header directly:

```bash
curl -v -H "CF-IPCountry: IL" http://localhost:8788/ 2>&1 | grep "Set-Cookie"
# expect: Set-Cookie: chillist-geo-lang=he; ...
```

**Testing on production:**

| Scenario                     | How                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Israel → Hebrew              | Visit in incognito from an IL IP (or Israeli mobile data)                                      |
| Non-Israel → English         | Visit in incognito outside Israel                                                              |
| Simulate IL from abroad      | Connect VPN to Israel → incognito → should get Hebrew                                          |
| Simulate non-IL from Israel  | Connect VPN to US/EU → incognito → should get English                                          |
| Verify cookie was set        | DevTools → Application → Cookies → look for `chillist-geo-lang`                                |
| Verify localStorage override | Switch language via toggle → reload → stays on chosen language                                 |
| Logged-in user ignores geo   | Sign in, clear `chillist-lang` from localStorage, reload → follows `preferredLang`, not cookie |

### Plan Tag Wizard (`src/components/PlanTagWizard.tsx`)

3-tier tag wizard integrated as **Step 1** in `CreatePlanWizard` (fun, low-effort start). Step 1 layout: **title input** (required, validated before advancing) → **PlanTagWizard** → **description textarea** (optional, supplements tags). Title and description are managed as parent-level state in `CreatePlanWizard` and passed to `DetailsForm` (step 2) via props + hidden inputs.

Tag options are driven by `src/data/plan-creation-tags.json`. The `onBack` prop is optional — omitted when the wizard is the first step.

- **Tier 1:** Single-select (plan type: camping, beach, hotel trip, etc.)
- **Tier 2:** Multi-select (logistics: stay, food, vibe) — conditional on tier 1 selection. Uses **mutex groups** for mutually exclusive options within a concern (e.g., hotel vs apartment) and **cross-group rules** for dependent disable/deselect across concerns (e.g., apartment disables hotel meals). Duration/day-count questions are omitted — the date picker handles that.
- **Tier 3:** Multi-select (specifics: shared meals, BYO food, etc.) — conditional on tier 2 selections, capped at 5 options
- **Summary:** Shows all selected tags as chips before confirming (SelectedChips hidden on summary to avoid duplication)
- **Chip navigation:** Clicking a chip navigates back to that tier for editing
- **Skip:** Each tier and the whole step can be skipped (title still validated)
- **Legacy tag preservation:** Tags from older plans that no longer exist in the current wizard are silently passed through in the output so they are not lost on edit/save.
- Tags are passed as `string[]` in the plan creation payload (`tags` field on `PlanCreateWithOwner`)
- i18n keys under `tagWizard.*` namespace in all locale files. Legacy tag ids are kept in translations for backward compatibility.

### URL Feature Flags (`src/core/feature-flags.ts`)

Lightweight feature flag system using URL query params + `sessionStorage`. Flags are captured from the URL on **any page** at app boot (`captureFeatureFlags()` in `main.tsx`) and stored in `sessionStorage` under `chillist-feature-flags`. They persist across client-side navigation for the tab session and are cleared when the tab is closed.

**Usage:** Append flags as query params to any URL shared with users:

- `/?noTags=true` — flag captured on home, survives navigation to `/create-plan`
- `/create-plan?noTags=true` — direct link also works

**Reading flags in components:** Use `useFeatureFlags()` hook from `src/hooks/useFeatureFlags.ts`.

**Current flags:**

| Flag     | Default | Effect                                                    |
| -------- | ------- | --------------------------------------------------------- |
| `noTags` | `false` | Hides the `PlanTagWizard` in step 1 of `CreatePlanWizard` |

**Adding a new flag:**

1. Add the flag name to the `KNOWN_FLAGS` array in `src/core/feature-flags.ts`
2. Add its default value (`false`) to the `DEFAULTS` object
3. Read it via `useFeatureFlags()` in the component that needs it

**Design notes:**

- Only writes to `sessionStorage` when at least one known flag is present in the URL — navigating to a page without flags does not wipe previously captured ones.
- Invalid values (e.g. `?noTags=banana`) fall back to `false`.
- Not a replacement for a full feature flag service — meant for internal dev/testing toggles.

### Bulk Add Wizard (`src/components/BulkItemAddWizard.tsx`)

3-step wizard (category → subcategory → items). Single search filters common items; when typed text doesn't match, "Add [name]" row appears and Enter adds custom item. Items step uses a 2–3 column grid of compact cards (name centered, quantity controls stacked below when selected).

### Common Items Data (`src/data/common-items.json`)

Static JSON for autocomplete suggestions. Localized variants: `common-items.he.json` (Hebrew/Israeli), `common-items.es.json` (Spanish).

- **Rules:** Every item must have a unique `id`, `category` (group_equipment/personal_equipment/food), and a valid `subcategory` from `src/data/subcategories.ts`.
- **Enrichment:** Run `npx tsx scripts/enrich-common-items-with-subcategory.ts` to bulk-assign subcategories.
- **Hebrew list:** Uses Israeli colloquial terms (מנגל not גריל, גזייה not כירת קמפינג, לדרמן not כלי רב שימושי, etc.). Includes Israeli-specific items (מטקות, סחוג, עמבה, ביסלי, במבה, ערק, זעתר, סומק, בהרט, מרגז, שישליק, קבב). Omits items irrelevant to Israel (bear gear, snow equipment, American-specific foods/games like s'mores, cornhole, Graham crackers). Pork items replaced with Israeli equivalents (פסטרמה, שניצל, קבב, שישליק).

## Testing & CI/CD

- **Unit/Integration:** Vitest + React Testing Library. Global mocks in `tests/setup.ts`.
- **E2E:** Playwright. Pre-push hook runs all 4 browsers. CI runs Chrome only. Use `npm run e2e:docker` for Linux-WebKit parity.

### Playwright E2E — stable defaults (`playwright.config.ts`)

These are **project conventions**, not one-off hacks. Keep them when touching Playwright config or adding navigations.

| Topic               | Rule                                                                                                                                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **webServer `env`** | Always set `VITE_AUTH_MOCK=true`, `VITE_E2E=true`, and **`VITE_POSTHOG_MOCK=true`** so the Vite process spawned for E2E does not call real Supabase/PostHog. Do not rely only on a developer’s local `.env`.                                                                     |
| **`page.goto`**     | Default `waitUntil: 'load'` can **time out** on Vite SPAs under parallel workers or slow chunk loading. For tests that only need the document to start (e.g. auth redirect), use **`waitUntil: 'domcontentloaded'`**. Reserve full `load` when you truly need every subresource. |
| **Retries**         | `retries: 1` is enabled so transient flakes do not block pushes; fix root causes when a test fails twice.                                                                                                                                                                        |
| **Stale Vite**      | Before local E2E, kill anything on port **5174** if Playwright reuses a server (`lsof -i :5174 -P -n -t \| xargs kill`). A stale server without `VITE_AUTH_MOCK` causes mass auth failures.                                                                                      |

**Browser session in E2E:** `initSession()` in `main.tsx` runs **once per full page load**. After sign-out, **client-side** navigation to `/` does not run `initSession()` again. To assert a **new** `chillist-session-id` in `localStorage`, use **`page.reload()`** after the post-sign-out URL, or wait for behavior that calls `getSessionId()` (API request with `X-Session-ID`, or debounced activity). See `tests/e2e/session.spec.ts`.

- **E2E browser session:** `tests/e2e/session.spec.ts` covers `localStorage` keys (`chillist-session-id`, `chillist-session-last-active`), that mock API requests’ `X-Session-ID` matches storage, reload and 15-minute expiry, sign-out clearing keys, **reload** to observe a new session id after home, and two tabs sharing one session id.
- **WebKit Quirks:** Use `click({ force: true })` on submit buttons in Headless UI modals and increase `toBeHidden` timeouts for WebKit. If a `click()` silently fails on Mobile Safari (e.g. after async re-renders), use `locator.evaluate((el: HTMLElement) => el.click())` as a reliable fallback. For SPA navigation assertions, use `expect(page).toHaveURL(...)` — never `page.waitForURL`. See [rules/frontend.md §7](../rules/frontend.md) and dev-lesson: _Mobile Safari click + SPA navigation_.

### Selector strategy (RTL + Playwright)

Full rules: [rules/frontend.md §7](../rules/frontend.md) — Testing Rules.

**Short version:** Use `data-testid` + `getByTestId` for anything you **click** and for assertions that a **step, section, or modal** is visible. Do not assert wizard/section presence with `getByText(/English/i)` on strings that come from `t()` — those tests break on every copy or locale change. See dev-lessons: _Unit tests asserting on i18n headings_ (search `dev-lessons/frontend.md`).

### Mock Server (`api/server.ts`)

The mock server is a Fastify instance that mirrors the real backend API. It is used by E2E tests and local development (`npm run mock:server`). It does **not** auto-sync with the OpenAPI spec — it must be maintained manually.

**Rules for keeping it in sync (treat this as a checklist on every PR):**

- Add a route handler when a new backend endpoint is implemented.
- When an endpoint gains a new response shape (e.g. an access-restricted 2xx, a different payload based on auth state), add that branch to the mock handler.
- When a field is renamed or removed from a response schema, update the mock fixture to match.
- When a new participant/auth state is introduced (e.g. non-participant visitor, pending invite), model it in the mock so tests can reach that state.

**The most common failure mode** is a new backend behavior shipping (e.g. returning `{ status: 'not_participant' }` instead of a full plan) without a matching mock handler. All tests pass because they only ever exercise the happy path. The bug surfaces in production. Before closing a PR, ask: _does the mock server reflect every state the real backend can return for each endpoint I touched?_

### CI/CD (GitHub Actions → Cloudflare Pages)

- **CI (`ci.yml`):** Runs on PRs. Lints, typechecks, unit tests, integration tests, and E2E tests (Chrome).
- **Deploy (`deploy.yml`):** Runs on push to `main`. Validates env vars, builds, and deploys to Cloudflare Pages. Does not run tests (trusts CI).

**Required GitHub Secrets/Vars:**

| Name                                    | Type     | Purpose                                                                                                                                                             |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`                  | Secret   | Cloudflare Pages deploy token                                                                                                                                       |
| `CLOUDFLARE_ACCOUNT_ID`                 | Variable | Cloudflare account ID                                                                                                                                               |
| `CLOUDFLARE_PROJECT_NAME`               | Variable | Cloudflare Pages project name                                                                                                                                       |
| `API_SPEC_TOKEN`                        | Secret   | GitHub PAT to fetch OpenAPI spec from private BE repo                                                                                                               |
| `VITE_API_URL`                          | Variable | Backend API base URL                                                                                                                                                |
| `VITE_SUPABASE_URL`                     | Variable | Supabase project URL                                                                                                                                                |
| `VITE_SUPABASE_ANON_KEY`                | Variable | Supabase anon key                                                                                                                                                   |
| `VITE_GOOGLE_MAPS_API_KEY`              | Variable | Google Maps API key                                                                                                                                                 |
| `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN`     | Variable | PostHog project token (public, goes into browser bundle)                                                                                                            |
| `VITE_PUBLIC_POSTHOG_HOST`              | Variable | **Local/dev only** — direct ingest URL (e.g. `https://us.i.posthog.com`). Production ignores this for `api_host` and uses same-origin `/ingest` (see proxy below).  |
| `VITE_PUBLIC_POSTHOG_SESSION_RECORDING` | Variable | Optional. Set `true` only if you want PostHog session replay (loads `posthog-recorder.js`; often blocked by extensions). Omit or leave unset/false for events-only. |
| `VITE_POSTHOG_MOCK`                     | Variable | Set `true` to use in-memory fake PostHog (tests / local E2E server — no events sent)                                                                                |
| `VITE_PUBLIC_POSTHOG_DEBUG`             | Variable | Optional. Set `true` only for local debugging (verbose console logs). Omit or `false` in production                                                                 |

#### PostHog reverse proxy (Cloudflare Pages Function)

`functions/ingest/[[path]].ts` proxies `/ingest/*` to PostHog **ingest** and **asset** hosts (defaults US). The implementation follows the [official PostHog Cloudflare Workers guide](https://posthog.com/docs/advanced/proxy/cloudflare): copy all request headers, delete `cookie`, set `X-Forwarded-For`. The only adaptation is `stripIngestPath()` which removes the `/ingest` prefix (Pages Function mount point). Previously it forwarded only a **small header allowlist** (`content-type`, `accept`, `accept-language`, `user-agent`, plus `X-Forwarded-For` from `CF-Connecting-IP`). That avoids forwarding app headers (e.g. `Authorization`, `x-api-key`, `cf-*`, `host`) that could cause **`401` on `/ingest/flags/`** with “invalid API key” from PostHog.

~~**EU projects:**~~ (Removed — project is US.) Previously: In Cloudflare Pages → **Settings** → **Environment variables** (Production), set `POSTHOG_INGEST_HOST=eu.i.posthog.com` and `POSTHOG_ASSET_HOST=eu-assets.i.posthog.com`. In GitHub Variables set `VITE_PUBLIC_POSTHOG_REGION=eu` (and use `https://eu.i.posthog.com` for local `VITE_PUBLIC_POSTHOG_HOST`). US projects can omit those.

Flow: **browser** → `https://<your-domain>/ingest/...` → **Pages Function** → PostHog. The proxy deploys with every Pages build.

**Compression + transport caveat:** The Pages Function proxy (with `_middleware.ts` in the chain) corrupts gzip-compressed request bodies. The PostHog SDK must run with both `disable_compression: true` (plain JSON bodies) and `__preview_disable_beacon: true` (prevents `sendBeacon`, which ignores `disable_compression` in posthog-js v1.364.3). Trade-off: `$pageleave` is slightly less reliable without sendBeacon. If compression or sendBeacon is needed, migrate to a standalone Cloudflare Worker on a subdomain or skip middleware for `/ingest/*` paths.

**Verify after deploy:** DevTools Network tab: `/ingest/` requests return **200**. Then confirm events appear in PostHog (check Live view or run `npm run posthog -- --no-localhost --days 1`). A `200` from the proxy alone does not guarantee ingestion — PostHog silently drops malformed payloads. If events still don't appear: (1) check that `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` in GitHub matches the active PostHog project, (2) inspect the deployed JS bundle for trailing whitespace in the token (`curl -s https://<domain>/assets/index-*.js | python3 -c "import sys; d=sys.stdin.buffer.read(); i=d.find(b'phc_'); print(repr(d[i:i+60]))"` — any `\r` or `\n` after the token means the GitHub Variable has invisible trailing characters).

**Session recording:** If enabled, ignore `ERR_BLOCKED_BY_CONTENT_BLOCKER` on `posthog-recorder.js` when testing with ad blockers — client-side blocking, not the proxy failing.
