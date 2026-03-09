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

- [MVP Target](specs/mvp-target.md) — what's needed to declare MVP ready (WhatsApp, analytics, logging, alerts)
- [Current Status](specs/current-status.md) — what's working right now (auto-updated on each BE/FE deploy)
- [MVP Specification v1](specs/mvp-v1.md) — full product spec with implementation details
- [User & Participant Management](specs/user-management.md) — auth, profiles, access control, PII filtering
- [Backlog](backlog.md) — upcoming work as issue candidates

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

1. **Starting a new feature?** Check the [MVP Target](specs/mvp-target.md) for what's left, and the [Current Status](specs/current-status.md) for what's working. Full details in the [MVP spec](specs/mvp-v1.md).
2. **Setting up a repo?** Follow the relevant [guide](guides/).
3. **Hit a bug?** Check [dev-lessons](dev-lessons/) — someone may have solved it before.
4. **Integrating FE and BE?** The OpenAPI spec in `chillist-be/docs/openapi.json` is the contract. Backend owns it, frontend fetches it via `npm run api:fetch`.
5. **Fixed a bug or learned something?** Update the relevant [dev-lessons](dev-lessons/) file and propose rule changes if needed.
