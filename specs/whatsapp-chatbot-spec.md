# Chillist WhatsApp AI Chatbot — Architecture Spec v1.0

> **Status:** Draft — feature definition & architecture
> **Scope:** This document defines the chatbot as a standalone service that communicates with the existing Chillist app backend via internal HTTP API. No implementation code is included.
> **Prerequisite:** WhatsApp Integration Phase 1 & 2 (notifications + list sharing via Green API) must be complete before chatbot work begins.

---

## 1 — Product Overview

### What it does

An AI-powered chatbot that lets Chillist users interact with their plans entirely through WhatsApp. Users can ask about their plans, see item details, and update item statuses — all via natural language conversation in WhatsApp.

### Why it matters

Many Chillist users coordinate via WhatsApp group chats. The chatbot meets them where they already are, removing the need to open the app for quick queries and updates.

### v1 Feature Scope

| Feature | Type | Example user message |
|---------|------|---------------------|
| Get my plans | Read | "What plans do I have?" |
| Get plan details | Read | "Show me the camping trip items" |
| Update item status | Write | "Mark the tent as done" |

### Explicitly out of scope (v1)

- Creating new plans
- Adding/removing items
- Inviting participants
- Managing join requests
- Payment or budget features

### v1.5 Feature Scope (Group Chat)

Group chat support is planned as a fast-follow after v1 stabilizes. See **Section 13** for full design.

---

## 2 — Architecture Overview

### Two-service model

The chatbot runs as a **separate service** from the app backend, deployed in the same Railway project. It communicates with the app backend over Railway's private internal network.

```
┌──────────────┐     webhook      ┌──────────────────┐    internal HTTP     ┌──────────────────┐
│              │ ───────────────> │                  │ ──────────────────> │                  │
│   Green API  │                  │  Chatbot Server  │                     │   App Backend    │
│  (WhatsApp)  │ <─────────────── │  (AI + session)  │ <────────────────── │  (Fastify API)   │
│              │    send message   │                  │     JSON response   │                  │
└──────────────┘                  └──────────────────┘                     └──────────────────┘
                                         │                                        │
                                         │                                        │
                                    ┌────▼─────┐                            ┌─────▼──────┐
                                    │  Redis/  │                            │ PostgreSQL │
                                    │  Upstash │                            │ (Supabase) │
                                    │ (sessions)│                            │  (app DB)  │
                                    └──────────┘                            └────────────┘
```

### Why separate

- Independent scaling — AI inference is bursty and slow compared to the REST API
- Isolated failure domain — if the AI provider goes down, the app keeps working
- Different deploy cadence — chatbot prompts and tools evolve faster than the core API
- Clean ownership boundary — the chatbot is a consumer of the app API, not part of it

### Why same Railway project

- Private internal networking — chatbot calls app BE without hitting the public internet
- Shared environment variables — Railway project-level env vars (Supabase keys, etc.)
- Single billing context

---

## 3 — User Identification & Auth

### Phone-number-based identification

WhatsApp guarantees that the sender owns the phone number (SIM + device verification). The chatbot trusts this and uses the phone number to identify the Chillist user.

### Lookup flow

```
1. WhatsApp message arrives with sender phone number (e.g., +972501234567)
2. Chatbot calls App BE: POST /api/internal/auth/identify
   Header: x-service-key: <CHATBOT_SERVICE_KEY>
   Body: { "phoneNumber": "+972501234567" }
3. App BE queries Supabase Admin API: supabase.auth.admin.listUsers()
   filtered by phone match
4. App BE returns: { "userId": "supabase-uid-xxx", "displayName": "Alex" }
   or 404 if no user found
5. Chatbot stores userId in session for subsequent requests
```

### Unregistered users

If the phone number doesn't match any Supabase user, the chatbot responds with a friendly message:

> "I don't recognize this number. Make sure you've signed up for Chillist with this phone number, or add it to your profile in the app."

No further interactions are allowed until identification succeeds.

### No OTP / no login

