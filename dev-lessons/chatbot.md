# Chatbot Dev Lessons

A log of bugs fixed and problems solved in `chillist-whatsapp-bot`.

_(Seeded with relevant lessons from `dev-lessons/backend.md`. Only add NEW lessons here.)_

---

<!-- Add new entries at the top -->

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
