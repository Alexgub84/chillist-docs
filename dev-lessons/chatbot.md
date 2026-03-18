# Chatbot Dev Lessons

A log of bugs fixed and problems solved in `chillist-whatsapp-bot`.

_(Seeded with relevant lessons from `dev-lessons/backend.md`. Only add NEW lessons here.)_

---

<!-- Add new entries at the top -->

### [Infra] Railway skips redeploy when only env vars change — trigger manually

**Date:** 2026-03-18
**Problem:** Set `BOT_PHONE_NUMBER` via `railway variables set`. Railway created a new deployment record with status `SKIPPED` — the running container was not restarted, so the new env var was never picked up.
**Solution:** After setting env vars, force a redeploy via the Railway dashboard (Redeploy button) or `railway deployment redeploy`.
**Prevention:** `railway variables set` does not guarantee a redeploy. Always verify the deployment list with `railway deployment list` after changing env vars. If the latest entry is `SKIPPED`, redeploy manually.

---

### [Infra] Use `tsx scripts/migrate.ts` instead of raw `psql` for CI migrations

**Date:** 2026-03-18
**Problem:** GitHub Actions ran `psql "$DATABASE_URL_PUBLIC" -f migration.sql` and got `FATAL: database "railway" does not exist`. Raw `psql` does not handle Railway's proxy connection string (SSL negotiation, database name resolution) the same way Node.js does.
**Solution:** Replaced psql with a TypeScript migration script (`scripts/migrate.ts`) that uses the `postgres` npm package — the same library the app uses at runtime. No `postgresql-client` install needed.
**Prevention:** Follow the same pattern as `chillist-be` (`src/db/migrate.ts`). Always use the Node.js `postgres` package for migrations in CI — it uses the same connection handling as production and avoids psql SSL/proxy compatibility issues.

---

### [Integration] Green API `extendedTextMessageData` field names differ from assumptions

**Date:** 2026-03-18
**Problem:** Implemented @mention detection using `extendedTextMessageData.textMessage` and `mentionedJidList`. In production, Green API sends `text` (not `textMessage`) and `mentioned` (not `mentionedJidList`). Every @mention message failed to parse and was silently dropped.
**Solution:** Updated Zod schema and helper functions to use the correct field names: `text` and `mentioned`.
**Prevention:** Always verify Green API payload field names against real webhook deliveries before implementing logic that depends on them. Add a log of the raw payload at `DEBUG` level or inspect from a real test send before writing schema code.

### [Infra] Railway PORT: never hardcode a specific value — use 8080 or let Railway assign it

**Date:** 2026-03-17
**Problem:** `PORT=3333` was hardcoded on `chillist-be-prod` in Railway. Railway assigns its own dynamic PORT (8080) and routes public traffic to it. When PORT was overridden to 3333 the BE listened on 3333 but Railway routed to 8080 → 502 on the public URL.
**Solution:** Delete any hardcoded PORT that doesn't match what the app actually binds to. Railway injects `PORT=8080` by default for Node services. Set PORT explicitly only if needed for cross-service references (see lesson below).
**Prevention:** Never set PORT to an arbitrary value in Railway. Check the service logs (`Server listening at http://...:XXXX`) to confirm what port the app actually uses before hardcoding it.

---

### [Infra] Railway reference variable `${{service.PORT}}` only resolves if PORT is explicitly set on that service

**Date:** 2026-03-17
**Problem:** Tried to set `APP_BE_INTERNAL_URL=http://zealous-beauty.railway.internal:${{chillist-be-prod.PORT}}` on the chatbot. It resolved to empty (`http://zealous-beauty.railway.internal:`) because Railway's dynamically-injected PORT is not exposed as a reference variable unless PORT is explicitly defined in the service's env vars.
**Solution:** Explicitly set `PORT=8080` (or the actual port) on `chillist-be-prod` in Railway. After that `${{chillist-be-prod.PORT}}` resolves to `8080` and the internal URL works.
**Prevention:** For `${{service.VAR}}` reference variables to resolve, the variable must be user-defined (visible in Railway dashboard) — Railway's runtime-injected vars are not reference-able. Always verify with `railway variables --json` (shows resolved values) after setting.

---

### [Infra] `railway variables --json` shows resolved values; `railway variables set` needs single quotes for `${{...}}`