v1 does not require OTP or any additional confirmation. The WhatsApp phone number is the sole authentication factor. This is acceptable because:

- WhatsApp itself provides strong device-level authentication
- v1 scope is limited (read plans + update item status) — low risk
- Reduces friction for adoption

### Future upgrade path

If/when the chatbot gains higher-risk capabilities (create plans, manage participants, payments), introduce OTP confirmation on first interaction per device/number.

---

## 4 — Internal API Contract

The chatbot communicates with the app backend via dedicated internal routes. These routes are **not** exposed publicly — they are only accessible over Railway's private network and require a service key.

### Authentication

All internal routes require:

```
Header: x-service-key: <CHATBOT_SERVICE_KEY>
Header: x-user-id: <supabase-user-id>
```

The `CHATBOT_SERVICE_KEY` is a shared secret stored as a Railway environment variable, known only to the chatbot and app BE services. The `x-user-id` header carries the resolved user identity.

### App BE middleware

A new `internal-auth` plugin validates internal requests:

1. Check `x-service-key` matches the expected value → 401 if not
2. Read `x-user-id` from header → 400 if missing
3. Attach userId to the request context (same as JWT auth does for regular routes)
4. Route handler proceeds using existing service functions with the provided userId

### Routes

#### POST /api/internal/auth/identify

Resolves a phone number to a Chillist user.

```
Request:
  Header: x-service-key: <CHATBOT_SERVICE_KEY>
  Body: { "phoneNumber": "+972501234567" }

Response 200:
  { "userId": "abc-123", "displayName": "Alex" }

Response 404:
  { "error": "user_not_found" }
```

#### GET /api/internal/plans

Returns plans where the user is owner or participant.

```
Request:
  Header: x-service-key, x-user-id

Response 200:
  {
    "plans": [
      {
        "id": "plan-1",
        "name": "Camping in the Golan",
        "date": "2026-04-15",
        "role": "owner",
        "participantCount": 6,
        "itemCount": 24,
        "completedItemCount": 12
      }
    ]
  }
```

#### GET /api/internal/plans/:planId

Returns full plan details including items and participants.

```
Request:
  Header: x-service-key, x-user-id

Response 200:
  {
    "plan": {
      "id": "plan-1",
      "name": "Camping in the Golan",
      "date": "2026-04-15",
      "role": "owner",
      "participants": [
        { "id": "p-1", "name": "Alex", "role": "owner" },
        { "id": "p-2", "name": "Dana", "role": "participant" }
      ],
      "items": [
        {
          "id": "item-1",
          "name": "Tent (4-person)",
          "status": "done",
          "assignee": "Alex",
          "category": "gear"
        },
        {
          "id": "item-2",
          "name": "Charcoal",
          "status": "pending",
          "assignee": null,
          "category": "food"
        }
      ]
    }
  }

Response 403:
  { "error": "access_denied" }
  (user is not a participant of this plan)
```

#### PATCH /api/internal/items/:itemId/status

Updates an item's status.

```
Request:
  Header: x-service-key, x-user-id
  Body: { "status": "done" }

Response 200:
  { "item": { "id": "item-1", "name": "Tent", "status": "done" } }

Response 403:
  { "error": "access_denied" }

Response 404:
  { "error": "item_not_found" }
```

### Access control

Internal routes reuse the **same access control logic** as public routes (e.g., `src/utils/plan-access.ts`). The userId from `x-user-id` is checked against plan participants. The chatbot cannot access plans the user isn't part of.

---

## 5 — AI Layer

### Framework

**Vercel AI SDK** (`ai` package) with provider-agnostic setup. Initial provider TBD (Anthropic or OpenAI — the SDK supports both with minimal config change).

### Tool definitions

The AI model receives a system prompt and a set of tools. When the user sends a message, the model decides which tool(s) to call based on the natural language input.

#### Tool: getMyPlans

- **Description:** Get all plans the user is part of (as owner or participant)
- **Parameters:** none
- **Returns:** List of plans with summary info (name, date, role, item counts)

