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

### API

- [OpenAPI Specification](api/openapi.json) — current backend API contract (source of truth lives in `chillist-be`)

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

## How to Use These Docs

1. **Starting a new feature?** Check the [MVP spec](specs/mvp-v1.md) for requirements and current status.
2. **Setting up a repo?** Follow the relevant [guide](guides/).
3. **Working in Cursor?** Copy the appropriate [rules](rules/) into your repo's `.cursor/rules/` directory.
4. **Hit a bug?** Check [dev-lessons](dev-lessons/) — someone may have solved it before.
5. **Integrating FE ↔ BE?** The [OpenAPI spec](api/openapi.json) is the contract. Backend owns it, frontend consumes it.
