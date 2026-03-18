# Chatbot Guide

Setup, development, and deployment guide for `chillist-whatsapp-bot`.

> **Architecture spec:** [specs/whatsapp-chatbot-spec.md](../specs/whatsapp-chatbot-spec.md)

---

## Tech Stack

| Component       | Technology                                 | Status         |
| --------------- | ------------------------------------------ | -------------- |
| Runtime         | Node.js 20+, TypeScript                    | ✅ Implemented |
| Framework       | Fastify 5                                  | ✅ Implemented |
| WhatsApp API    | Green API (shared instance with app BE)    | ✅ Implemented |
| Validation      | Zod (env config + webhook payload schemas) | ✅ Implemented |
| Testing         | Vitest (unit, integration, E2E)            | ✅ Implemented |
| AI SDK          | Vercel AI SDK (`ai` package)               | Pending        |
| LLM Provider    | TBD (Anthropic or OpenAI)                  | Pending        |
| Database        | PostgreSQL (`postgres` package)            | ✅ Implemented |
| Session storage | Direct DB connection (`chatbot_sessions`)  | ✅ Implemented |
| Hosting         | Railway (same project as app BE)           | ✅ Configured  |

---

## Environment Variables

See `.env.example` in the repo for full annotated config. Summary:

| Variable                   | Local                                                      | Production                                                          | Required in prod |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- | ---------------- |
| `PORT`                     | `3334`                                                     | `3334`                                                              | yes              |
| `HOST`                     | `0.0.0.0`                                                  | `0.0.0.0`                                                           | yes              |
| `NODE_ENV`                 | `development`                                              | `production`                                                        | yes              |
| `LOG_LEVEL`                | `info`                                                     | `info`                                                              | yes              |
| `WHATSAPP_PROVIDER`        | `fake` (noop client)                                       | `green_api`                                                         | yes              |
| `GREEN_API_INSTANCE_ID`    | —                                                          | from Green API dashboard                                            | when `green_api` |
| `GREEN_API_TOKEN`          | —                                                          | from Green API dashboard                                            | when `green_api` |
| `APP_BE_INTERNAL_URL`      | `http://localhost:3333`                                    | `http://zealous-beauty.railway.internal:${{chillist-be-prod.PORT}}` | yes              |
| `CHATBOT_SERVICE_KEY`      | any string (optional in dev)                               | shared secret with chillist-be                                      | yes              |
| `BOT_PHONE_NUMBER`         | — (optional; only needed for @mention detection in groups) | E.164 phone of the bot's WhatsApp number                            | for group chat   |
| `FE_BASE_URL`              | `http://localhost:5173`                                    | `https://chillist-fe.pages.dev`                                     | yes              |
| `DATABASE_URL`             | — (optional; sessions use in-memory if unset)              | Supabase **pooled** connection (port 6543)                          | yes              |
| `DATABASE_URL_PUBLIC`      | — (optional; only needed for migrations)                   | Supabase **direct** connection (port 5432)                          | for migrations   |
| `SESSION_IDLE_TTL_MINUTES` | `15`                                                       | `15`                                                                | no (default 15)  |

**Env validation:** All variables are validated at startup via Zod (`src/config.ts`). If invalid, the process exits with a clear error listing each failing field.

---

## Local Development

```bash
cp .env.example .env        # edit values as needed
npm install
npm run dev                  # tsx watch — auto-restarts on changes
```

With `WHATSAPP_PROVIDER=fake`, no real WhatsApp messages are sent — the noop client returns `success: true` for every send.

---

## Project Structure

```
src/
├── index.ts                 # entry point — parseConfig() + buildApp()
├── app.ts                   # Fastify setup, plugin registration, DI wiring
├── config.ts                # Zod env schema + parseConfig()
├── bot-replies/             # i18n message templates (en/he)
├── handlers/
│   └── incoming-message.handler.ts  # business logic — session lookup, identify, reply
├── plugins/
│   ├── database.ts          # decorates app.db (postgres Sql | null)
│   ├── green-api.ts         # decorates app.greenApiClient
│   ├── internal-api.ts      # decorates app.internalApiClient
│   └── session-store.ts     # decorates app.sessionStore
├── routes/
│   └── webhook.ts           # HTTP parsing only — delegates to handler
└── services/
    ├── green-api/
    │   ├── types.ts          # IGreenApiClient, SendResult, Button, SendButtonsParams, ButtonResponse, Zod webhook schemas
    │   ├── green-api.client.ts       # createHttpGreenApiClient + chatIdToPhone, isGroupChatId, phoneToChatId
    │   ├── group-triggers.ts         # isBotMentioned, hasBotPrefix, isTriggeredGroupMessage, getMessageText, getButtonResponse
    │   ├── noop-green-api.client.ts  # createNoopGreenApiClient (dev mode)
    │   └── fake-green-api.client.ts  # createFakeGreenApiClient (tests) + getSentButtons()
    ├── internal-api/
    │   ├── types.ts          # IInternalApiClient, IdentifyResult, PlanSummary, PlansResult
    │   ├── internal-api.client.ts       # createHttpInternalApiClient (real HTTP)
    │   └── fake-internal-api.client.ts  # createFakeInternalApiClient (tests) + setPlans()
    └── session/
        ├── types.ts          # ISessionStore, ChatbotSession, CreateSessionData
        ├── postgres-session-store.ts  # createPostgresSessionStore (real DB)
        ├── fake-session-store.ts      # createFakeSessionStore (tests)
        └── index.ts          # re-exports all session types and factories
migrations/
└── 001_chatbot_sessions.sql  # CREATE TABLE chatbot_sessions + index
```