#### Tool: getPlanDetails

- **Description:** Get full details of a specific plan including items and participants
- **Parameters:** `planId` (string) — can be resolved from plan name via fuzzy match against getMyPlans results
- **Returns:** Plan with participants and items

#### Tool: updateItemStatus

- **Description:** Mark an item as done or pending
- **Parameters:** `itemId` (string), `status` ("done" | "pending")
- **Returns:** Updated item confirmation

### System prompt (conceptual — not final)

```
You are Chillist Bot, a helpful assistant for managing group event plans.
You help users check their plans, see item details, and update item statuses via WhatsApp.

Rules:
- Respond in the same language the user writes in (Hebrew or English)
- Keep responses short and WhatsApp-friendly (no markdown, no long paragraphs)
- Use emojis sparingly for readability
- When listing items, use simple numbered lists
- If a user asks about a plan by name, fuzzy-match against their plan list
- If ambiguous, ask the user to clarify which plan they mean
- Never expose internal IDs to the user — use plan names and item names
- If a tool call fails with access_denied, tell the user they don't have access
- If a tool call fails with user_not_found, tell the user to sign up or add their phone number
```

### Plan name resolution

Users will refer to plans by name ("the camping trip"), not by ID. The chatbot should:

1. Call `getMyPlans` to get the user's plan list
2. Fuzzy-match the user's description against plan names
3. If exactly one match → use it
4. If multiple matches → ask the user to clarify
5. If no match → tell the user no matching plan was found

This resolution happens inside the AI tool-calling loop — the model handles the ambiguity naturally.

---

## 6 — Session & Conversation Memory

### Why sessions

Without session memory, the user would need to repeat context every message:

- ❌ "Show me the camping trip" → (items) → "Who's bringing the tent?" → "Which plan?"
- ✅ "Show me the camping trip" → (items) → "Who's bringing the tent?" → (answer, same plan)

### Storage

**Redis (Upstash)** — persists across chatbot deploys, supports TTL for auto-expiry.

### Session model

Each WhatsApp phone number gets one session. The session stores:

```json
{
  "phoneNumber": "+972501234567",
  "userId": "supabase-uid-xxx",
  "displayName": "Alex",
  "currentPlanId": "plan-1",
  "messageHistory": [
    { "role": "user", "content": "Show me the camping trip" },
    { "role": "assistant", "content": "Here are the items for Camping in the Golan:..." }
  ],
  "createdAt": "2026-03-16T10:00:00Z",
  "lastActiveAt": "2026-03-16T10:05:00Z"
}
```

### TTL & limits

| Setting | Value | Rationale |
|---------|-------|-----------|
| Session TTL | 24 hours from last activity | Conversations are short-lived; stale context is worse than no context |
| Max message history | 20 messages (10 pairs) | Keeps token usage bounded; older context is rarely needed |
| Re-identification | On session expiry, re-lookup phone → userId | Handles edge case of phone number transferred to a different user |

### First message flow

```
1. Message arrives from +972501234567
2. Check Redis for session with this phone number
3. If no session → call /api/internal/auth/identify → create session
4. If session exists → load userId and messageHistory from session
5. Build AI request with system prompt + messageHistory + new user message
6. Process AI response → send to WhatsApp → append both messages to session
7. Update lastActiveAt, save session to Redis
```

---

## 7 — Green API Integration

### Shared instance

The chatbot uses the **same Green API instance** as the notification system (Phase 1/2). Both the app BE (for notifications) and the chatbot server receive webhooks from the same instance.

### Webhook routing

The app BE and chatbot use the **same Green API instance** but have different roles:

- **App BE:** Sends outgoing notifications only (invitations, form submissions, list sharing). Does not receive incoming webhooks.
- **Chatbot:** Receives incoming message webhooks only. Sends responses back to users.

Green API's webhook URL points to the **chatbot server**. The app BE continues to use Green API's send-message REST API for outgoing notifications — no changes needed to existing notification logic.

