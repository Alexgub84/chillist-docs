# Frontend Guide

Setup, development, and deployment guide for `chillist-fe`.

---

## README-first Workflow (Minimal Context Per Task)

Before opening deep docs or scanning folders, start in the frontend repo with:

1. `README.md` (route map, folder map, "how to find files")
2. `../chillist-docs/rules/frontend.md` (strict minimal execution rules)

Then open only files relevant to the task. Use this guide when you need deeper setup and operational detail.

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
- `npm run screenshots`: Capture home page screenshots for EN/HE

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

### Plan Tag Wizard (`src/components/PlanTagWizard.tsx`)

3-tier tag wizard integrated as **Step 1** in `CreatePlanWizard` (fun, low-effort start). Step 1 layout: **title input** (required, validated before advancing) → **PlanTagWizard** → **description textarea** (optional, supplements tags). Title and description are managed as parent-level state in `CreatePlanWizard` and passed to `DetailsForm` (step 2) via props + hidden inputs.

Tag options are driven by `src/data/plan-creation-tags.json`. The `onBack` prop is optional — omitted when the wizard is the first step.

- **Tier 1:** Single-select (plan type: camping, beach, hotel trip, etc.)
- **Tier 2:** Multi-select (logistics: cooking, tent setup, day trip, etc.) — conditional on tier 1 selection
- **Tier 3:** Multi-select (specifics: shared meals, BYO food, etc.) — conditional on tier 2 selections, capped at 5 options
- **Summary:** Shows all selected tags as chips before confirming (SelectedChips hidden on summary to avoid duplication)
- **Chip navigation:** Clicking a chip navigates back to that tier for editing
- **Skip:** Each tier and the whole step can be skipped (title still validated)
- Tags are passed as `string[]` in the plan creation payload (`tags` field on `PlanCreateWithOwner`)
- i18n keys under `tagWizard.*` namespace in all locale files

### Bulk Add Wizard (`src/components/BulkItemAddWizard.tsx`)

3-step wizard (category → subcategory → items). Single search filters common items; when typed text doesn't match, "Add [name]" row appears and Enter adds custom item. Items step uses a 2–3 column grid of compact cards (name centered, quantity controls stacked below when selected).

### Common Items Data (`src/data/common-items.json`)

Static JSON for autocomplete suggestions.

- **Rules:** Every item must have a unique `id`, `category` (equipment/food), and a valid `subcategory` from `src/data/subcategories.ts`.
- **Enrichment:** Run `npx tsx scripts/enrich-common-items-with-subcategory.ts` to bulk-assign subcategories.

## Testing & CI/CD

- **Unit/Integration:** Vitest + React Testing Library. Global mocks in `tests/setup.ts`.
- **E2E:** Playwright. Pre-push hook runs all 4 browsers. CI runs Chrome only. Use `npm run e2e:docker` for Linux-WebKit parity.
- **WebKit Quirks:** Use `click({ force: true })` on submit buttons in Headless UI modals and increase `toBeHidden` timeouts for WebKit.

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
`API_SPEC_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_API_KEY`, `VITE_API_URL`, `CLOUDFLARE_PROJECT_NAME`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_MAPS_API_KEY`.
