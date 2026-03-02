# Backend Guide

Setup, development, deployment, and security guide for `chillist-be`.

---

## Tech Stack

- Node.js 20+
- Fastify 5 (TypeScript, ESM)
- Zod (validation via fastify-type-provider-zod)
- Drizzle ORM (PostgreSQL)
- PostgreSQL (Railway-managed in production)
- Swagger UI (`@fastify/swagger` + `@fastify/swagger-ui` — API docs at `/docs` in dev)
- Vitest (unit + integration + E2E)
- Testcontainers (PostgreSQL in tests)
- Pino (logging, with pino-pretty for dev)
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
| `PORT` | Server port | `3333` |
| `HOST` | Server host | `0.0.0.0` |
| `NODE_ENV` | Environment | `development` |
| `LOG_LEVEL` | Pino log level | `info` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/chillist` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:5173` |
| `SUPABASE_URL` | Supabase project URL for JWKS-based JWT verification | (optional in dev, required in prod) |

### Database setup

```bash
npm run db:migrate    # run Drizzle migrations
npm run db:seed       # seed with sample data (optional)
```

## Running Locally

### Quick start (one command)

Prerequisites: Docker running, Node 20+.

```bash
npm run dev:local
```

This single command:
1. Starts a local PostgreSQL container (`docker compose up -d`)
2. Runs Drizzle migrations
3. Seeds the database with sample plans, participants, and items
4. Starts the dev server with hot reload

The backend runs at `http://localhost:3333`. Swagger UI at `/docs`.

### Environment files

| File | Purpose | Git-tracked |
|------|---------|-------------|
| `.env` | Production / Railway config | No (`.gitignore`) |
| `.env.local` | Local development config | No (`.gitignore`) |
| `.env.example` | Template with all variable names | Yes |

`npm run dev:local` loads `.env.local` automatically. If you run `npm run dev` directly, it uses whatever is in your shell environment or `.env` (depending on your setup).

### Local development with Supabase auth

The FE authenticates users via Supabase and sends JWTs to the backend. For the BE to verify those tokens locally, `SUPABASE_URL` must be set in `.env.local`:

```
SUPABASE_URL=https://<your-project>.supabase.co
```

Without it, the auth plugin is disabled and all JWT-bearing requests return 401.

**Full `.env.local` for local dev with auth:**

```
PORT=3333
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=info
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chillist
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=https://<your-project>.supabase.co
```

**How it works:**
- FE runs at `http://localhost:5173` and handles Supabase sign-up/sign-in directly
- FE sends `Authorization: Bearer <jwt>` to the local backend
- BE fetches JWKS public keys from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` and verifies the JWT
- `FRONTEND_URL=http://localhost:5173` allows CORS from the local FE

**Resetting the local database:**

```bash
docker compose down -v        # remove container + data volume
npm run dev:local             # recreate everything from scratch
```

### Without Supabase auth

If you only need to test unauthenticated flows (guest/invite routes), you can omit `SUPABASE_URL` from `.env.local`. The server will start with a warning:

```
WARN: SUPABASE_URL not configured — JWT verification disabled
```