> **Future consolidation:** Once the chatbot is stable, consider moving all Green API interactions (both sending and receiving) to the chatbot service, with the app BE requesting sends via internal API. This avoids both services holding Green API credentials. Not needed for v1.

### Message handling

```
1. Green API POST → chatbot webhook endpoint
2. Parse event type:
   - "incomingMessageReceived" → process as chatbot message
   - Delivery/status events → forward to app BE or ignore
3. Extract sender phone number and message text
4. Run through session + AI pipeline (section 6)
5. Send response via Green API sendMessage API
```

### Rate limiting

WhatsApp has messaging limits. The chatbot should:

- Not send more than 1 response per user message (no multi-message floods)
- Handle Green API rate limit errors gracefully (retry with backoff)
- Cap response length to fit WhatsApp's message size limits (~65,000 chars, but keep it short for UX)

---

## 8 — Tech Stack Summary

| Component | Technology | Notes |
|-----------|-----------|-------|
| Runtime | Node.js 20+, TypeScript | Same as app BE for consistency |
| Framework | Fastify 5 | Same as app BE; could also be lightweight (Express/Hono) but Fastify keeps tooling consistent |
| AI SDK | Vercel AI SDK (`ai` package) | Provider-agnostic; supports Anthropic, OpenAI, others |
| LLM Provider | TBD (Anthropic or OpenAI) | Decided at implementation time; AI SDK makes switching trivial |
| Session storage | Redis via Upstash | Serverless Redis; managed, persistent, supports TTL |
| WhatsApp API | Green API | Shared instance with notification system |
| Hosting | Railway (same project as app BE) | Private networking for internal API calls |
| User lookup | Supabase Admin SDK | Resolve phone number → userId |

### Environment variables (chatbot server)

```
# Green API
GREEN_API_INSTANCE_ID=       # shared with app BE
GREEN_API_TOKEN=             # shared with app BE

# Internal API
APP_BE_INTERNAL_URL=         # e.g., app-be.railway.internal:3333
CHATBOT_SERVICE_KEY=         # shared secret for internal auth

# AI
AI_PROVIDER=                 # "anthropic" | "openai"
AI_API_KEY=                  # provider API key

# Session
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=

# Supabase (for phone lookup)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=   # admin access for user lookup
```

---

## 9 — Deployment & Infrastructure

### Railway setup

```
Railway Project: chillist
├── Service: chillist-api        (existing app backend)
├── Service: chillist-chatbot    (new — this spec)
├── Database: PostgreSQL         (existing, accessed by app BE only)
└── Redis: Upstash               (new — chatbot sessions)
```

### Internal networking

- Chatbot → App BE: `http://chillist-api.railway.internal:<PORT>/api/internal/*`
- No public exposure needed for internal routes
- App BE's public routes remain unchanged

### Deploy process

- Chatbot has its own Dockerfile and deploy pipeline
- Can be deployed independently of the app BE
- Shares the Railway project for environment variable management

---

## 10 — Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Phone spoofing | WhatsApp provides device-level verification; Green API relays verified sender numbers |
| Internal API exposure | `/api/internal/*` routes protected by service key; not exposed on public hostname |
| Service key leakage | Stored in Railway env vars; never in code; rotatable |
| Excessive AI usage | Per-user rate limiting on the chatbot side (e.g., max 50 messages/hour) |
| Data access | Chatbot can only access plans the user participates in (same access control as app) |
| Session hijacking | Sessions keyed by phone number; Redis access requires Upstash token |
| Prompt injection | AI system prompt includes guardrails; tool definitions limit what the model can do |

---

## 11 — Definition of Done (v1)

### Infrastructure
- [ ] Chatbot service created in Railway project
- [ ] Upstash Redis provisioned and connected
- [ ] Internal networking verified (chatbot can reach app BE on private network)
- [ ] Green API webhook updated to point to chatbot service
- [ ] All environment variables configured

