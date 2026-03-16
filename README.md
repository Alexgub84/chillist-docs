# Chillist Docs

Central documentation repository for the Chillist project — a trip/event planning app with shared checklists.

## Repositories

| Repo                                                                        | Description                    | Stack                                                                     |
| --------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| [chillist-fe](https://github.com/Alexgub84/chillist-fe)                     | Frontend app                   | React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Router, React Query |
| [chillist-be](https://github.com/Alexgub84/chillist-be)                     | Backend API                    | Node.js 20+, Fastify 5, TypeScript, Drizzle ORM, PostgreSQL, Zod          |
| [chillist-whatsapp-bot](https://github.com/Alexgub84/chillist-whatsapp-bot) | WhatsApp AI Chatbot            | Node.js 20+, Fastify 5, TypeScript, Vercel AI SDK, Upstash Redis          |
| [chillist-docs](https://github.com/Alexgub84/chillist-docs)                 | This repo — docs, specs, rules | Markdown                                                                  |

---

## Per-Service File Index

Each service reads docs from `../chillist-docs/` before every task. Here's what each service needs:

### Backend (chillist-be)

| Purpose              | File                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| Workflow rules       | [rules/common.md](rules/common.md), [rules/backend.md](rules/backend.md) |
| Setup & deployment   | [guides/backend.md](guides/backend.md)                                   |
| Product spec         | [specs/mvp-v1.md](specs/mvp-v1.md)                                       |
| Past bugs            | [dev-lessons/backend.md](dev-lessons/backend.md)                         |
| WhatsApp integration | [specs/whatsapp.md](specs/whatsapp.md)                                   |

### Frontend (chillist-fe)

| Purpose            | File                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| Workflow rules     | [rules/common.md](rules/common.md), [rules/frontend.md](rules/frontend.md) |
| Setup & deployment | [guides/frontend.md](guides/frontend.md)                                   |
| Product spec       | [specs/mvp-v1.md](specs/mvp-v1.md)                                         |
| Past bugs          | [dev-lessons/frontend.md](dev-lessons/frontend.md)                         |

### Chatbot (chillist-whatsapp-bot)

| Purpose            | File                                                             |
| ------------------ | ---------------------------------------------------------------- |
| Workflow rules     | [rules/common.md](rules/common.md)                               |
| Setup & deployment | [guides/chatbot.md](guides/chatbot.md)                           |
| Architecture spec  | [specs/whatsapp-chatbot-spec.md](specs/whatsapp-chatbot-spec.md) |
| Past bugs          | [dev-lessons/chatbot.md](dev-lessons/chatbot.md)                 |

---

## Folder Structure

```
chillist-docs/
├── current/          Live state — what's working now, what's left for MVP
├── dev-lessons/      Per-service logs of bugs fixed and lessons learned
├── guides/           Per-service setup, development, and deployment guides
├── rules/            Per-service workflow rules (+ common shared rules)
├── specs/            Design docs — product specs, architecture, feature plans
├── backlog.md        Upcoming work as issue candidates
└── README.md         This file
```

### current/ — Live State

- [Status](current/status.md) — what's working right now (auto-updated on each deploy)
- [MVP Target](current/mvp-target.md) — what's left to declare MVP ready

### specs/ — Design & Architecture

- [MVP Specification v1](specs/mvp-v1.md) — full product spec with implementation details
- [User & Participant Management](specs/user-management.md) — auth, profiles, access control
- [WhatsApp Integration](specs/whatsapp.md) — notifications, list sharing, Green API
- [WhatsApp Chatbot](specs/whatsapp-chatbot-spec.md) — AI chatbot architecture

### rules/ — Workflow Rules

- [Common](rules/common.md) — shared across all services (git, planning, code standards, security)
- [Backend](rules/backend.md) — BE-specific (database, OpenAPI, env config)
- [Frontend](rules/frontend.md) — FE-specific (TanStack Router, OpenAPI sync, mock server)

### guides/ — Setup & Development

- [Backend](guides/backend.md) — setup, deployment, Railway, database
- [Frontend](guides/frontend.md) — setup, development, mock server, testing, CI/CD
- [Chatbot](guides/chatbot.md) — setup, deployment, environment variables
- [Issue Management](guides/issue-management.md) — how to create and manage GitHub issues
- [Monday](guides/monday.md) — Monday.com integration

### dev-lessons/ — Bug Logs

- [Backend](dev-lessons/backend.md)
- [Frontend](dev-lessons/frontend.md)
- [Chatbot](dev-lessons/chatbot.md)

---

## Quick Links

1. **Starting a new feature?** Check [MVP Target](current/mvp-target.md) for what's left, and [Status](current/status.md) for what's working.
2. **Setting up a repo?** Follow the relevant [guide](guides/).
3. **Hit a bug?** Check [dev-lessons](dev-lessons/) — someone may have solved it before.
4. **Integrating FE and BE?** The OpenAPI spec in `chillist-be/docs/openapi.json` is the contract.
5. **Fixed a bug or learned something?** Update the relevant [dev-lessons](dev-lessons/) file.