All routes that require JWT will return 401. Guest invite routes (`/plans/:planId/invite/:inviteToken/*`) work without JWT.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with watch |
| `npm run dev:local` | Docker DB + migrate + seed + dev server (loads `.env.local`) |
| `npm run start` | Start production server |
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Type check only |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier format |
| `npm run format:check` | Check Prettier formatting (CI) |
| `npm run test` | Typecheck + lint + run tests (watch) |
| `npm run test:run` | Typecheck + lint + run tests once |
| `npm run test:unit` | Unit tests only |
| `npm run test:integration` | Integration tests only (requires Docker) |
| `npm run test:e2e` | E2E tests only (requires Docker) |
| `npm run db:generate` | Generate Drizzle migration files |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:seed` | Seed database with sample data |
| `npm run db:seed:prod` | Seed production database via Railway |
| `npm run db:migrate:prod` | Run migrations on production via Railway |
| `npm run openapi:generate` | Generate `docs/openapi.json` from route schemas |
| `npm run openapi:validate` | Validate OpenAPI spec |

## Database (Drizzle + PostgreSQL)

### Schema

Defined in `src/db/schema.ts` using Drizzle ORM.

### Migrations

```bash
npm run db:generate   # create migration from schema changes
npm run db:migrate    # apply pending migrations
```

Migration files live in `drizzle/` directory.

### Production database

Railway manages PostgreSQL. Use Railway CLI for production operations:

```bash
npm run db:migrate:prod   # migrate production DB
npm run db:seed:prod      # seed production DB
```

## OpenAPI Spec Generation

The backend is the source of truth for the API contract. Schemas are defined with Zod and registered via `$ref` in Fastify routes.

```bash
npm run openapi:generate    # outputs docs/openapi.json
npm run openapi:validate    # validates the generated spec
```

Always commit `docs/openapi.json` after route or schema changes. The frontend fetches this file to generate types.

## Deployment (Railway)

### Architecture

```
feature/* → PR → main (CI must pass) → Railway production
```

### Branch strategy

| Branch | Purpose | Protection |
|--------|---------|------------|
| `feature/*` | Development work | None |
| `staging` | Pre-production testing | PR required, CI must pass |
| `main` | Production | PR required, CI must pass |

### Railway env vars (production)

```
PORT=3333
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info
DATABASE_URL=<railway-postgres-url>
FRONTEND_URL=<your-frontend-url>
SUPABASE_URL=<your-supabase-project-url>
```

### CI/CD (GitHub Actions)

Three workflow files:

**`ci.yml`** — runs on push/PR to `main` and `staging`:

1. Start PostgreSQL 16 service
2. Install dependencies
3. Run database migrations (`db:migrate`)
4. Run full test suite (`test:run` — includes typecheck + lint + vitest)
5. Build (`tsc`)
6. Validate OpenAPI spec (`openapi:validate`)
7. On PRs: check if `docs/openapi.json` changed — if yes, require `fe-notified` label before merge

**`deploy.yml`** — runs on push to `main` only:

1. Install Railway CLI
2. Deploy to Railway (`railway up --service $RAILWAY_SERVICE_ID`)

**`branch-protection.yml`** — runs on PRs to `main` and `staging`:

- Validates branch merge rules (informational)

### Required GitHub secrets

| Name | Type | Description |
|------|------|-------------|
| `RAILWAY_TOKEN` | Secret | Railway API token |
| `RAILWAY_SERVICE_ID` | Secret | Railway service identifier |

## Git Hooks (Husky)

### Pre-commit (fast — runs on every commit)

1. ESLint + Prettier on staged `.ts` files (`lint-staged`)

### Pre-push (full validation — runs before pushing)

1. `npm run typecheck` — fails on TypeScript errors
2. `npm run lint` — full ESLint check
3. `npm run openapi:generate` — regenerates the OpenAPI spec
4. Checks if `docs/openapi.json` changed — if so, blocks push until you commit it
5. `npm run openapi:validate` — verifies the spec is valid
6. `npm run test:run` — typecheck + lint + tests in CI mode

### Recommended manual checks before push

```bash
npm run typecheck
npm run lint:fix
npm run openapi:generate
npm run test:run
```

## Security

### CORS

`@fastify/cors` restricts origins to `FRONTEND_URL` in production. Explicitly allows GET, HEAD, POST, PATCH, DELETE, OPTIONS.

### Supabase JWT Auth

- **Architecture:** FE signs up/in directly with Supabase. BE only verifies JWTs — no Supabase client on the BE.
- **JWKS verification:** `jose` library fetches public keys from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` (asymmetric ES256 keys). No secrets stored on the BE.
- **`request.user`:** Decorated on every request when a valid `Authorization: Bearer <jwt>` header is present. Contains `{ id, email, role }` from JWT claims.
- **PII separation:** Supabase is the single store for registered user PII (name, email, phone). Railway DB stores only Supabase UUIDs as references — no user PII. `user_details` table holds app-specific preferences (food prefs, equipment). `guest_profiles` table holds temporary PII for unregistered participants.
- **Protected routes:** All plans, items, and participants routes require JWT (return 401 without valid token). Auth routes (`GET /auth/me`, `GET /auth/profile`, `PATCH /auth/profile`) also require JWT. Invite routes use token-based auth (no JWT needed). `/health` is public.
- **Rate limiting:** `@fastify/rate-limit` active — 100 req/min global, 10 req/min on `/auth/*` endpoints.
- **Security headers:** `@fastify/helmet` active — standard HTTP security headers (CSP disabled in dev for Swagger UI).
- **Auth plugin DI:** Tests inject a fake JWKS via `BuildAppOptions.auth` — no real Supabase calls in integration tests.
- **Admin role:** Users with `app_metadata.role === 'admin'` in the JWT bypass all plan access checks. They can view/edit/delete any plan and see all plans in `GET /plans`. To assign admin to a user in Supabase:
  - **Dashboard:** Authentication > Users > Edit user > App Metadata: `{"role": "admin"}`
  - **SQL:** `UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb WHERE email = 'your-admin@email.com';`
  - The user's next JWT (on login/refresh) will include `app_metadata: { role: "admin" }`.

### What's next (user management — #73)

Done:
- ~~Opportunistic user tracking~~ (records `createdByUserId` and owner `userId` when JWT present)
- ~~Profile endpoints~~ (`GET/PATCH /auth/profile` for user preferences)
- ~~Rate limiting~~ (`@fastify/rate-limit`) and ~~security headers~~ (`@fastify/helmet`)
- ~~Plan ownership + access control~~ (JWT-created plans default to `invite_only`, all read routes enforce visibility via `checkPlanAccess()`, `GET /plans` filtered by user's plans + public, 29 tests, PR #84, v1.8.0)

Done (continued):
- ~~Guest auth plugin~~ (Phase 3 Step 1, v1.11.0) — `X-Invite-Token` header auth, `rsvpStatus` + `lastActivityAt` columns, guest permission boundaries, 51 tests
- ~~Claim-via-invite~~ (Phase 3 Step 3, v1.12.0) — `POST /plans/:planId/claim/:inviteToken` links authenticated user to participant record, pre-fills preferences from `user_details` defaults, nullifies invite token on claim (link stops working after claim), 13 tests
- ~~Invite preferences~~ (v1.13.0) — `PATCH /plans/:planId/invite/:inviteToken/preferences` lets guests update per-plan preferences (displayName, group size, dietary info) via invite link, 8 tests
- ~~Guest invite flow extensions~~ (v1.14.0) — GET invite returns `myParticipantId`, `myRsvpStatus`, `myPreferences`; PATCH preferences accepts `rsvpStatus`; guest item CRUD via `POST/PATCH /plans/:planId/invite/:inviteToken/items[/:itemId]`, 26 new tests (issue #98)
- ~~JWT enforcement on all routes + API key removal~~ (v1.14.1) — `onRequest` JWT hooks on plans, items, and participants routes. API key removed entirely from env, config, and app hooks. Invite routes remain token-based. 354 tests passing.

Done (continued):
- ~~JWT-based per-plan preferences~~ (v1.16.0, issue #101) — `PATCH /participants/:participantId` accepts `rsvpStatus`, authorization enforced (owner/admin → any participant, linked participant → own record only, others → 403), 9 new tests
- ~~Join request management~~ (v1.17.0, issue #110) — `PATCH /plans/:planId/join-requests/:requestId` owner/admin endpoint. Body `{ status: 'approved' }` creates participant via `addParticipantToPlan()` service (pre-fills from `user_details`), `{ status: 'rejected' }` updates status only. Participant service extracted to `src/services/participant.service.ts` for future extensibility. 21 tests.

Future:
- Invite route reduction (Phase 3 Step 4, BREAKING)
- Response filtering enhancements (Phase 6)
- Edit permissions for linked participants (Phase 7)

## Cost Estimate

| Service | Free Tier |
|---------|-----------|
| GitHub Actions | 2,000 minutes/month |
| Railway | $5/month credits |
| **Total MVP** | $0–5/month |