### App BE changes
- [ ] `internal-auth` plugin created and registered
- [ ] `POST /api/internal/auth/identify` route implemented
- [ ] `GET /api/internal/plans` route implemented (reuses existing service functions)
- [ ] `GET /api/internal/plans/:planId` route implemented (reuses existing service functions)
- [ ] `PATCH /api/internal/items/:itemId/status` route implemented (reuses existing service functions)
- [ ] Internal routes not accessible from public hostname
- [ ] Access control enforced on all internal routes

### Chatbot service
- [ ] Green API webhook endpoint receives and parses incoming messages
- [ ] Phone → userId identification works via internal API
- [ ] Unregistered phone numbers receive a friendly rejection message
- [ ] AI SDK configured with tools (getMyPlans, getPlanDetails, updateItemStatus)
- [ ] System prompt produces natural, short, WhatsApp-friendly responses
- [ ] Language auto-detection works (Hebrew and English)
- [ ] Session memory persists across messages (Redis)
- [ ] Sessions expire after 24 hours of inactivity
- [ ] Message history capped at 20 messages per session
- [ ] Plan name fuzzy matching works for natural references

### Testing
- [ ] Integration tests for all internal API routes (app BE side)
- [ ] Unit tests for session management logic
- [ ] Unit tests for phone → user resolution
- [ ] AI tool calls tested with mocked AI responses
- [ ] End-to-end manual test: real WhatsApp message → chatbot → correct response

---

## 12 — Open Questions & Future Considerations

| Question | Status | Notes |
|----------|--------|-------|
| NPM shared schema package | Deferred | Not needed for v1 since chatbot doesn't access DB directly; revisit if direct DB access is added |
| Group chat support | v1.5 | Designed in Section 13; implement after v1 1:1 chat is stable |
| Create plan via chatbot | v2 | Requires more complex tool definitions and write access |
| Add/remove items | v2 | Requires item creation logic in internal API |
| OTP confirmation | Future | Add when higher-risk write operations are introduced |
| Billing / usage metering | Future | Track AI API costs per user if monetizing chatbot as premium feature |
| Fallback when AI is down | TBD | Options: queue messages for retry, or respond with "I'm having trouble, try the app" |
| Green API consolidation | Future | Move all WhatsApp sending to chatbot service; app BE requests sends via internal API |

---

## 13 — Group Chat Support (v1.5)

### Overview

The chatbot can be added to a WhatsApp group where plan participants coordinate. Instead of each person messaging the bot privately, the group becomes a shared interface for a specific plan.

### How the bot gets activated in a group

1. Someone adds the chatbot's WhatsApp number to the group
2. The bot sends an introduction message: "Hi! I'm the Chillist Bot. To link me to a plan, say: @Chillist link [plan name]"
3. A registered user mentions the bot with a plan name
4. The bot resolves the user (phone → userId), finds the plan, and links the group to that plan
5. From this point, all bot interactions in this group are scoped to that linked plan

### Message relevance filtering

The bot does **not** respond to every message in the group. It only processes messages that are explicitly directed at it:

**Primary trigger: @mention.** When a user tags the bot's WhatsApp number (e.g., "@Chillist what's left?"). Green API provides mention detection in group messages.

**Secondary trigger: prefix.** Messages starting with `/chillist` or `/cl` (e.g., "/cl mark tent as done"). Fallback for cases where mentions are awkward.

**Everything else is ignored.** The bot does not read, process, or respond to general group conversation. This is important for privacy and to avoid burning AI tokens on irrelevant messages.

### Identity in groups

Each message in a group has a sender phone number. The bot resolves identity per-message:

```
1. Group message arrives with mention/prefix trigger
2. Extract sender phone number from the message
3. Look up sender: phone → userId (same as 1:1 flow)
4. If sender is not a registered Chillist user → respond: "I don't recognize your number. Sign up at chillist.app to use me."
5. If sender is registered but not a participant of the linked plan → respond: "You're not part of this plan."
6. If sender is valid → process the message in the context of the linked plan
```

### Session model for groups

Groups use a **different session model** than 1:1 chats:

