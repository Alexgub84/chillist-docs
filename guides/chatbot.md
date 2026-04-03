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
| AI SDK          | Vercel AI SDK (`ai` package v5)            | ✅ Implemented |
| LLM Provider    | Anthropic or OpenAI (via `@ai-sdk/*`)      | ✅ Implemented |
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
| `AI_PROVIDER`              | `fake` (noop client)                                       | `anthropic` or `openai`                                             | yes              |
| `ANTHROPIC_API_KEY`        | — (optional in dev)                                        | from Anthropic dashboard                                            | when `anthropic` |
| `OPENAI_API_KEY`           | — (optional in dev)                                        | from OpenAI dashboard                                               | when `openai`    |

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
│   └── incoming-message.handler.ts  # business logic — session lookup, identify, AI conversation, reply
├── plugins/
│   ├── ai.ts                # decorates app.aiClient (IAiClient)
│   ├── database.ts          # decorates app.db (postgres Sql | null)
│   ├── green-api.ts         # decorates app.greenApiClient
│   ├── internal-api.ts      # decorates app.internalApiClient
│   ├── message-store.ts     # decorates app.messageStore (IMessageStore)
│   ├── session-store.ts     # decorates app.sessionStore
│   └── usage-logger.ts      # decorates app.usageLogger (IUsageLogger)
├── routes/
│   └── webhook.ts           # HTTP parsing only — delegates to handler
└── services/
    ├── ai/
    │   ├── types.ts          # IAiClient, AiGenerateParams, AiResponse
    │   ├── ai.client.ts             # createVercelAiClient (real — wraps Vercel AI SDK generateText)
    │   ├── noop-ai.client.ts        # createNoopAiClient (dev mode — returns placeholder text)
    │   ├── fake-ai.client.ts        # createFakeAiClient (tests) + setNextResponse(), getCallHistory()
    │   └── index.ts                 # createAiClient factory + re-exports
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
    ├── message-store/
    │   ├── types.ts          # IMessageStore, ChatbotMessage, CreateMessageData
    │   ├── postgres-message-store.ts  # createPostgresMessageStore (real DB)
    │   ├── fake-message-store.ts      # createFakeMessageStore (tests) + getMessages(), seed()
    │   └── index.ts          # re-exports
    ├── session/
    │   ├── types.ts          # ISessionStore, ChatbotSession, CreateSessionData
    │   ├── postgres-session-store.ts  # createPostgresSessionStore (real DB)
    │   ├── fake-session-store.ts      # createFakeSessionStore (tests)
    │   └── index.ts          # re-exports all session types and factories
    └── usage-logger/
        ├── types.ts          # IUsageLogger, AiUsageEntry, CreateUsageData
        ├── postgres-usage-logger.ts   # createPostgresUsageLogger (real DB)
        ├── fake-usage-logger.ts       # createFakeUsageLogger (tests) + getEntries()
        └── index.ts          # re-exports
migrations/
├── 001_chatbot_sessions.sql          # CREATE TABLE chatbot_sessions + index
├── 002_chatbot_sessions_chat_id.sql  # ADD COLUMN chat_id; updated index on (phone_number, chat_id, expires_at)
├── 003_chatbot_messages.sql          # CREATE TABLE chatbot_messages (conversation history for AI context)
└── 004_chatbot_ai_usage.sql          # CREATE TABLE chatbot_ai_usage (AI cost/token/tool tracking)
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
3. **Triggered** → strip leading `@mention` from text → run same `handleSessionAndPlansFlow()` as DMs, replying to **group** `chatId`

Group and DM messages share the same session+plans flow — welcome, yes/no detection, plans list, deleteSession.

Key helpers in `src/services/green-api/group-triggers.ts`:

- `isTriggeredGroupMessage(message, botJid | null)` — combined trigger check
- `getMessageText(message)` — extracts text from `textMessageData` or `extendedTextMessageData`
- `isBotMentioned(message, botJid)` — mention check
- `hasBotPrefix(text)` — prefix check
- `getButtonResponse(message)` — returns `{ selectedButtonId, selectedButtonText }` from `buttonsResponseMessage`, or `null`
- `getTextYesNo(text)` — returns `'yes'` for `yes`/`כן` (startsWith, case-insensitive), `'no'` for `no`/`לא`, else `null`

### Session management & plans flow (Phase 3 — done, plans flow added)

Group and DM messages run the same unified `handleSessionAndPlansFlow()` function.