---

## Handler Architecture

**Rule: routes contain HTTP logic only. All business logic lives in handlers.**

### Route responsibility (`src/routes/*.ts`)

- Parse and validate request body with Zod
- Filter irrelevant events (non-message webhooks, non-text messages)
- Call the handler with the parsed data and injected deps
- Return the HTTP response (always 200 for webhook routes)

### Handler responsibility (`src/handlers/*.handler.ts`)

- Pure async functions — no Fastify, no `request`, no `reply`
- Receive parsed data + explicit deps (`IncomingMessageHandlerDeps`)
- Contain all business logic: identify user, choose reply, send message
- Fully testable in unit tests without spinning up an HTTP server

### Handler signature pattern

```ts
export interface XxxHandlerDeps {
  serviceA: IServiceA; // injected — real in prod, fake in tests
  serviceB: IServiceB;
  feBaseUrl: string; // config values passed explicitly
  log: HandlerLogger; // minimal interface: .info / .warn / .error
}

export async function handleXxx(
  input: ParsedInput,
  deps: XxxHandlerDeps,
): Promise<void>;
```

### Group message handling (Phase 7 foundation — done)

Group messages (`chatId` ending in `@g.us`) are handled separately from DMs:

1. **Trigger check** — message is only processed if directed at the bot:
   - `@mention`: bot's JID appears in `extendedTextMessageData.mentionedJidList` (requires `BOT_PHONE_NUMBER`)
   - Prefix: message starts with `/chillist` or `/cl` (case-insensitive)
2. **Not triggered** → silently ignore, log `"Ignored group message"`
3. **Triggered** → per-message identify (`senderData.sender` → phone) → reply welcome or signup to **group** `chatId`

No session lookup for group messages — identity is resolved per-message. Group sessions (linked plan, shared history) are Phase 7.

Key helpers in `src/services/green-api/group-triggers.ts`:

- `isTriggeredGroupMessage(message, botJid | null)` — combined trigger check
- `getMessageText(message)` — extracts text from `textMessageData` or `extendedTextMessageData`
- `isBotMentioned(message, botJid)` — mention check
- `hasBotPrefix(text)` — prefix check
- `getButtonResponse(message)` — returns `{ selectedButtonId, selectedButtonText }` from `buttonsResponseMessage`, or `null`
- `getTextYesNo(text)` — returns `'yes'` for `yes`/`כן` (startsWith, case-insensitive), `'no'` for `no`/`לא`, else `null`

### Session management & plans flow (Phase 3 — done, plans flow added)

For DM messages, the handler runs session logic:

1. `sessionStore.getActiveSession(phone)` — looks up a non-expired session
2. **No active session:**
   - `identify()` → if user found, `createSession()` → `sendMessage()` welcome + plans prompt ("Reply _yes_ or _no_.")
   - If user not found → `sendMessage()` signup link
3. **Active session + yes/no reply** (button response OR plain text):
   - `touchSession()` (extend TTL)
   - Detects yes/no: checks `getButtonResponse()` first, then `getTextYesNo()` on text (handles `yes`/`כן`/`no`/`לא`)
   - `yes` → `internalApi.getPlans(userId)` → format + `sendMessage()` plans list (or no-plans message)
   - `no` → `sendMessage()` stillLearning message
4. **Active session + other text:**
   - `touchSession()` → `sendMessage()` `continuingConversation` reply

`SESSION_IDLE_TTL_MINUTES` (default 15) controls the idle expiry window.

> **Why plain text instead of buttons?** Green API's `/sendButtons` returns `403` on the current instance plan. Plain text with reply instructions works universally. Button response handling is kept for forward compatibility.

### Adding the AI layer (Phase 4)

Only `src/handlers/incoming-message.handler.ts` changes. Routes, plugins, and integration tests are untouched.