**Date:** 2026-03-17
**Problem:** Running `railway variables set APP_BE_INTERNAL_URL=http://...railway.internal:${{chillist-be-prod.PORT}}` without single quotes caused the shell to expand (or mangle) the `${{...}}` syntax before it reached Railway.
**Solution:** Always use single quotes: `railway variables set 'KEY=value with ${{ref}}'`. Verify immediately after with `railway variables --json | python3 -c "..."`.
**Prevention:** Single quotes in zsh prevent ALL expansion. Double quotes allow `$VAR` expansion. Always single-quote Railway variable values that contain reference syntax.

---

### [Infra] `railway up` deploys local working directory — including uncommitted changes

**Date:** 2026-03-17
**Problem:** Ran `railway up` to force a fresh build. It deployed the local working directory which contained uncommitted session-feature code that wasn't ready for production, causing `PostgresError: relation "chatbot_sessions" does not exist`.
**Solution:** Railway rolled back (via a subsequent `railway up` from the correct state). The session code is safe because `railway up` re-ran after the issue was identified.
**Prevention:** Only run `railway up` from a clean git state on the intended branch. Prefer `railway redeploy --yes` to reuse the last production image when only env vars changed.

---

### [Infra] Railway internal networking requires HOST=0.0.0.0 and correct PORT on every service

**Date:** 2026-03-17
**Problem:** The chatbot was deployed on Railway and receiving real WhatsApp webhooks, but every `identify` call to the BE failed with `ECONNREFUSED`. The `APP_BE_INTERNAL_URL` was set to `http://zealous-beauty.railway.internal:3333` — the hostname resolved correctly (no more `ENOTFOUND`) but the connection was refused.
**Cause:** The BE service was binding to `127.0.0.1` (localhost) inside its container. Railway's private networking routes traffic from other containers, which arrives as an external connection. A service bound to `127.0.0.1` refuses all connections from outside its own container.
**Solution:** Set `HOST=0.0.0.0` in the BE's Railway environment variables so it accepts connections on all interfaces, including Railway's private network. Also confirm `PORT` matches the port in the internal URL exactly.
**Prevention:** Any Railway service that must be reachable by another service via `*.railway.internal` must have `HOST=0.0.0.0` set explicitly. Never rely on a default host binding. Add this to the Railway deploy checklist for every new service.

### [Arch] Fake external services must never be a runtime default — applies to all 3 providers

**Date:** 2026-03-16 (ported from backend lesson 2026-03-13)
**Problem:** In the app backend, `WHATSAPP_PROVIDER` defaulted to `'fake'` with no production guard. The factory had a `fake` fallback, and the plugin silently fell back to a noop service. On Railway without the correct env var, the app ran with a fake that returned `{ success: true }` for every call — masking total failure.
**Applies to chatbot:** The chatbot has three external services that need the same discipline: (1) Green API (WhatsApp messaging), (2) AI provider (Anthropic/OpenAI), (3) Upstash Redis (session storage). Each must follow the pattern below.
**Prevention:** For every external service: (a) never make a fake provider the default in env — block it in production via `.refine()`, (b) never let the factory create the fake — only inject via `buildApp` options in tests, (c) if the real service fails to initialize, crash — no silent fallback, (d) add an E2E prod test (`describe.skipIf(!CREDS)`) that validates the real service before deploy. See `.windsurf/workflows/new-external-service.md` for the full checklist.

### [Arch] Decouple business logic from route handlers into services

**Date:** 2026-03-16 (ported from backend lesson 2026-03-02)
**Problem:** In the app backend, business logic was embedded directly in route handlers. When the same logic was needed in multiple routes, there was no reusable function — only copy-paste.
**Applies to chatbot:** The chatbot's webhook route handler should only handle HTTP concerns (parsing the Green API payload, responding 200). Business logic — session lookup, phone-to-user resolution, AI orchestration, response sending — belongs in dedicated services (e.g., `SessionService`, `AiOrchestrator`, `GreenApiClient`).
**Prevention:** Route handlers handle HTTP concerns (parse request, validate, return status code). Services handle business logic (session management, AI calls, WhatsApp messaging). This keeps each layer testable in isolation and avoids duplication when adding group chat support (v1.5).

### [Category] Short Title

**Date:** YYYY-MM-DD
**Problem:** One sentence describing what went wrong
**Solution:** One sentence describing the fix
**Prevention:** How to avoid this in the future