**Session scoping:** Sessions are keyed by `(phone_number, chat_id)` — each WhatsApp context (DM or group) gets its own independent session for the same user. A user's active session in Group A does not affect their session in Group B or in a DM.

1. `sessionStore.getActiveSession(phone, chatId)` — looks up a non-expired session for this specific chatId
2. **No active session:**
   - `identify()` → if user found, `createSession()` → `sendMessage()` welcome + plans prompt ("Reply _yes_ or _no_.")
   - If user not found → `sendMessage()` signup link
3. **Active session:**
   - `touchSession()` (extend TTL)
   - Detects yes/no: checks `getButtonResponse()` first, then `getTextYesNo()` on text (handles `yes`/`כן`/`no`/`לא`)
   - `yes` → `internalApi.getPlans(userId)` → format + `sendMessage()` plans list (or no-plans message) → `deleteSession()` (fresh start on next message)
   - `no` or any other text → `sendMessage()` stillLearning message (session stays alive)

`SESSION_IDLE_TTL_MINUTES` (default 15) controls the idle expiry window.

`ISessionStore` interface methods: `getActiveSession(phoneNumber, chatId)`, `createSession`, `touchSession`, `deleteSession`.

> **Why plain text instead of buttons?** Green API's `/sendButtons` returns `403` on the current instance plan. Plain text with reply instructions works universally. Button response handling is kept for forward compatibility.

### AI layer structure (Phase 4 — implemented)

Three new service modules follow the same interface/real/fake/plugin pattern as green-api and session:

1. **`src/services/ai/`** — `IAiClient` wraps Vercel AI SDK `generateText` with tools and multi-turn conversation support. `createVercelAiClient(model)` for production, `createNoopAiClient()` for dev, `createFakeAiClient()` for tests.
2. **`src/services/message-store/`** — `IMessageStore` persists conversation history in `chatbot_messages`. Loaded as AI context (last 20 messages) on each turn.
3. **`src/services/usage-logger/`** — `IUsageLogger` tracks AI cost, tokens, tool calls, and conversation analytics in `chatbot_ai_usage`. Fire-and-forget (never blocks message delivery).

Each has a Fastify plugin (`plugins/ai.ts`, `plugins/message-store.ts`, `plugins/usage-logger.ts`) that decorates the app instance and accepts optional DI overrides via `buildApp()`.

**`IncomingMessageHandlerDeps`** now includes `aiClient`, `messageStore`, and `usageLogger` alongside the existing services.

---

## Config & DI Pattern

- `parseConfig()` in `src/config.ts` validates `process.env` via Zod — the **only** place `process.env` is read.
- `buildApp({ config, greenApiClient?, internalApiClient?, sessionStore?, aiClient?, messageStore?, usageLogger? })` accepts the validated config and optional client overrides for testing.
- Config is passed to plugins and routes via Fastify's plugin options — never imported globally.
- Service clients are factory functions (`createXxx()`) — no classes.

Plugin registration order in `buildApp`:

1. `databasePlugin` — `app.db`
2. `sessionStorePlugin` — `app.sessionStore`
3. `messageStorePlugin` — `app.messageStore` (depends on database)
4. `usageLoggerPlugin` — `app.usageLogger` (depends on database)
5. `greenApiPlugin` — `app.greenApiClient`
6. `internalApiPlugin` — `app.internalApiClient`
7. `aiPlugin` — `app.aiClient`
8. `webhookRoutes`

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

### Webhook Log Flow (happy path — DM or group trigger)

```
info  { typeWebhook }                         → "Ignored non-message webhook event" (status events)
info  { chatId, idMessage, phone, lang }      → "Processing incoming text message"
info  { phone, userId, lang }                 → "User identified — new session created — sending welcome with plans prompt"
info  { chatId, messageId }                   → "Welcome with plans prompt sent"
info  { phone, sessionId, yesNo }             → "Yes/no response received"
info  { chatId, planCount }                   → "Plans list sent"
info  { chatId }                              → "No plans message sent"
info  { chatId }                              → "Still learning message sent"
info  { phone, sessionId }                    → "Unrecognised input — sending still learning message"
```

### Webhook Log Flow (group messages)

```
info  { chatId, idMessage }                   → "Ignored group message" (not triggered)
info  { chatId, sender, phone, groupLang }    → "Processing triggered group message"
(then same flow as DM above)
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
npm run test:e2e:session    # Session + message store + usage logger DB E2E
```

**DB E2E tests locally:**

