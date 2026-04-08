# Chatbot Rules

Strict rules for `chillist-whatsapp-bot`. Use alongside [common rules](common.md).

---

## 1) Start Order (Required)

1. Read `chillist-docs/rules/chatbot.md` (this file)
2. Read `chillist-docs/dev-lessons/chatbot.md` — bugs fixed AND wins recorded
3. Read `chillist-docs/guides/chatbot.md` — current architecture, project structure, phase status
4. Identify the target files using the handler/service/plugin structure in the guide
5. Open only those files before coding

---

## 2) Architecture Non-Negotiables

- **Routes handle HTTP only.** Parse + validate request body (Zod), filter irrelevant events, call the handler, return 200. Nothing else.
- **Handlers handle business logic only.** Pure async functions — no Fastify, no `request`, no `reply`. Receive parsed data + explicit `deps` object.
- **Services are factory functions, never classes.** `createXxxClient()` → returns an interface. No `new`.
- **`process.env` is read in exactly one place:** `src/config.ts` via `parseConfig()`. Never import `process.env` in handlers, services, or plugins.
- **DI via `buildApp()` options.** Tests inject fakes via `buildApp({ greenApiClient, sessionStore, ... })`. Plugins never create fakes — only the real implementation.
- **Fake providers are blocked in production.** Every external service must have a Zod `.refine()` that rejects `fake` when `NODE_ENV=production`.

---

## 3) External Service Pattern (MANDATORY for every new provider)

Every external service (AI provider, Green API, internal API, session store) must follow this structure without exception:

```
src/services/<name>/
  types.ts                   — interface + input/output types only
  <name>.client.ts           — real HTTP implementation (createXxxClient)
  fake-<name>.client.ts      — in-memory fake for tests (createFakeXxxClient)
  noop-<name>.client.ts      — silent no-op for dev mode (createNoopXxxClient)  ← only if needed
```

Rules:
1. Real client throws on unexpected HTTP errors; returns typed result on expected failures (e.g. `null` for 404)
2. Fake client must expose inspection helpers (e.g. `getSentMessages()`, `setPlans()`, `seed()`)
3. Noop client is for local dev only — always blocked in production by Zod env guard
4. New E2E prod test (`describe.skipIf(!CREDS)`) validates the real service before deploy

---

## 4) AI Layer Rules

When implementing Phase 4 (AI SDK):

- **System prompt lives in one file** — `src/conversation/system-prompt.ts`. Never inline it in the handler.
- **`buildSystemPrompt` takes `(displayName, lang, feBaseUrl)`** — all three are required. `feBaseUrl` is used in error/empty-state messages so users always get a tappable link. If you add new user-facing references to the app, use `feBaseUrl`, never hardcode a URL.
- **Brand name is localised** — use `lang === "he" ? "צ'יליסט" : "Chillist"` for any user-visible app name in the prompt. Never write "Chillist" as a hardcoded string in the Hebrew path.
- **Tool definitions are typed with Zod** — use the Vercel AI SDK `tool()` helper with a Zod schema for every parameter. Never pass untyped objects.
- **Tool implementations call internal API only** — AI tools must not call Green API or touch sessions. They return data; the handler decides what to send.
- **Context window is bounded** — pass at most the last N messages from conversation history. Never dump the entire history. Start with N=10 and adjust based on token usage.
- **Fake AI client must be deterministic** — `createFakeAiClient()` takes a pre-configured response map (tool name → result). Tests must not depend on real LLM responses.
- **Never trust AI tool arguments blindly** — validate tool call arguments at the handler layer with Zod before passing to services.
- **One `IAiClient` method per concern** — e.g. `chat(messages, tools)` → `AiResponse`. Do not add helper logic to the interface.

### Prompt Rules (always keep in system-prompt.ts)

