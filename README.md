# Chillist Docs

Central documentation repository for the Chillist project — a trip/event planning app with shared checklists.

## Repositories

| Repo | Description | Stack |
|------|-------------|-------|
| [chillist-fe](https://github.com/Alexgub84/chillist-fe) | Frontend app | React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Router, React Query |
| [chillist-be](https://github.com/Alexgub84/chillist-be) | Backend API | Node.js 20+, Fastify 5, TypeScript, Drizzle ORM, PostgreSQL, Zod |
| [chillist-docs](https://github.com/Alexgub84/chillist-docs) | This repo — docs, specs, rules | Markdown |

## Contents

### Specs

- [MVP Specification v1](specs/mvp-v1.md) — full product spec with current implementation status
- [User & Participant Management](specs/user-management.md) — auth, profiles, access control, PII filtering

### Rules (Cursor Workflow)

Workflow rules used by both repos for consistent development:

- [Common Rules](rules/common.md) — shared across FE and BE (git, planning, code standards, security)
- [Frontend Rules](rules/frontend.md) — FE-specific (TanStack Router, OpenAPI sync, clsx, mock server)
- [Backend Rules](rules/backend.md) — BE-specific (database, OpenAPI generation, env config)

### Guides

- [Frontend Guide](guides/frontend.md) — setup, development, mock server, testing, CI/CD
- [Backend Guide](guides/backend.md) — setup, deployment, Railway, database, security

### Dev Lessons

Logs of bugs fixed and problems solved — kept as a learning reference:

- [Frontend Lessons](dev-lessons/frontend.md)
- [Backend Lessons](dev-lessons/backend.md)

## How It Works

Both `chillist-fe` and `chillist-be` have a `.cursor/rules/workflow.mdc` that points here. When working in either repo, Cursor reads the rules, guides, and specs directly from `../chillist-docs/` — no copies are made. This keeps everything in sync.

1. **Starting a new feature?** Check the [MVP spec](specs/mvp-v1.md) for requirements and current status.
2. **Setting up a repo?** Follow the relevant [guide](guides/).
3. **Hit a bug?** Check [dev-lessons](dev-lessons/) — someone may have solved it before.
4. **Integrating FE and BE?** The OpenAPI spec in `chillist-be/docs/openapi.json` is the contract. Backend owns it, frontend fetches it via `npm run api:fetch`.
5. **Fixed a bug or learned something?** Update the relevant [dev-lessons](dev-lessons/) file and propose rule changes if needed.