1. **Add `src/services/ai/`** — `IAiClient`, `createVercelAiClient()`, `createFakeAiClient()` (same pattern as green-api, internal-api)
2. **Add `src/plugins/ai.ts`** — decorates `app.aiClient`
3. **Extend `IncomingMessageHandlerDeps`** — add `aiClient: IAiClient`
4. **Update handler logic** — run AI with session context → send AI reply
5. **Add unit tests** — `tests/unit/incoming-message-handler.test.ts` grows, no HTTP needed

---

## Config & DI Pattern

- `parseConfig()` in `src/config.ts` validates `process.env` via Zod — the **only** place `process.env` is read.
- `buildApp({ config, greenApiClient?, internalApiClient?, sessionStore? })` accepts the validated config and optional client overrides for testing.
- Config is passed to plugins and routes via Fastify's plugin options — never imported globally.
- Service clients are factory functions (`createXxx()`) — no classes.

---

## Error Handling

| Layer             | Strategy                                                                |
| ----------------- | ----------------------------------------------------------------------- |
| **Config**        | Zod parse at startup — process exits with human-readable field errors   |
| **Plugins**       | Throw on missing required config — Fastify catches and prevents startup |
| **Webhook route** | `safeParse` on every payload — malformed input returns 200 + warn log   |
| **Handler**       | `try/catch` wraps all service calls — logs `error` with all entity IDs  |
| **Green API**     | `sendMessage` / `sendButtons` return `{ success, error }` — never throw |
| **Internal API**  | `identify` returns `null` for 404, throws for unexpected HTTP errors    |

**Why 200 on bad payloads:** Green API retries on non-200. Returning 200 acknowledges receipt and prevents infinite retry loops.

---

## Logging

Uses Fastify's Pino logger. In routes: `request.log`. In plugins/startup: `app.log`.

### Log Levels

| Level   | When                                                                                    |
| ------- | --------------------------------------------------------------------------------------- |
| `error` | Unexpected failures — internal API unreachable, unhandled exceptions in webhook handler |
| `warn`  | Recoverable problems — malformed payload, failed message send, Zod parse failure        |
| `info`  | Normal operations — message received, user identified, message sent, plugin initialized |

### Log Context Fields

Every log line includes relevant entity IDs for production debugging:

| Field        | Type   | Where                            |
| ------------ | ------ | -------------------------------- |
| `chatId`     | string | webhook processing, message send |
| `idMessage`  | string | webhook processing               |
| `phone`      | string | user identification              |
| `userId`     | string | after successful identify        |
| `lang`       | string | message processing               |
| `messageId`  | string | after successful send            |
| `err`        | object | all warn/error logs              |
| `baseUrl`    | string | internal API plugin init         |
| `instanceId` | string | Green API plugin init            |
| `provider`   | string | Green API plugin init            |

### Webhook Log Flow (happy path — DM)

```
info  { typeWebhook }                         → "Ignored non-message webhook event" (status events)
info  { chatId, idMessage, phone, lang }      → "Processing incoming text message"
info  { phone, userId, lang }                 → "User identified — sending welcome"
info  { chatId, messageId }                   → "Welcome with plans prompt sent"
info  { chatId, userId }                      → "User selected yes — fetching plans"
info  { chatId, planCount }                   → "Plans list sent"
info  { chatId }                              → "No plans found — sent noPlans message"
info  { chatId }                              → "User selected no — sent stillLearning"
info  { chatId, sessionId }                   → "Continuing conversation"
```

### Webhook Log Flow (group messages)

```
info  { chatId, idMessage }                   → "Ignored group message" (not triggered)
info  { chatId, sender, phone, groupLang }    → "Processing triggered group message"
info  { chatId, phone, userId }               → "Group sender identified — sending welcome"
info  { chatId, messageId }                   → "Group welcome message sent"
info  { chatId, phone }                       → "Group sender not found — sending signup link"
info  { chatId, messageId }                   → "Group signup message sent"
```

### Webhook Log Flow (error paths)

```
warn  { err }                                 → "Malformed webhook payload"
warn  { err, typeWebhook }                    → "Failed to parse incoming message body"
warn  { err, chatId }                         → "Failed to send welcome/signup/group message"
error { err, phone, chatId, idMessage }       → "Unexpected error during webhook processing"
error { err, chatId, sender, idMessage }      → "Unexpected error during group webhook processing"
```

---

## Testing

### Commands

```bash
npm run test:run            # typecheck + lint + all tests
npm run test:unit           # unit tests only
npm run test:e2e            # E2E tests (in-process mock BE + fake Green API)
npm run test:e2e:docker     # Docker E2E (builds containers, runs tests, tears down)
npm run test:e2e:session    # Session DB E2E (starts postgres in Docker, runs session tests)
```

