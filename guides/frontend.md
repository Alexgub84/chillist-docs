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
- openapi-fetch (typed API client from OpenAPI spec)
- react-hot-toast (notifications)
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
| `npm run mock:watch` | Watch mock data files for validation |
| `npm run api:fetch` | Fetch OpenAPI spec from backend repo |
| `npm run api:types` | Generate TypeScript types from OpenAPI spec |
| `npm run api:sync` | Fetch spec + regenerate types |
| `npm run e2e` | Run Playwright E2E tests |
| `npm run e2e:ui` | Run E2E tests with Playwright UI |
| `npm run routes` | Regenerate TanStack Router route tree |

## Mock Data Toolkit

The mock server (`api/server.ts`) exposes a Fastify server backed by `api/mock-data.json`. All write operations persist to the JSON file so you iterate with realistic data.

Available mock routes mirror the real backend (see [API spec](../api/openapi.json)).

## API Type Generation (OpenAPI)

The backend owns the OpenAPI spec. The frontend fetches and generates types from it.

```bash
npm run api:sync          # fetch + generate (recommended)
npm run api:fetch         # fetch spec only
npm run api:types         # generate types only (when spec is already local)
```

Regenerate types whenever the backend API changes.

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
