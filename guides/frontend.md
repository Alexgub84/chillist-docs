# Frontend Guide

Setup, development, and deployment guide for `chillist-fe`.

---

## Tech Stack

- React 19
- TypeScript
- Vite 7
- Tailwind CSS v4 (Vite plugin — no `tailwind.config.js`)
- TanStack Router (file-based routing)
- TanStack React Query
- React Hook Form + Zod resolvers
- openapi-fetch + custom fetch layer with Zod validation (dual API layer)
- Headless UI (`@headlessui/react` — accessible UI primitives)
- react-hot-toast (notifications)
- clsx (conditional classNames)
- uuid (ID generation)
- i18next + react-i18next (internationalization — English + Hebrew)
- Vitest + React Testing Library (unit)
- Playwright (E2E)
- ESLint + Prettier
- Husky (pre-push hooks)

## Setup

### Install dependencies

```bash
npm install
```

### Configure environment variables

```bash
cp .env.example .env
```

Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MOCK_SERVER_HOST` | Host for dev mock server | `localhost` |
| `MOCK_SERVER_PORT` | Port for dev mock server | `3333` |
| `VITE_API_URL` | API base URL for the frontend | `http://localhost:3333` |
| `VITE_API_KEY` | API key for production auth | (empty for dev) |
| `VITE_SUPABASE_URL` | Supabase project URL | (required for auth) |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable key (safe for browser) | (required for auth) |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps API key (optional — enables location autocomplete + map) | (empty) |

## Running Locally

### With mock server (no backend needed)

```bash
npm run mock:server   # starts mock API on localhost:3333
npm run dev           # starts Vite dev server (auto-fetches OpenAPI spec)
```

### With real backend

```bash
# Ensure chillist-be is running on localhost:3333
npm run dev
```

> `npm run dev` runs `predev` which fetches the OpenAPI spec from the backend GitHub repo.

**Note:** The "Add as owner" feature (promoting a participant to owner) requires the mock server. The real backend does not yet accept `role: 'owner'` in PATCH /participants. Use `npm run mock:server` to test this locally.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server (fetches OpenAPI spec first) |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run test` | Run all tests (unit + integration + E2E, all browsers) |
| `npm run test:unit` | Run unit tests once |
| `npm run test:unit:watch` | Run unit tests in watch mode |
| `npm run test:integ` | Run integration tests once |
| `npm run test:e2e` | Run E2E tests (all browsers) |
| `npm run mock:server` | Start mock API server with watch |
| `npm run mock:server:ci` | Start mock API server without watch (CI) |
| `npm run api:fetch` | Fetch OpenAPI spec from backend repo |
| `npm run api:types` | Generate TypeScript types from OpenAPI spec |
| `npm run api:sync` | Fetch spec + regenerate types |
| `npm run e2e` | Run Playwright E2E tests |
| `npm run e2e:ui` | Run E2E tests with Playwright UI |
| `npm run e2e:headed` | Run E2E tests in headed browser mode |
| `npm run e2e:docker` | Run E2E tests in Linux Docker (matches CI WebKit) |
| `npm run routes` | Regenerate TanStack Router route tree |
| `npm run screenshots` | Capture home page step screenshots (EN + HE) |

## Mock Data Toolkit

The mock server (`api/server.ts`) exposes a Fastify server backed by `api/mock-data.json`. All write operations persist to the JSON file so you iterate with realistic data.

The mock server implements all real backend endpoints plus a few extras for frontend convenience:

- `PATCH /plans/:planId` — plan updates (not yet in real backend)
- `GET /items/:itemId` — single item fetch (not yet in real backend)

When the real backend adds these endpoints, the mock server will already be aligned.

## API Layer

The frontend has two API layers:

1. **`src/core/api.ts`** (primary) — custom `request()` helper with Zod validation on responses. All mutation/query functions live here (`fetchPlans`, `createItem`, `updateItem`, etc.)
2. **`src/core/api-client.ts`** (secondary) — `openapi-fetch` typed client generated from the OpenAPI spec. Used for `fetchPlansFromOpenAPI()` and `checkHealth()`.

### Type Generation (OpenAPI)

The backend owns the OpenAPI spec. The frontend fetches and generates types from it.

```bash
npm run api:sync          # fetch + generate (recommended)
npm run api:fetch         # fetch spec only
npm run api:types         # generate types only (when spec is already local)
```

Regenerate types whenever the backend API changes.

### `api:fetch` authentication

`scripts/fetch-openapi.sh` downloads the spec from `chillist-be` (private repo). Auth token resolution:

1. **`API_SPEC_TOKEN`** — used if set (CI and local)
2. **`GITHUB_TOKEN`** — fallback, only when NOT in CI (local dev convenience)
3. **No auth** — fallback if neither is set (works only if the repo is public)

- **Locally:** Works via your shell's `GITHUB_TOKEN` (PAT) or `API_SPEC_TOKEN`
- **In CI:** The workflow passes `API_SPEC_TOKEN` from a GitHub secret (a fine-grained PAT scoped to `chillist-be` read-only). The built-in `GITHUB_TOKEN` is NOT used because it is scoped to the current repo only and cannot access other private repos.

## Supabase Auth

The FE handles sign-up/sign-in directly with Supabase — the BE only verifies JWTs.

### Setup

Install `@supabase/supabase-js` and create a client instance (e.g., `src/lib/supabase.ts`):

```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