```bash
# Start postgres (reuse existing docker-compose)
docker compose -f docker-compose.test.yml up -d postgres --wait

# Run all DB E2E tests (sessions + messages + usage)
npm run test:e2e:session

# Run individually
TEST_DATABASE_URL=postgresql://chatbot_test:chatbot_test@localhost:5433/chatbot_test \
  vitest run tests/e2e/session-postgres.e2e.test.ts

TEST_DATABASE_URL=postgresql://chatbot_test:chatbot_test@localhost:5433/chatbot_test \
  vitest run tests/e2e/message-store-postgres.e2e.test.ts

TEST_DATABASE_URL=postgresql://chatbot_test:chatbot_test@localhost:5433/chatbot_test \
  vitest run tests/e2e/usage-logger-postgres.e2e.test.ts
```

**Docker E2E:**

```bash
# Build and start all containers (postgres + mock-be + chatbot)
docker compose -f docker-compose.test.yml up -d --build --wait

# Run Docker E2E tests
npm run test:e2e:docker

# Tear down
docker compose -f docker-compose.test.yml down -v
```

The Docker E2E health check validates the full boot chain: config parsing, all 7 plugins initialized (database, session store, message store, usage logger, green API, internal API, AI client), webhook routes registered.

### Test Layers

| Layer           | Files                                          | What it tests                                                                                                   |
| --------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Unit            | `tests/unit/*.test.ts`                         | Zod schemas, message templates, client factories, handlers, session store                                       |
| Unit            | `tests/unit/ai-client.test.ts`                 | AI client factory, fake helpers (setNextResponse, getCallHistory), noop return value, env guard for AI_PROVIDER |
| Unit            | `tests/unit/message-store.test.ts`             | Fake message store: addMessage, getRecentMessages ordering + limit, deleteBySession, seed/clear helpers         |
| Unit            | `tests/unit/usage-logger.test.ts`              | Fake usage logger: log entries, getEntries, clear, toolCallCount computed from toolCalls array                  |
| Integration     | `tests/integration/webhook.test.ts`            | Full webhook flow incl. session scenarios (all fakes injected via buildApp)                                     |
| E2E             | `tests/e2e/webhook-e2e.test.ts`                | Real HTTP to mock BE server + fake Green API + fake session store                                               |
| E2E Session DB  | `tests/e2e/session-postgres.e2e.test.ts`       | Real postgres session store — create/touch/expire sessions                                                      |
| E2E Message DB  | `tests/e2e/message-store-postgres.e2e.test.ts` | Real postgres: insert messages, query by session with limit, delete by session, concurrent sessions isolated    |
| E2E Usage DB    | `tests/e2e/usage-logger-postgres.e2e.test.ts`  | Real postgres: log usage entry, query by session/user/date range, verify JSONB tool_calls                       |
| E2E Docker      | `tests/e2e/docker-e2e.test.ts`                 | Real Docker containers, real HTTP between services — health check validates all plugins boot                    |
| E2E Prod        | `tests/e2e/green-api.e2e.test.ts`              | Real Green API with real creds (`skipIf` no creds)                                                              |

### When to use which test layer

| I want to test...                            | Use                                                       |
| -------------------------------------------- | --------------------------------------------------------- |
| AI client returns correct response shape     | Unit test with `FakeAiClient`                             |
| Handler calls AI with correct messages/tools | Unit test — assert `fakeAiClient.getCallHistory()`        |
| Messages are persisted and loaded in order   | DB E2E with real postgres                                 |
| Usage entry has correct tool_calls and cost  | DB E2E with real postgres                                 |
| Full chatbot boots with all services         | Docker E2E health check                                   |
| Webhook flow end-to-end with AI              | Integration test with all fakes injected via `buildApp()` |

### Fake Client Rules