**Session E2E locally:**

```bash
docker compose -f docker-compose.test.yml up -d postgres --wait
npm run test:e2e:session
# or with custom DB:
TEST_DATABASE_URL=postgresql://... vitest run tests/e2e/session-postgres.e2e.test.ts
```

### Test Layers

| Layer          | Files                                    | What it tests                                                             |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| Unit           | `tests/unit/*.test.ts`                   | Zod schemas, message templates, client factories, handlers, session store |
| Integration    | `tests/integration/webhook.test.ts`      | Full webhook flow incl. session scenarios (fake session store)            |
| E2E            | `tests/e2e/webhook-e2e.test.ts`          | Real HTTP to mock BE server + fake Green API + fake session store         |
| E2E Session DB | `tests/e2e/session-postgres.e2e.test.ts` | Real postgres session store — create/touch/expire sessions                |
| E2E Docker     | `tests/e2e/docker-e2e.test.ts`           | Real Docker containers, real HTTP between services                        |
| E2E Prod       | `tests/e2e/green-api.e2e.test.ts`        | Real Green API with real creds (`skipIf` no creds)                        |

### Fake Client Rules

- Fakes are **only** injected via `buildApp()` options — never created by the factory plugins.
- `WHATSAPP_PROVIDER=fake` is blocked in production by Zod `.refine()`.
- `DATABASE_URL` is required in production by Zod `.refine()`.
- Env guard tests (`env-guards.test.ts`) verify both constraints.
- `FakeSessionStore` extends `ISessionStore` with `.seed()`, `.getSessions()`, `.clear()` helpers for test setup.

---

## Deployment

- Deployed to Railway in the same project as the app backend.
- Has its own Dockerfile and deploy pipeline.
- Can be deployed independently of the app BE.
- Docker E2E available via `docker-compose.test.yml` (postgres + mock-be + chatbot containers).
- The chatbot container receives `DATABASE_URL` pointing to the postgres service in Docker Compose.

### Database Migrations

Migrations live in `migrations/`. Run manually against the target DB before deploying:

```bash
psql $DATABASE_URL -f migrations/001_chatbot_sessions.sql
```

The `chatbot_sessions` table stores one row per active conversation session:

| Column            | Type        | Notes                                            |
| ----------------- | ----------- | ------------------------------------------------ |
| `session_id`      | UUID PK     | Auto-generated                                   |
| `phone_number`    | TEXT        | E.164 format                                     |
| `user_id`         | UUID        | From internal API identify response              |
| `display_name`    | TEXT        | From internal API identify response              |
| `current_plan_id` | UUID        | Nullable — set when user selects a plan (future) |
| `created_at`      | TIMESTAMPTZ | Immutable                                        |
| `last_active_at`  | TIMESTAMPTZ | Updated on every `touchSession()`                |
| `expires_at`      | TIMESTAMPTZ | `NOW() + SESSION_IDLE_TTL_MINUTES`               |

### Railway Networking Pattern

| Client               | How to connect                      | Why                                                     |
| -------------------- | ----------------------------------- | ------------------------------------------------------- |
| **Frontend**         | Public HTTPS URL (no port)          | Goes through Railway's edge on port 443                 |
| **WhatsApp chatbot** | Private domain + PORT reference var | Stays inside Railway's internal network; faster, no TLS |

**Required Railway env vars:**

```
# On chillist-be-prod — makes PORT reference-able by other services:
PORT=8080

# On chillist-whatsapp-chatbot:
APP_BE_INTERNAL_URL=http://zealous-beauty.railway.internal:${{chillist-be-prod.PORT}}
```

Railway resolves `${{chillist-be-prod.PORT}}` to `8080` at deploy time.

> **`${{service.VAR}}` only resolves if VAR is user-defined** on the source service. Railway's runtime-injected PORT is not reference-able until explicitly set in the dashboard/CLI.
>
> When setting reference vars via CLI, always use **single quotes** to prevent shell expansion:
> `railway variables set 'KEY=http://host:${{service.PORT}}'`

---

## What's Next

- [x] Session management (direct DB via `chatbot_sessions` table)
- [x] Group message trigger detection (`@mention` + `/cl` prefix) with per-message identify
- [x] Plans flow — welcome with Yes/No buttons, `GET /api/internal/plans` on yes, stillLearning on no
- [ ] AI SDK integration with tool definitions
- [ ] Internal API data routes (`GET /plans/:id`, `PATCH /items/:id/status`)
- [ ] `chatbot_messages` table — conversation history for AI context window
- [ ] Group sessions (linked plan, shared message history) — Phase 7