### Google OAuth Production Setup

Complete this checklist when enabling Google OAuth for a new Supabase environment (dev/staging/prod):

**Supabase Dashboard:**

1. **Authentication > Providers > Email** — toggle ON, enable "Allow new users to sign up"
2. **Authentication > Providers > Google** — toggle ON, paste Client ID + Client Secret (from Google Cloud Console)
3. **Authentication > URL Configuration > Site URL** — set to the production frontend URL (e.g., `https://chillist.pages.dev`). Supabase redirects here after OAuth — if left as `localhost`, prod users get redirected to localhost
4. **Authentication > URL Configuration > Redirect URLs** — add:
   - `https://your-prod-domain.pages.dev/complete-profile` (prod)
   - `http://localhost:5173/complete-profile` (local dev)

**Google Cloud Console:**

1. Go to [console.cloud.google.com](https://console.cloud.google.com) > **APIs & Services** > **Credentials**
2. Create **OAuth 2.0 Client ID** (type: **Web application**)
3. Under **Authorized redirect URIs**, add the Supabase callback URL (copy from Supabase Dashboard > Auth > Google provider): `https://XXXXXXXX.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client Secret** into Supabase (step 2 above)
5. Configure **OAuth consent screen** — start with "Testing" mode (only manually added test users can sign in). Submit for Google verification when ready for public access.

**Common errors if setup is incomplete:**

| Error | Cause | Fix |
|-------|-------|-----|
| `Unsupported provider: provider is not enabled` | Provider not toggled ON in Supabase | Enable Email/Google in Supabase > Auth > Providers |
| `redirect_uri_mismatch` | Supabase callback URL missing from Google Cloud | Add callback URL to Google OAuth credential's redirect URIs |
| Redirects to localhost after OAuth | Supabase Site URL set to localhost | Change Site URL to production domain in Supabase > Auth > URL Configuration |

### Sign-up / Sign-in

- Email + password: `supabase.auth.signUp({ email, password })` / `supabase.auth.signInWithPassword({ email, password })`
- Google OAuth: `supabase.auth.signInWithOAuth({ provider: 'google' })`
- Sign out: `supabase.auth.signOut()`

### Profile completion (post sign-up)

After sign-up (both email and Google OAuth), the user is redirected to `/complete-profile` where they can optionally edit first name, last name, phone, and email. Profile data is saved to Supabase `user_metadata` via:

```typescript
await supabase.auth.updateUser({
  data: { first_name: '...', last_name: '...', phone: '...' }
})
```

Email changes are handled separately via `updateUser({ email: '...' })` which triggers Supabase's email verification flow — a confirmation link is sent to the new address.

`updateUser` merges into existing metadata (preserves Google's `full_name`, `avatar_url`). For Google users, the form pre-fills first/last name from `full_name`. The email field is pre-filled from `user.email`. The page is skippable — users can go straight to `/plans`.

After `updateUser` succeeds, the frontend refreshes the Supabase session (`supabase.auth.refreshSession()`) and calls `POST /auth/sync-profile` with the refreshed JWT so participant records in existing plans are updated immediately. This call is fire-and-forget and does not block navigation.

### Session management

- Get current session: `supabase.auth.getSession()`
- Listen for changes: `supabase.auth.onAuthStateChange((event, session) => { ... })`
- Token refresh is handled automatically by the Supabase client

### Sending JWT to the backend

After sign-in, send the access token on all BE API calls:

```typescript
const { data: { session } } = await supabase.auth.getSession()

fetch(`${API_URL}/auth/me`, {
  headers: {
    'Authorization': `Bearer ${session?.access_token}`,
  },
})
```

### Verification endpoint

`GET /auth/me` on the BE requires a valid JWT and returns `{ user: { id, email, role } }`. Use this to verify the auth chain works end-to-end after sign-in.

## User Profile Data (FE Storage)

### What the Supabase session provides

After sign-in, the Supabase client provides a `session` object with user profile data. These fields are safe to use in the FE:

| Field | Description | Safe to display? |
|-------|-------------|-----------------|
| `session.user.id` | Supabase user UUID | Yes |
| `session.user.email` | User's email address | Yes |
| `session.user.user_metadata.full_name` | Display name (from Google or custom) | Yes |
| `session.user.user_metadata.avatar_url` | Profile photo URL (from Google) | Yes |
| `session.access_token` | JWT for BE API calls | Never display; managed by Supabase client |

### Storage rules

- **User ID, email, display name, avatar URL** — safe for React state/context and UI display.
- **Access token** — managed automatically by the Supabase client (stored in localStorage by default). Do NOT store, copy, or log it manually.
- **Refresh token** — handled internally by the Supabase client. NEVER expose, store separately, or send to the BE.
- **Service role key** — NEVER exists in the FE. Only the anon/publishable key is used.

### Security rules

- NEVER trust client-side user data for authorization decisions. The BE enforces access via JWT verification.
- NEVER log tokens to the console in production.
- The `VITE_SUPABASE_ANON_KEY` is public by design (Supabase calls it "publishable"). It is safe to expose in the browser.

### How this connects to plan creation

- When creating a plan, the FE reads `session.user` for the owner's identity.
- Pre-fill owner name from `user_metadata.full_name` and email from `session.user.email` when calling `POST /plans/with-owner`.
- The JWT is sent via `Authorization: Bearer` header on the API call.
- Later (Step 3: Permissions), the BE will extract `request.user.id` from the JWT to link the plan to the authenticated user in the database.
- Until Step 3, the owner participant is still created from the request body payload (no enforced link to the Supabase user yet).

## User Management & Auth-Gated Access

The app gates UI elements based on four levels of user identity. All checks are UX-only — the BE enforces real access control via JWT.

### Access levels

| Level | How detected | What's visible |
|-------|-------------|---------------|
| **Unauthenticated** | `!user` from `useAuth()` | Read-only plan view. Plans list shows "Sign In" / "Sign Up" instead of "Create New Plan". Invite page shows "Sign in to join" / "Create an account". Plan form only allows `public` visibility. No edit/delete buttons anywhere. |
| **Authenticated (non-owner)** | `user` exists but `user.id !== owner.userId` | Can view plans they have access to. Plans list shows "Create New Plan". Invite page auto-redirects to `/plan/:planId` (claims invite first). No edit buttons on other owners' plans or participant preferences. No "Edit Plan" button. |
| **Authenticated (owner)** | `user.id === owner.userId` (derived from `plan.participants`) | Full edit access: "Edit Plan" button (opens `EditPlanForm` modal), "Edit" buttons on participant preferences, RSVP and invite status badges visible, manage participants modal with invite link sharing. Plan form allows `private` and `invite_only` visibility. |
| **Admin** | `isAdmin` from `useAuth()` (reads `app_metadata.role`) | All of the above + red delete buttons on every plan card in the plans list, with a confirmation modal before deletion. |

### Deriving ownership

```typescript
const { user } = useAuth();
const owner = plan.participants.find(p => p.role === 'owner');
const isOwner = !!user && !!owner?.userId && user.id === owner.userId;
```

The `userId` field on participants is populated by the BE when a JWT is present during participant creation (opportunistic user tracking). For older plans created before auth, `userId` may be `null` — in that case `isOwner` is `false` and the edit UI is hidden.

### Edit plan (owner only)

The plan detail page shows an "Edit Plan" pencil button (top-right) only when `isOwner` is true. Clicking it opens the `EditPlanForm` modal where the owner can update title, description, dates, location, tags, and status. The mutation uses `useUpdatePlan` (`PATCH /plans/:planId`). Non-owners and unauthenticated users see no edit button.

### Admin delete

Admins (`isAdmin` from `useAuth()`) see a red trash button on every plan card in the plans list. Clicking it opens a confirmation modal. Confirming calls `useDeletePlan` (`DELETE /plans/:planId`). Non-admin users never see delete buttons.

### Plan visibility & auth gating

The plan form gates visibility options by auth state:

| Auth state | Available visibility options |
|------------|----------------------------|
| Unauthenticated | `public` only |
| Authenticated | `private`, `invite_only` |

Default visibility is `private` for authenticated users, `public` for unauthenticated.

### RSVP status

Each participant has an `rsvpStatus` field (`pending` | `confirmed` | `not_sure`). This is displayed as a colored badge next to the participant's name:

- `confirmed` — green badge
- `not_sure` — yellow badge
- `pending` — gray badge

RSVP badges are only visible to the plan owner (gated by `isOwner`). The owner's own card never shows an RSVP badge. Badges appear in both the Group Details section and the Manage Participants modal.

### Invite status

Each participant has an `inviteStatus` field (`pending` | `invited` | `accepted`):

- `pending` — participant created but no invite sent yet
- `invited` — invite token generated and link shared
- `accepted` — participant claimed the invite via `POST /plans/:planId/claim/:inviteToken`

The claim endpoint links the authenticated user's `userId` to the participant record and sets `inviteStatus` to `accepted`. It requires a valid JWT and returns 401 if unauthenticated, 404 if the token is invalid, and 400 if already claimed.

### Invite claim flow (sign-in from invite page)

When a guest clicks "Sign in to join" or "Create an account" on the invite page:

1. **Store:** `storePendingInvite(planId, inviteToken)` saves to `localStorage('chillist-pending-invite')`
2. **Navigate:** Guest goes to `/signin?redirect=/plan/:planId` or `/signup?redirect=/plan/:planId`
3. **Auth completes** — two paths:

**Email auth (sign-in/sign-up):**
1. Auth succeeds → `signin.lazy.tsx` / `signup.lazy.tsx` checks `getPendingInvite()`
2. If found: **awaits** `claimInvite(planId, inviteToken)` (POST with JWT), clears localStorage, invalidates React Query cache
3. Navigates to `/plan/:planId` — plan is accessible because `userId` is now linked

**OAuth (Google):**
1. OAuth `redirectTo` is set to `/plan/:planId` (via the `?redirect` search param)
2. `AuthProvider.onAuthStateChange` fires `SIGNED_IN` → checks `getPendingInvite()` → calls `claimInvite()` in background → invalidates query cache on success
3. User lands on `/plan/:planId` — by the time the page mounts and fetches, the claim is typically complete

**Already-authenticated user visiting invite link:**
1. Invite page detects `isAuthenticated` → calls `claimInvite()` automatically
2. On completion (or error for already-claimed), redirects to `/plan/:planId`

Files: `src/core/pending-invite.ts` (store/get/clear), `src/core/api.ts` (`claimInvite`), `src/routes/signin.lazy.tsx` / `src/routes/signup.lazy.tsx` (email claim + OAuth redirect), `src/contexts/AuthProvider.tsx` (OAuth fallback claim), `src/routes/invite.$planId.$inviteToken.lazy.tsx` (auto-redirect for authenticated users).

### Guest continue without signing in

Unauthenticated users on the invite landing page can click "Continue without signing in" to open a preferences modal (adults, kids, food preferences, allergies, notes). On submit, preferences are saved via `PATCH /plans/:planId/invite/:inviteToken/preferences` (public endpoint, no JWT required — the invite token identifies the participant). See `saveGuestPreferences()` in `src/core/api.ts`. After submit or skip, the modal closes and the guest stays on the invite page.

> **Note:** The `PATCH /plans/:planId/invite/:inviteToken/preferences` endpoint is not yet implemented in the production backend — guest preference saves will return 404 until it is added.

### Public API (invite endpoint)

The invite landing page (`/invite/:planId/:inviteToken`) uses `publicRequest()` instead of `request()` to fetch plan data without authentication. This endpoint returns PII-stripped participant data (only `participantId`, `displayName`, `role` — no phone, email, or preferences). See `src/core/api.ts > publicRequest()` and `src/hooks/useInvitePlan.ts`.

Public endpoints (no JWT required):
- `GET /plans/:planId/invite/:inviteToken` — fetch plan data (PII-stripped)
- `PATCH /plans/:planId/invite/:inviteToken/preferences` — save guest preferences (body: `adultsCount`, `kidsCount`, `foodPreferences`, `allergies`, `notes`)

### Invite link sharing

The plan detail page (owner view) includes a "Copy invite link" button next to each participant and in the manage participants modal. The link format is `/invite/:planId/:inviteToken`. The link can be copied to clipboard or shared via the Web Share API (on supported devices). After adding a new participant, the invite link is automatically copied to clipboard.

## Google Maps (Location Picker + Map Display)

The app uses Google Maps for smart location autocomplete when creating plans and for displaying an interactive map on the plan detail page. This feature is **optional** — if `VITE_GOOGLE_MAPS_API_KEY` is not set, the location fields fall back to manual text inputs with no map.

### Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) > **APIs & Services** > **Credentials**
2. Create an **API key**
3. Enable the following APIs under **APIs & Services > Library**:
   - **Maps JavaScript API**
   - **Places API (New)** (required for `PlaceAutocompleteElement`)
4. Set the API key in `.env`:
   ```
   VITE_GOOGLE_MAPS_API_KEY=your-api-key
   ```

### API Key Restrictions (important)

In **Google Cloud Console > Credentials > your API key**:

1. **Application restrictions** — select **HTTP referrers (websites)**
2. **Website restrictions** — add all domains that will use the key:
   - `http://localhost:5173/*` (local dev)
   - `https://your-prod-domain.pages.dev/*` (production)
   - Any staging/preview domains

**When you change the production domain, you MUST update the allowed referrers in Google Cloud Console.** Otherwise the Maps API will return `RefererNotAllowedMapError` and the map/autocomplete will break on the new domain.

### How it works

- **Plan form** (`PlanForm.tsx`): A `PlaceAutocompleteElement` (Google's new Places widget) is shown above the manual location fields. When the user selects a place, all fields (name, city, country, region, latitude, longitude) are auto-filled via `fetchFields()`. The manual fields remain editable. A mini map preview appears when coordinates are set.
- **Plan detail** (`Plan.tsx`): If the plan's location has latitude/longitude, an interactive map with a pin is displayed alongside the text description. On mobile the map is full-width above the text; on desktop they sit side by side.
- **No API key?** Both components render nothing — the manual text fields in the form still work, and the plan detail shows the text description only.

### Library

Uses `@vis.gl/react-google-maps` (official Google Maps React wrapper). Each component that needs the map wraps itself with `<APIProvider>` locally — no global provider in the root route. The autocomplete component uses `version="beta"` on its `APIProvider` to access `PlaceAutocompleteElement`.

## Weather Forecast

The plan detail page shows a 7-day weather forecast when the plan has a location with latitude/longitude coordinates.

### How it works

- **API:** [Open-Meteo](https://open-meteo.com/) — free, no API key required. Called directly from the frontend (same pattern as Google Maps).
- **Data flow:** `useForecast` hook → `fetchForecast` (Open-Meteo API) → `Forecast` component
- **Fetch behavior:** `staleTime: 0` — refetches on every page mount. Non-blocking: if the API fails or location has no coordinates, the forecast section simply doesn't render.
- **WMO weather codes** are mapped to emoji icons and translated descriptions (EN + HE).

### Files

| File | Description |
|------|-------------|
| `src/core/schemas/weather.ts` | Zod schemas for forecast data |
| `src/core/weather-api.ts` | Open-Meteo fetch + response transform |
| `src/hooks/useForecast.ts` | React Query hook (staleTime: 0, non-blocking) |
| `src/components/Forecast.tsx` | Horizontal scrollable day cards UI |

### No location?

If the plan has no location or no lat/lon coordinates, the forecast hook is disabled (`enabled: false`) and no API call is made.

## Toast Notifications

Uses [react-hot-toast](https://github.com/timolins/react-hot-toast). The `<Toaster>` is in the root layout (`src/routes/__root.tsx`).

### Error messages

Use `toast.error()` with the shared error helper for consistency:

```typescript
import toast from 'react-hot-toast';
import { getApiErrorMessage } from '../core/error-utils';

try {
  await someMutation.mutateAsync(payload);
} catch (err) {
  const { title, message } = getApiErrorMessage(
    err instanceof Error ? err : new Error(String(err))
  );
  toast.error(`${title}: ${message}`);
}
```

### Other toast types

- Success: `toast.success('Item updated')`
- Loading: `const id = toast.loading('Saving…');` then `toast.success('Saved', { id })`
- Promise: `toast.promise(myPromise, { loading: '…', success: '…', error: '…' })`

### Defaults

- Position: `top-right`
- Duration: 4s (default), 5s (errors)

## i18n (Internationalization)

The app supports English (default) and Hebrew with full RTL support.

### Architecture

- **Library:** `i18next` + `react-i18next`
- **Config:** `src/i18n/index.ts` — initializes i18next with bundled resources
- **Translations:** `src/i18n/locales/en.json` and `src/i18n/locales/he.json`
- **Context:** `LanguageProvider` in `src/contexts/LanguageProvider.tsx` — manages language state, RTL direction, and localStorage persistence
- **Hook:** `useLanguage()` — returns `{ language, setLanguage }`
- **Storage:** `localStorage('chillist-lang')` via the `useLocalStorage` hook

### Adding a new translatable string

1. Add the key + English value to `src/i18n/locales/en.json`
2. Add the same key + Hebrew value to `src/i18n/locales/he.json`
3. In the component, use `const { t } = useTranslation()` and `t('your.key')`
4. For non-component code (e.g., callbacks), use `import i18n from '../i18n'` and `i18n.t('your.key')`

### RTL support

When Hebrew is active, `<html dir="rtl" lang="he">` is set automatically by the `LanguageProvider`. Use Tailwind logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`) instead of directional ones (`ml-*`, `mr-*`, `left-*`, `right-*`).

### Language toggle

A toggle button in the Header switches between languages. It shows "עב" when English is active (meaning "switch to Hebrew") and "EN" when Hebrew is active.

## Home Page Screenshots

The home page (`src/routes/index.lazy.tsx`) includes a "How it works" section with mobile app screenshots. These are captured automatically via Playwright.

### Files

| File | Description |
|------|-------------|
| `public/hero.jpg` | Static campfire photo (Unsplash, free license) — not auto-generated |
| `public/step-1.png` | Create Plan form (EN) |
| `public/step-2.png` | Items list, All tab (EN) |
| `public/step-3.png` | Buying List filter (EN) |
| `public/step-1-he.png` | Create Plan form (HE, RTL) |
| `public/step-2-he.png` | Items list, All tab (HE, RTL) |
| `public/step-3-he.png` | Buying List filter (HE, RTL) |

### Regenerating screenshots

Prerequisites: mock server (`npm run mock:server`) and dev server (`npm run dev`) must be running, with at least one plan with items in `api/mock-data.json`.

```bash
npm run screenshots
```

The script (`scripts/take-screenshots.ts`) uses an iPhone 13 viewport. The home page component picks the correct image set based on the active language via `useLanguage()`.

Re-run after: UI changes to forms/items, layout/styling changes, translation updates, or mock data changes.

## Common Items Data (`src/data/common-items.json`)

A static JSON file with 700+ pre-defined items (equipment and food) used for autocomplete suggestions when adding items to a plan. The autocomplete matches against item names, aliases, and tags.

### Schema

Each item has these fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Stable unique kebab-case identifier (e.g. `sleeping-bag`) |
| `name` | `string` | Canonical display name (e.g. `Sleeping Bag`) |
| `category` | `"equipment" \| "food"` | Item category |
| `subcategory` | `string` | Subcategory from taxonomy (see `src/data/subcategories.ts`). Use `"Other"` only when no taxonomy entry fits. |
| `unit` | `string` | Default unit (`pcs`, `pack`, `set`, `kg`, `g`, `lb`, `oz`, `l`, `ml`) |
| `aliases` | `string[]` | Alternative names users might type (plurals, regional variants, brand-as-generic) |
| `tags` | `string[]` | Intent-based search keywords (not naming variations) |

### Tag vocabulary

Equipment tags: `shelter`, `sleep`, `cooking`, `lighting`, `water`, `hygiene`, `first-aid`, `power`, `kids`, `baby`, `pets`, `car`, `clothing`, `games`, `beach`, `winter`, `tools`, `navigation`, `storage`

Food tags: `drink`, `snack`, `breakfast`, `fruit`, `vegetables`, `protein`, `pantry`, `condiments`, `frozen`, `kids`, `baby`, `pets`

### Subcategory (required)

Every item must have a `subcategory` assigned from the controlled vocabulary in `src/data/subcategories.ts`:

- **Equipment:** 21 subcategories (e.g. Venue Setup and Layout, First Aid and Safety, Kids and Baby Gear)
- **Food:** 30 subcategories (e.g. Fresh Vegetables, Meat and Poultry, Beverages (non-alcoholic))
- **Other:** Use only when no taxonomy entry fits; avoid when a more specific subcategory exists

**Confirm for each item that subcategory is assigned and fitting.** Run the enrichment script to bulk-assign, then review items in `"Other"` and refine manually or via script patterns.

```bash
npx tsx scripts/enrich-common-items-with-subcategory.ts
```

### How to add or update items

1. Edit `src/data/common-items.json` (EN) and `src/data/common-items.he.json` (HE) as needed
2. Follow these rules:
   - `id`: lowercase the name, replace spaces/punctuation with hyphens, remove leading/trailing hyphens. Must be unique.
   - `category`: only `equipment` or `food`. Non-food supplies (foil, paper plates, plastic cups, disposable cutlery, etc.) are `equipment`, not `food`.
   - `subcategory`: must exist in `src/data/subcategories.ts` (or `"Other"`). Must fit the item’s purpose; review and adjust as needed.
   - `aliases`: add plurals, common alternative words (Flashlight → Torch), regional variants (Chips → Crisps), brand-as-generic (Hydration Pack → Camelback). Keep short — no full sentences.
   - `tags`: use only the vocabulary above. Tags are for intent-based search, not naming variations. An item can have multiple tags or zero tags.
   - Deduplication: if two items are the same real thing, keep one as canonical and put the other name(s) in `aliases`. Do not have two entries for the same item.
3. Validate before committing:
   - All `id` values are unique
   - No empty strings in `aliases` or `tags`
   - No duplicate aliases within the same item
   - `category` is only `equipment` or `food`
   - `subcategory` is assigned and exists in taxonomy (run enrichment script or unit test)
   - `unit` is from the allowed list

### How the app uses it

`ItemForm.tsx` imports the JSON and builds:

- **Autocomplete suggestions** — canonical `name` values shown in the dropdown
- **Search index** — matches user input against `name`, `aliases`, and `tags` (e.g. typing "torch" surfaces "Flashlight", typing "shelter" surfaces "Tent")
- **Category/unit autofill** — selecting an item auto-fills the category and unit fields

## Tailwind CSS v4

No `tailwind.config.js` needed. Customize in `src/index.css`:

```css
@import 'tailwindcss';

@theme {
  --color-primary: #3b82f6;
  --color-secondary: #10b981;
  --font-family-display: 'Inter', sans-serif;
}
```

## Pre-Push Hooks (Husky)

Every push triggers:

1. `npm run typecheck` — fails on TypeScript errors
2. ESLint + Prettier on staged files (`lint-staged`)
3. `npm run test:unit` — unit tests in CI mode
4. `npm run test:integ` — integration tests (auth flows, cross-boundary checks)
5. `npx playwright test` — E2E tests (all 4 browsers, with `VITE_AUTH_MOCK=true`)

### Testing layers summary

| Layer | Browsers | Purpose |
|-------|----------|---------|
| Pre-push (Husky) | All 4 (Chrome, Firefox, Safari, Mobile Safari) | Thorough local validation before push |
| CI (`ci.yml`, on PR) | Chrome only | Required gate — blocks merge |
| Deploy (`deploy.yml`, on push to main) | None | Build + deploy only — trusts CI |

Ensure all browsers installed locally: `npx playwright install`.

## CI/CD (GitHub Actions → Cloudflare Pages)

Two separate workflow files:

### `ci.yml` — runs on PRs against `main`

Single job (Chrome only):

1. Install dependencies
2. Fetch OpenAPI spec from backend
3. Lint
4. Type check
5. Unit tests
6. Integration tests
7. Install Chromium + run E2E tests (Desktop Chrome only)

### `deploy.yml` — runs on push to `main`

Single job (build + deploy only — no tests, CI already validated on the PR):

1. Validate required environment variables
2. Install dependencies
3. Fetch OpenAPI spec from backend
4. Build (with production env vars)
5. Deploy to Cloudflare Pages

**Prerequisite:** Branch protection on `main` must require PR + passing CI checks before merge. This ensures no untested code reaches `main`.

### Testing all browsers / Safari (Linux-WebKit parity)

Before pushing, run all browsers: `npm run e2e`. For Linux-WebKit parity: `npm run e2e:docker`. Keep the Docker image tag in `package.json` in sync with `@playwright/test`.

### Required GitHub secrets/vars

| Name | Type | Description |
|------|------|-------------|
| `API_SPEC_TOKEN` | Secret | Fine-grained PAT with read access to `chillist-be` (used by `api:fetch` in CI to download OpenAPI spec from private repo) |
| `CLOUDFLARE_API_TOKEN` | Secret | Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Cloudflare account ID |
| `VITE_API_KEY` | Secret | Production API key |
| `VITE_API_URL` | Variable | Production backend URL |
| `CLOUDFLARE_PROJECT_NAME` | Variable | Cloudflare Pages project name |
| `VITE_SUPABASE_URL` | Variable | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Variable | Supabase publishable/anon key |
| `VITE_GOOGLE_MAPS_API_KEY` | Variable | Google Maps API key (optional) |