- Fakes are **only** injected via `buildApp()` options — never created by the factory plugins.
- `WHATSAPP_PROVIDER=fake` is blocked in production by Zod `.refine()`.
- `AI_PROVIDER=fake` is blocked in production by Zod `.refine()`.
- `DATABASE_URL` is required in production by Zod `.refine()`.
- Env guard tests (`env-guards.test.ts`) verify all three constraints.
- `FakeSessionStore` extends `ISessionStore` with `.seed()`, `.getSessions()`, `.clear()` helpers for test setup.
- `FakeAiClient` extends `IAiClient` with `.setNextResponse()`, `.getCallHistory()`, `.clear()` helpers.
- `FakeMessageStore` extends `IMessageStore` with `.getMessages()`, `.seed()`, `.clear()` helpers.
- `FakeUsageLogger` extends `IUsageLogger` with `.getEntries()`, `.clear()` helpers.

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
npx tsx scripts/migrate.ts
```

Or apply individually:

```bash
npx tsx scripts/migrate.ts  # runs all pending migrations in order
```

Migration files:

- `001_chatbot_sessions.sql` — creates `chatbot_sessions` table
- `002_chatbot_sessions_chat_id.sql` — adds `chat_id` column + updated index
- `003_chatbot_messages.sql` — creates `chatbot_messages` table (conversation history for AI context)
- `004_chatbot_ai_usage.sql` — creates `chatbot_ai_usage` table (AI cost/token/tool tracking per message)

The `chatbot_sessions` table stores one row per active conversation session:

| Column            | Type        | Notes                                              |
| ----------------- | ----------- | -------------------------------------------------- |
| `session_id`      | UUID PK     | Auto-generated                                     |
| `phone_number`    | TEXT        | E.164 format                                       |
| `chat_id`         | TEXT        | WhatsApp chatId — DM = user JID, group = group JID |
| `user_id`         | UUID        | From internal API identify response                |
| `display_name`    | TEXT        | From internal API identify response                |
| `current_plan_id` | UUID        | Nullable — set when user selects a plan (future)   |
| `created_at`      | TIMESTAMPTZ | Immutable                                          |
| `last_active_at`  | TIMESTAMPTZ | Updated on every `touchSession()`                  |
| `expires_at`      | TIMESTAMPTZ | `NOW() + SESSION_IDLE_TTL_MINUTES`                 |

The `chatbot_messages` table stores conversation history per session (AI context window):

| Column        | Type        | Notes                                                  |
| ------------- | ----------- | ------------------------------------------------------ |
| `message_id`  | UUID PK     | Auto-generated                                         |
| `session_id`  | UUID        | References the owning session (no FK — app-level join) |
| `sender_type` | TEXT        | `'user'` or `'bot'`                                    |
| `content`     | TEXT        | Raw message text                                       |
| `created_at`  | TIMESTAMPTZ | Immutable                                              |

The `chatbot_ai_usage` table tracks AI cost, tokens, and tool calls per AI invocation:

| Column            | Type          | Notes                                                                  |
| ----------------- | ------------- | ---------------------------------------------------------------------- |
| `id`              | UUID PK       | Auto-generated                                                         |
| `session_id`      | UUID          | Which conversation session                                             |
| `user_id`         | UUID          | Nullable — Supabase user UUID                                          |
| `plan_id`         | UUID          | Nullable — plan in focus during this AI call                           |
| `provider`        | TEXT          | `'anthropic'` or `'openai'`                                           |
| `model_id`        | TEXT          | Specific model used (e.g. `claude-haiku-4-5`)                          |
| `lang`            | TEXT          | Nullable — detected language                                           |
| `chat_type`       | TEXT          | `'dm'` or `'group'`                                                    |
| `message_index`   | INT           | Turn number in the conversation (for drop-off analysis)                |
| `step_count`      | INT           | Number of AI steps (multi-step tool use)                               |
| `tool_calls`      | JSONB         | Array of tool names called (e.g. `["getMyPlans", "getPlanDetails"]`)   |
| `tool_call_count` | INT           | `tool_calls.length` — denormalized for fast aggregation                |
| `input_tokens`    | INT           | Nullable                                                               |
| `output_tokens`   | INT           | Nullable                                                               |
| `total_tokens`    | INT           | Nullable                                                               |
| `estimated_cost`  | NUMERIC(10,6) | Nullable — computed from tokens x model pricing                        |
| `duration_ms`     | INT           | Wall-clock time of AI call                                             |
| `status`          | TEXT          | `'success'` or `'error'`                                               |
| `error_message`   | TEXT          | Nullable — error details if status is error                            |
| `created_at`      | TIMESTAMPTZ   | Immutable                                                              |

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
- [x] Session scoping by `(phone_number, chat_id)` — DM and each group get independent sessions
- [x] AI service structure — `IAiClient`, `createVercelAiClient`, `createFakeAiClient`, `createNoopAiClient`, plugin + DI
- [x] `chatbot_messages` table — conversation history for AI context window (`IMessageStore` + postgres + fake)
- [x] `chatbot_ai_usage` table — per-message AI cost, token, and tool tracking (`IUsageLogger` + postgres + fake)
- [ ] AI conversation logic — system prompt, tool definitions (getMyPlans, getPlanDetails, updateItemStatus), multi-turn flow
- [ ] Internal API data routes (`GET /plans/:id`, `PATCH /items/:id/status`)
- [ ] Group sessions (linked plan, shared message history) — Phase 7
