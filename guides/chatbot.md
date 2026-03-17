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
| Session storage | Redis via Upstash                          | Pending        |
| Hosting         | Railway (same project as app BE)           | ✅ Configured  |

---

## Environment Variables

See `.env.example` in the repo for full annotated config. Summary:

| Variable                | Local                        | Production                      | Required in prod |
| ----------------------- | ---------------------------- | ------------------------------- | ---------------- |
| `PORT`                  | `3334`                       | `3334`                          | yes              |
| `HOST`                  | `0.0.0.0`                    | `0.0.0.0`                       | yes              |
| `NODE_ENV`              | `development`                | `production`                    | yes              |
| `LOG_LEVEL`             | `info`                       | `info`                          | yes              |
| `WHATSAPP_PROVIDER`     | `fake` (noop client)         | `green_api`                     | yes              |
| `GREEN_API_INSTANCE_ID` | —                            | from Green API dashboard        | when `green_api` |
| `GREEN_API_TOKEN`       | —                            | from Green API dashboard        | when `green_api` |
| `APP_BE_INTERNAL_URL`   | `http://localhost:3333`      | Railway internal URL            | yes              |
| `CHATBOT_SERVICE_KEY`   | any string (optional in dev) | shared secret with chillist-be  | yes              |
| `FE_BASE_URL`           | `http://localhost:5173`      | `https://chillist-fe.pages.dev` | yes              |

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
│   └── incoming-message.handler.ts  # business logic — identify user, choose reply, send
├── plugins/
│   ├── green-api.ts         # decorates app.greenApiClient
│   └── internal-api.ts      # decorates app.internalApiClient
├── routes/
│   └── webhook.ts           # HTTP parsing only — delegates to handler
└── services/
    ├── green-api/
    │   ├── types.ts          # IGreenApiClient, SendResult, Zod webhook schemas
    │   ├── green-api.client.ts       # createHttpGreenApiClient (real HTTP)
    │   ├── noop-green-api.client.ts  # createNoopGreenApiClient (dev mode)
    │   └── fake-green-api.client.ts  # createFakeGreenApiClient (tests)
    └── internal-api/
        ├── types.ts          # IInternalApiClient, IdentifyResult
        ├── internal-api.client.ts       # createHttpInternalApiClient (real HTTP)
        └── fake-internal-api.client.ts  # createFakeInternalApiClient (tests)
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

### Adding the AI layer (Phase 4)

Only `src/handlers/incoming-message.handler.ts` changes. Routes, plugins, and integration tests are untouched.

1. **Add `src/services/ai/`** — `IAiClient`, `createVercelAiClient()`, `createFakeAiClient()` (same pattern as green-api, internal-api)
2. **Add `src/services/session/`** — `ISessionStore`, `createRedisSessionStore()`, `createFakeSessionStore()`
3. **Add plugins** — `src/plugins/ai.ts`, `src/plugins/session.ts` decorate `app.aiClient`, `app.sessionStore`
4. **Extend `IncomingMessageHandlerDeps`** — add `aiClient: IAiClient`, `sessionStore: ISessionStore`
5. **Update handler logic** — load session → run AI → save session → send reply
6. **Add unit tests** — `tests/unit/incoming-message-handler.test.ts` grows, no HTTP needed

---

## Config & DI Pattern

- `parseConfig()` in `src/config.ts` validates `process.env` via Zod — the **only** place `process.env` is read.
- `buildApp({ config, greenApiClient?, internalApiClient? })` accepts the validated config and optional client overrides for testing.
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
| **Green API**     | `sendMessage` returns `{ success, error }` — never throws               |
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

### Webhook Log Flow (happy path)

```
info  { typeWebhook }                         → "Ignored non-message webhook event" (status events)
info  { chatId, idMessage, phone, lang }      → "Processing incoming text message"
info  { phone, userId, lang }                 → "User identified — sending welcome"
info  { chatId, messageId }                   → "Welcome message sent"
```

### Webhook Log Flow (error paths)

```
warn  { err }                                 → "Malformed webhook payload"
warn  { err, typeWebhook }                    → "Failed to parse incoming message body"
warn  { err, chatId }                         → "Failed to send welcome/signup message"
error { err, phone, chatId, idMessage }       → "Unexpected error during webhook processing"
```

---

## Testing

### Commands

```bash
npm run test:run          # typecheck + lint + all tests
npm run test:unit         # unit tests only
npm run test:e2e          # E2E tests (in-process mock BE + fake Green API)
npm run test:e2e:docker   # Docker E2E (builds containers, runs tests, tears down)
```

### Test Layers

| Layer       | Files                               | What it tests                                              |
| ----------- | ----------------------------------- | ---------------------------------------------------------- |
| Unit        | `tests/unit/*.test.ts`              | Zod schemas, message templates, client factories, handlers |
| Integration | `tests/integration/webhook.test.ts` | Full webhook flow with fake clients (no network)           |
| E2E         | `tests/e2e/webhook-e2e.test.ts`     | Real HTTP to mock BE server + fake Green API               |
| E2E Docker  | `tests/e2e/docker-e2e.test.ts`      | Real Docker containers, real HTTP between services         |
| E2E Prod    | `tests/e2e/green-api.e2e.test.ts`   | Real Green API with real creds (`skipIf` no creds)         |

### Fake Client Rules

- Fakes are **only** injected via `buildApp()` options — never created by the factory plugins.
- `WHATSAPP_PROVIDER=fake` is blocked in production by Zod `.refine()`.
- Env guard tests (`env-guards.test.ts`) verify fake is rejected in production.

---

## Deployment

- Deployed to Railway in the same project as the app backend.
- Internal networking: chatbot reaches app BE via `http://chillist-api.railway.internal:<PORT>/api/internal/*`.
- Has its own Dockerfile and deploy pipeline.
- Can be deployed independently of the app BE.
- Docker E2E available via `docker-compose.test.yml` (mock-be + chatbot containers).

---

## What's Next

- [ ] Session management with Upstash Redis
- [ ] AI SDK integration with tool definitions
- [ ] Internal API data routes (`GET /plans`, `GET /plans/:id`, `PATCH /items/:id/status`)
