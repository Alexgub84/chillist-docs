# Backend Guide

Setup, development, deployment, and security guide for `chillist-be`.

---

## Tech Stack

- Node.js 20+
- Fastify 5 (TypeScript, ESM)
- Zod (validation via fastify-type-provider-zod)
- Drizzle ORM (PostgreSQL)
- PostgreSQL (Railway-managed in production)
- Vitest (unit + integration + E2E)
- Testcontainers (PostgreSQL in tests)
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
| `API_KEY` | API key for request auth | (empty for dev) |

### Database setup

```bash
npm run db:migrate    # run Drizzle migrations
npm run db:seed       # seed with sample data (optional)
```

## Running Locally

```bash
npm run dev           # starts Fastify with tsx watch
```

The server runs on `http://localhost:3333` by default. Swagger UI at `/docs`.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with watch |
| `npm run start` | Start production server |
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Type check only |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier format |
| `npm run test` | Typecheck + lint + run tests (watch) |
| `npm run test:run` | Typecheck + lint + run tests once |
| `npm run test:unit` | Unit tests only |
| `npm run test:integration` | Integration tests only (requires Docker) |
| `npm run test:e2e` | E2E tests only (requires Docker) |
| `npm run test:coverage` | Tests with coverage |
| `npm run db:generate` | Generate Drizzle migration files |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:push` | Push schema directly (dev only) |
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
feature/* → PR → staging branch → Railway staging
staging → PR → main branch → Railway production
```

### Branch strategy

| Branch | Purpose | Protection |
|--------|---------|------------|
| `feature/*` | Development work | None |
| `staging` | Pre-production | PR required, CI must pass |
| `main` | Production | PR required, CI must pass |

### Railway services

**Staging:**

```
PORT=3333
HOST=0.0.0.0
NODE_ENV=staging
LOG_LEVEL=debug
```

**Production:**

```
PORT=3333
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info
FRONTEND_URL=<your-frontend-url>
API_KEY=<generated-key>
```

### CI/CD (GitHub Actions)

On push to `main` or `staging`:

1. Lint
2. Type check
3. Run tests
4. Build
5. Deploy to Railway (staging or production based on branch)

### Required GitHub secrets

| Name | Type | Description |
|------|------|-------------|
| `RAILWAY_TOKEN` | Secret | Railway API token |

## Security

### Current (MVP)

- **CORS:** `@fastify/cors` restricts origins to `FRONTEND_URL` in production. Explicitly allows GET, HEAD, POST, PATCH, DELETE, OPTIONS.
- **API Key:** `onRequest` hook checks `x-api-key` header on all routes except `/health` and `OPTIONS` preflight.
- **Limitations:** API key visible in browser DevTools. Protects against bots, not determined attackers. No user-level permissions.

### Future: Proper Authentication

**Option A: Supabase Auth (Recommended)**
- Supabase handles user signup/login
- Backend verifies Supabase JWT tokens
- Row-level security in database

**Option B: Custom JWT Auth**
- Implement signup/login endpoints
- Issue and verify JWT tokens
- Add user ownership to plans

**Upgrade when:**
- Storing personal user data
- Handling payments
- Public launch with real users

## Cost Estimate

| Service | Free Tier |
|---------|-----------|
| GitHub Actions | 2,000 minutes/month |
| Railway | $5/month credits |
| **Total MVP** | $0–5/month |
