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
- Vitest + React Testing Library (unit)
- Playwright (E2E)
- ESLint + Prettier
- Husky (pre-commit hooks)

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

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server (fetches OpenAPI spec first) |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run test` | Run unit tests (watch mode) |
| `npm run test:run` | Run unit tests once (CI mode) |
| `npm run mock:server` | Start mock API server with watch |
| `npm run mock:server:ci` | Start mock API server without watch (CI) |
| `npm run api:fetch` | Fetch OpenAPI spec from backend repo |
| `npm run api:types` | Generate TypeScript types from OpenAPI spec |
| `npm run api:sync` | Fetch spec + regenerate types |
| `npm run e2e` | Run Playwright E2E tests |
| `npm run e2e:ui` | Run E2E tests with Playwright UI |
| `npm run e2e:headed` | Run E2E tests in headed browser mode |
| `npm run routes` | Regenerate TanStack Router route tree |

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

### Sign-up / Sign-in

- Email + password: `supabase.auth.signUp({ email, password })` / `supabase.auth.signInWithPassword({ email, password })`
- Google OAuth: `supabase.auth.signInWithOAuth({ provider: 'google' })`
- Sign out: `supabase.auth.signOut()`

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

## Pre-Commit Hooks (Husky)

Every commit triggers:

1. `npm run typecheck` — fails on TypeScript errors
2. ESLint + Prettier on staged files (`lint-staged`)
3. `npm run test:run` — unit tests in CI mode

### Recommended manual checks before commit

```bash
npm run typecheck
npm run lint:fix
npm run test:run
```

## CI/CD (GitHub Actions → Cloudflare Pages)

On push to `main` or PR against `main`:

1. Install dependencies
2. Fetch OpenAPI spec from backend
3. Lint
4. Type check
5. Unit tests
6. Install Playwright + run E2E tests (against mock server)
7. Build (with production `VITE_API_URL` and `VITE_API_KEY`)
8. Deploy to Cloudflare Pages

### Required GitHub secrets/vars

| Name | Type | Description |
|------|------|-------------|
| `CLOUDFLARE_API_TOKEN` | Secret | Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Cloudflare account ID |
| `VITE_API_KEY` | Secret | Production API key |
| `VITE_API_URL` | Variable | Production backend URL |
| `CLOUDFLARE_PROJECT_NAME` | Variable | Cloudflare Pages project name |
| `VITE_SUPABASE_URL` | Variable | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Variable | Supabase publishable/anon key |