```json
{
  "sessionType": "group",
  "groupId": "whatsapp-group-id-xxx",
  "linkedPlanId": "plan-1",
  "linkedPlanName": "Camping in the Golan",
  "linkedBy": "supabase-uid-xxx",
  "messageHistory": [
    { "role": "user", "sender": "Alex", "content": "What's left to bring?" },
    { "role": "assistant", "content": "Here are the unclaimed items:..." }
  ],
  "createdAt": "2026-03-16T10:00:00Z",
  "lastActiveAt": "2026-03-16T10:05:00Z"
}
```

Key differences from 1:1 sessions:

- **Session key:** WhatsApp group ID (not phone number)
- **No per-user plan selection:** The plan is fixed for the group
- **Shared message history:** All group members see the same conversation context
- **Per-message sender identification:** Each message resolves a different user
- **No `currentPlanId` ambiguity:** Always the linked plan

### Group-specific tools

In addition to the v1 tools, group chat adds:

#### Tool: linkPlan

- **Description:** Link this WhatsApp group to a Chillist plan
- **Parameters:** `planName` (string) — fuzzy-matched against the sender's plans
- **Access:** Only plan owners can link a group to their plan
- **Returns:** Confirmation with plan name and participant count

#### Tool: unlinkPlan

- **Description:** Remove the plan link from this group
- **Access:** Only the user who linked the plan (or plan owner) can unlink
- **Returns:** Confirmation

#### Tool: groupStatus

- **Description:** Quick summary of the plan for the group — total items, completed, unclaimed, who's responsible for what
- **Parameters:** none (uses the linked plan)
- **Returns:** Formatted summary

### Group-specific system prompt additions

```
Group chat rules:
- You are in a WhatsApp group linked to a specific plan
- Always address the person who mentioned you by name
- Keep responses extra short — groups are noisy, don't flood
- When listing items, show max 10 at a time with a "reply for more" option
- If someone asks to link a different plan, warn that it will replace the current link
- Never share private information about one participant with another
  (e.g., don't reveal someone's other plans)
```

### Edge cases

| Scenario | Behavior |
|----------|----------|
| Bot added to group, no plan linked yet | Bot only responds to "link" commands; all other messages get: "Link me to a plan first: @Chillist link [plan name]" |
| Plan is deleted in the app | Next bot interaction detects 404 from internal API → unlinks and notifies group |
| User removed from plan in the app | Bot responds to that user with "You're no longer part of this plan" |
| Someone tries to link a plan they don't own | Bot responds: "Only the plan owner can link a plan to this group" |
| Group has a linked plan, someone asks about a different plan | Bot responds: "This group is linked to [plan name]. Message me privately to check other plans." |
| Bot is removed from the group | Session persists in Redis but expires via TTL; no cleanup needed |

### Privacy considerations

- The bot **never** processes messages that don't mention it — no silent listening
- The bot **never** shares one user's plan data with another user who isn't a participant
- Group message history stored in Redis includes sender names — TTL ensures it doesn't persist indefinitely
- The bot should not reveal whether a non-participant user has a Chillist account (to avoid information leakage)

### Definition of Done (v1.5 — group chat)

- [ ] Bot detects group vs. 1:1 messages from Green API payload
- [ ] Mention-based trigger works (@mention detection)
- [ ] Prefix-based trigger works (/chillist, /cl)
- [ ] Non-triggered messages are silently ignored (no AI call, no response)
- [ ] `linkPlan` tool works — owner can link group to plan
- [ ] `unlinkPlan` tool works
- [ ] `groupStatus` tool provides plan summary
- [ ] Per-message sender identification works in groups
- [ ] Group session stored in Redis with group ID as key
- [ ] Unlinked groups only accept link commands
- [ ] Access control enforced per sender (not per group)
- [ ] Edge cases handled (deleted plan, removed participant, non-owner linking)

---

*Chillist — Internal Engineering Document*
*WhatsApp AI Chatbot Architecture Spec v1.0*