- **Numbered list + digit reply** — whenever the prompt instructs the bot to present a numbered list, it must also say: "When the user replies with just a number, treat it as selecting that option from the most recent list." WhatsApp users never type full answers on mobile.
- **Bulk item actions** — the prompt must explicitly say to call `updateItemStatus` once per item when the user names multiple items in one message. Without this rule the bot only acts on the first item.
- **`getMyPlans` called at most once per turn** — the prompt and every relevant tool description must say "only call `getMyPlans` if the plan list is not already in context." Re-fetching wastes tokens and causes higher latency.
- **`updateItemStatus` requires same-turn `getPlanDetails`** — item ids from prior turns are unreliable. The prompt and `updateItemStatus` tool description must both require calling `getPlanDetails` first in the same response, using the plan id already in context (not re-fetching `getMyPlans`).
- **Never mention data discrepancies** — `getMyPlans` returns plan-wide item totals; `getPlanDetails` returns only the requesting user's items. The bot must never comment on this difference or suggest a sync issue.
- **Use positive-reframe phrasing for tool-call frequency constraints** — "Reuse the plan IDs from the getMyPlans result already in this conversation" outperforms "do not call getMyPlans again". Lead with what the model should DO, not what it must avoid.
- **Dual placement is required** — any important tool-call constraint must appear in BOTH the system prompt (under `## Tool usage rules`) AND the tool description. One without the other misses either the instruction-following phase or the tool-selection reasoning phase.
- **For critical constraints, add architectural enforcement** — use `prepareStep` in `engine.ts` to remove the tool from `activeTools` after first use, AND add an execute guard inside the tool's `execute` function. Never rely on prompt alone for hard constraints.
- **Never use cost/token framing** — "calling this wastes tokens" has no empirical support and may degrade compliance by adding semantic noise. Use logical + positive-reframe constraints only.
- **Quality test assertions must include negative guards** — every multi-turn scenario in `prompt-quality.test.ts` must have `expect(t2.toolCalls).not.toContain("getMyPlans")` (or equivalent) where plans were already fetched. Happy-path outcome assertions alone are not sufficient.
- **Add a `// Regression: [Bug title] — YYYY-MM-DD` comment** to every `it()` block that was added to prevent a known bug from regressing. This makes the test suite self-documenting.

---

## 5) Session Rules

- **Session key is always `(phone_number, chat_id)`** — never scope by phone alone. Each WhatsApp context (DM or group) is independent.
- **TTL is idle-based, not absolute** — `touchSession()` resets the clock on every message. `SESSION_IDLE_TTL_MINUTES` controls inactivity timeout, not session age.
- **Delete session after terminal flow steps** — after sending the plans list (yes-path), call `deleteSession()` so the next message starts fresh.
- **`ISessionStore` is the only session interface** — handlers never query the DB directly. All session logic goes through the store.

---

## 6) Green API Rules

- **Always use text fallback for @mention detection** — `mentioned` array is only populated when user picks from autocomplete UI. Always also check if `@botPhone` appears in message text. See `group-triggers.ts`.
- **Always return 200 for webhook routes** — Green API retries on non-200. A malformed payload must be logged as `warn` and acknowledged with 200.
- **`sendMessage` / `sendButtons` never throw** — they return `{ success, error }`. Callers must check `success` and log on failure.
- **Buttons are 403 on basic Green API plan** — use plain text with reply instructions. Keep button-response parsing (`getButtonResponse()`) for forward compatibility but do not depend on it.

---

## 7) Testing Rules

- **Fakes are injected only via `buildApp()` options** — never via env vars or module mocks in integration/E2E tests.
- **Unit tests need no HTTP server** — test handler functions directly by calling them with fake deps. No `supertest`, no `buildApp()`.
- **Integration tests use fake session store + fake Green API + fake internal API** — only the network boundary (Green API webhook POST) is real HTTP.
- **E2E prod tests are skipped without real creds** — wrap with `describe.skipIf(!process.env.GREEN_API_TOKEN)`.
- **Assert behavior, not implementation** — test what messages were sent (`getSentMessages()`), not which internal functions were called.
- **Every new external service needs an env-guard test** — verify that `PROVIDER=fake` is rejected when `NODE_ENV=production`.

---

## 8) Dev Lessons Protocol

Before closing **any** task — fix, feature, refactor, or config change — answer all four questions and update the docs:

- **Bug fixed?** → add `[Bug]` entry to `chillist-docs/dev-lessons/chatbot.md`
- **Strategy or pattern confirmed working?** → add `[Win]` entry to `chillist-docs/dev-lessons/chatbot.md`
- **Design, config, or integration decision made?** → add `[Decision]` entry to `chillist-docs/dev-lessons/chatbot.md`
- **Rule that should always apply going forward?** → add it to this file under the relevant section

> The goal of `dev-lessons/chatbot.md` is to capture everything learned during this bot's development so the *next* WhatsApp bot can be built faster and with fewer mistakes. When in doubt, write it down.

### Decision entry format

```markdown
### [Decision] Short Title

**Date:** YYYY-MM-DD
**Context:** What problem or trade-off prompted this decision
**Decision:** What was chosen and what alternatives were rejected
**Reason:** Why this choice was made
**Reuse tip:** How to apply this in the next bot project
```

Never close a task without answering all four questions.
