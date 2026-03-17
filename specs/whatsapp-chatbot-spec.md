# Chillist WhatsApp AI Chatbot — Architecture Spec v1.0

> **Status:** In Progress — Phase 3 BE work in progress
> **Scope:** This document defines the chatbot as a standalone service that communicates with the existing Chillist app backend via internal HTTP API. No implementation code is included.
> **Prerequisite:** WhatsApp Integration Phase 1 & 2 (notifications + list sharing via Green API) must be complete before chatbot work begins.
> **Last updated:** 2026-03-17 — Security & architecture review: service key rationale documented; session storage changed to DB-primary (`chatbot_sessions` + `chatbot_messages` tables); 15-min idle TTL; sign-up link on 404; ORDER BY determinism note on phone lookup.

---

## Implementation Phases

| Phase | Name                          | Status         | What it delivers                                                                                                                     |
| ----- | ----------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | Project Scaffold              | ✅ Done        | Fastify server + health endpoint, TypeScript, ESLint, Prettier, Husky, Vitest, Dockerfile, GitHub Actions CI/CD, Railway setup guide |
| **2** | Green API Webhook             | ✅ Done        | Receive incoming WhatsApp messages, parse them, identify user, reply with welcome/signup (no AI)                                     |
| **3** | User Identification           | 🚧 In Progress | Phone → user identity lookup via internal API on app BE (done) + session creation in Redis/Upstash (pending)                         |
| **4** | AI Layer + Tools              | Pending        | Vercel AI SDK, system prompt, tool definitions (getMyPlans, getPlanDetails, updateItemStatus) calling internal API                   |
| **5** | Session & Conversation Memory | Pending        | Redis-backed message history, TTL, context carry-over between messages                                                               |
| **6** | Polish & Hardening            | Pending        | Rate limiting, error handling, logging analysis, security review, production env var validation                                      |
| **7** | Group Chat (v1.5)             | Pending        | Mention/prefix triggers, linkPlan, group sessions (per Section 13)                                                                   |

> Phases 2–5 each require corresponding **app BE** work (internal routes, internal-auth plugin). Those BE changes will be called out in each phase's plan.
> Phase 3 app BE work is complete: `POST /api/internal/auth/identify` implemented with registered + guest user support.

---

## 1 — Product Overview

### What it does

An AI-powered chatbot that lets Chillist users interact with their plans entirely through WhatsApp. Users can ask about their plans, see item details, and update item statuses — all via natural language conversation in WhatsApp.

### Why it matters

Many Chillist users coordinate via WhatsApp group chats. The chatbot meets them where they already are, removing the need to open the app for quick queries and updates.

### v1 Feature Scope

| Feature            | Type  | Example user message             |
| ------------------ | ----- | -------------------------------- |
| Get my plans       | Read  | "What plans do I have?"          |
| Get plan details   | Read  | "Show me the camping trip items" |
| Update item status | Write | "Mark the tent as done"          |

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

### Two user types — mirroring FE routing

The Chillist frontend has two distinct access paths:

- **Signed-in users** → JWT → full access to all their plans
- **Guests** → invite token → access to a specific plan they were invited to (no Supabase account required)

The chatbot internal API mirrors this exactly:

- **Registered users** → identified by `userId` → chatbot uses `x-user-id` header on data routes
- **Guest users** → identified by `guestParticipants[]` → chatbot uses `x-guest-participant-id` header on data routes (v1.5)

Both user types are resolved through the same single endpoint: `POST /api/internal/auth/identify`.

### Lookup flow

```
1. WhatsApp message arrives with sender phone number (e.g., +972501234567)
2. Chatbot calls App BE: POST /api/internal/auth/identify
   Header: x-service-key: <CHATBOT_SERVICE_KEY>
   Body: { "phoneNumber": "+972501234567" }
3. App BE normalizes the phone number and queries the app database (two-step lookup)
4. App BE returns a union response — see below
5. Chatbot stores user identity in session for subsequent requests
```

### Phone number normalization

Phone numbers arrive in many formats depending on the device, country, and user. Before querying the database, the app BE normalizes them to **E.164 format** — a standardized international format:

```
E.164 format: +[country code][number]  →  e.g., +972501234567
```

Examples of inputs that all resolve to the same normalized phone:

| Input from WhatsApp | Normalized to   |
| ------------------- | --------------- |
| `+972501234567`     | `+972501234567` |
| `972501234567`      | `+972501234567` |
| `+972 50 123 4567`  | `+972501234567` |
| `+972-50-123-4567`  | `+972501234567` |
| `(972) 50 1234567`  | `+972501234567` |

Normalization logic: strip all spaces, dashes, and parentheses, then ensure the result starts with `+`. Implemented in `src/utils/phone.ts`.

**Important:** Phone numbers in the `participants` table are already stored in E.164 format (enforced by schema validation), so the normalized input matches the stored value directly.

### DB-based phone lookup (why no Supabase Admin API)

The app's `participants` table stores `contactPhone` (E.164) for every plan participant. When a participant accepts their invite (`POST /plans/:planId/claim/:inviteToken`), their Supabase `userId` is written to the same row.

This means the app database already contains a **`contactPhone → userId` mapping** for every user who has joined at least one plan. A single indexed query resolves any registered user:

```sql
SELECT user_id, name, last_name, display_name
FROM participants
WHERE contact_phone = $1
  AND user_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 1
```

This is O(1) with an index, not O(N) like a Supabase Admin user scan.

**Why `ORDER BY created_at DESC`:** The same phone number can appear in multiple participant rows across different plans. Without ordering, the result is non-deterministic across DB replicas and vacuums. Taking the most recently created row is stable and predictable.

**Coverage:** A user who registered in Supabase but has never accepted any plan invite will not be found by this query. For the chatbot, this is acceptable — if they have no plan membership, there is nothing for the chatbot to show them.

**No `SUPABASE_SERVICE_ROLE_KEY` needed.** The app BE does not use the Supabase Admin API for identification. No extra dependency, no elevated credentials.

### Guest user lookup

Guest users accessed a plan via invite link without creating a Supabase account. They have a `guest_profiles` row (with their phone) and a `participants` row with `guestProfileId` set.

If the registered lookup finds no match, the app BE checks `guest_profiles`:

```sql
-- Step 1: find guest profile by phone
SELECT guest_id, name, last_name
FROM guest_profiles
WHERE phone = $1
LIMIT 1

-- Step 2: find all their plan participations
SELECT participant_id, plan_id, display_name
FROM participants
WHERE guest_profile_id = $guestId
```

Guest users are returned with `userType: 'guest'` and the list of plans they can access.

### Response union type

The `/identify` endpoint returns one of two shapes (flat schema — no discriminator union in JSON Schema per backend rules):

```json
// Registered user
{
  "userType": "registered",
  "userId": "supabase-uid-xxx",
  "displayName": "Alex Cohen",
  "guestParticipants": null
}

// Guest user
{
  "userType": "guest",
  "userId": null,
  "displayName": "Dana Smith",
  "guestParticipants": [
    { "participantId": "p-uuid-1", "planId": "plan-uuid-1", "displayName": "Dana" }
  ]
}
```

### displayName resolution

For **registered users**: `participant.displayName ?? participant.name + ' ' + participant.lastName`

For **guest users**: `guestProfile.name + ' ' + guestProfile.lastName`

### Unidentified users

If the phone number is not found in either lookup (not in `participants` with a userId, not in `guest_profiles`), the app BE returns 404. The chatbot responds with a message **and a sign-up link**:

> "I don't recognize this number. Sign up for Chillist here: https://chillist.app/signup"

Note: A participant who was added to a plan but hasn't yet accepted their invite (their participant row has no `userId` and no `guestProfileId`) is also considered unidentified. The chatbot responds:

> "It looks like you haven't accepted your Chillist invite yet. Open the link you received to join your plan."

### No OTP / no login

v1 does not require OTP (One-Time Password) or any additional confirmation step. The WhatsApp phone number is the sole authentication factor. This is acceptable because:

- WhatsApp itself provides strong device-level authentication (SIM swap is not trivial)
- v1 scope is limited (read plans + update item status) — low risk
- Reduces friction for adoption

### Future upgrade path

If/when the chatbot gains higher-risk capabilities (create plans, manage participants, payments), introduce OTP confirmation on first interaction per device/number.

---

## 4 — Internal API Contract

The chatbot communicates with the app backend via dedicated internal routes. These routes are **not** exposed publicly — they are only accessible over Railway's private network and require a service key.

### What is service-key authentication?

Regular app routes use **JWT authentication**: the frontend sends a token signed by Supabase, and the app BE verifies it cryptographically. This works because the user is the one calling the API.

Internal routes are different — the **chatbot server** calls the app BE, not the user directly. There's no user JWT. Instead, both services share a **secret key** (`CHATBOT_SERVICE_KEY`), and the chatbot proves its identity by including that key in every request header.

This is called **service-to-service authentication** or a **shared secret / API key pattern**:

```
Chatbot Server                         App Backend
───────────────                        ───────────
knows CHATBOT_SERVICE_KEY  ─── x-service-key header ──→  validates header == env var
                                                          ✓ proceed  |  ✗ 401 Unauthorized
```

The key is a long random string (e.g., 32-64 hex characters), generated once and stored in both services' environment variables. It is never in code and never in logs.

**Why a service key at all?** Railway's private internal network already prevents external access to internal routes. The service key is **not** primarily defending against network interception — that threat is already mitigated. Its purpose is a cheap extra layer against _accidental internal misuse_: a bug in another internal service, a misconfigured route, or a developer mistake that accidentally hits an internal endpoint. Note: anyone with Railway-level access already has full DB access, so the key does not protect against that threat.

### Two-header pattern for data routes

Most internal routes need to know **which Chillist user** is making the request (to enforce access control). The chatbot passes the resolved user identity as a second header:

```
Header: x-service-key: <CHATBOT_SERVICE_KEY>      ← proves the caller is the chatbot
Header: x-user-id: <supabase-user-id>              ← registered user path
  OR
Header: x-guest-participant-id: <participantId>    ← guest user path (v1.5)
```

This mirrors the FE access patterns exactly:

- **JWT (signed-in users)** ↔ `x-user-id`
- **invite token (guest users)** ↔ `x-guest-participant-id`

**Exception: `/auth/identify` only needs `x-service-key`.** It does not have a user identity header because its whole purpose is to _resolve_ the user — the identity isn't known yet at this point.

### App BE `internal-auth` plugin

A new `internal-auth` Fastify plugin validates all `/api/internal/*` requests:

1. Check `x-service-key` header matches `CHATBOT_SERVICE_KEY` env var → 401 if missing or wrong.
2. Read `x-user-id` header if present → attach as `request.internalUserId`.
3. Route handlers receive `request.internalUserId` the same way public routes receive `request.user.id` from JWT.
4. Routes that require a userId (e.g., `GET /plans`) must check `request.internalUserId` is set.

This plugin is registered globally with `fp()` but only activates on paths starting with `/api/internal`. All existing public routes are unaffected.

### Routes

#### POST /api/internal/auth/identify

Resolves a WhatsApp phone number to a Chillist user — registered or guest. Only requires service key — no `x-user-id`.

```
Request:
  Header: x-service-key: <CHATBOT_SERVICE_KEY>
  Body: { "phoneNumber": "+972501234567" }

Response 200 — registered user:
  {
    "userType": "registered",
    "userId": "abc-123",
    "displayName": "Alex Cohen",
    "guestParticipants": null
  }

Response 200 — guest user:
  {
    "userType": "guest",
    "userId": null,
    "displayName": "Dana Smith",
    "guestParticipants": [
      { "participantId": "p-uuid-1", "planId": "plan-uuid-1", "displayName": "Dana" }
    ]
  }

Response 404:
  { "message": "User not found" }

Response 401:
  { "message": "Unauthorized" }   (wrong or missing service key)

Response 400:
  { "message": "." }   (schema validation — e.g., missing phoneNumber)
```

> **Why `{ message }` and not `{ error }`?** All app BE error responses use the `ErrorResponse` schema: `{ message: string }`. Using `{ error }` would be inconsistent and break any error-handling middleware the chatbot uses.

> **Chatbot session after identify:** For registered users, store `userId` and use `x-user-id` on all subsequent data route calls. For guest users, store the `guestParticipants[]` array — they can only access the plans listed there. `x-guest-participant-id` header support on data routes is planned for v1.5.

#### GET /api/internal/plans

Returns plans where the user is owner or participant. Requires both headers.

```
Request:
  Header: x-service-key: <CHATBOT_SERVICE_KEY>
  Header: x-user-id: <supabase-user-id>

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
  Header: x-service-key: <CHATBOT_SERVICE_KEY>
  Header: x-user-id: <supabase-user-id>

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
  { "message": "Access denied" }   (user is not a participant of this plan)

Response 404:
  { "message": "Plan not found" }
```

#### PATCH /api/internal/items/:itemId/status

Updates an item's status.

```
Request:
  Header: x-service-key: <CHATBOT_SERVICE_KEY>
  Header: x-user-id: <supabase-user-id>
  Body: { "status": "done" }

Response 200:
  { "item": { "id": "item-1", "name": "Tent", "status": "done" } }

Response 403:
  { "message": "Access denied" }

Response 404:
  { "message": "Item not found" }
```

### Access control

Internal routes reuse the **same access control logic** as public routes (e.g., `src/utils/plan-access.ts`). The userId from `x-user-id` is checked against plan participants. The chatbot cannot access plans the user isn't part of.

### Shared type definitions (chatbot API client reference)

These TypeScript types are derived directly from the app BE JSON schemas (`src/schemas/internal.schema.ts`, `src/schemas/participant.schema.ts`). Copy them into the chatbot service to type the API responses and session model.

#### `POST /api/internal/auth/identify` — types

Source: `src/schemas/internal.schema.ts`

```typescript
// Request body
interface IdentifyRequest {
  phoneNumber: string; // E.164 format, min 7 chars — normalize before sending
}

// Single entry in guestParticipants[]
interface GuestParticipantEntry {
  participantId: string; // UUID
  planId: string; // UUID
  displayName: string | null;
}

// Response (flat union — always check userType first)
interface IdentifyResponse {
  userType: "registered" | "guest";
  userId: string | null; // UUID — present only when userType === 'registered'
  displayName: string; // resolved from participant or guest profile
  guestParticipants: GuestParticipantEntry[] | null; // present only when userType === 'guest'
}
```

#### `Participant` — type (for future GET /plans/:planId internal route)

Source: `src/schemas/participant.schema.ts`

The internal plan-detail route will return participants in this shape. Note: `inviteToken` is hidden from non-owners; `contactPhone` is only visible in internal routes.

```typescript
interface Participant {
  participantId: string;
  planId: string;
  userId: string | null; // set after invite is claimed; null for pending/guests
  name: string;
  lastName: string;
  contactPhone: string; // E.164
  displayName: string | null;
  role: "owner" | "participant" | "viewer";
  avatarUrl: string | null;
  contactEmail: string | null;
  inviteToken: string | null; // hidden from non-owners
  inviteStatus: "pending" | "invited" | "accepted";
  rsvpStatus: "pending" | "confirmed" | "not_sure";
  lastActivityAt: string | null; // ISO 8601 datetime
  adultsCount: number | null;
  kidsCount: number | null;
  foodPreferences: string | null;
  allergies: string | null;
  notes: string | null;
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
}
```

#### Chatbot session type (derived from above)

```typescript
interface ChatbotSession {
  phoneNumber: string; // E.164 — Redis key
  userType: "registered" | "guest";
  userId: string | null; // set if userType === 'registered'
  guestParticipants: GuestParticipantEntry[] | null; // set if userType === 'guest'
  displayName: string;
  currentPlanId: string | null; // plan currently in focus for this conversation
  messageHistory: Array<{ role: "user" | "assistant"; content: string }>;
  createdAt: string; // ISO 8601
  lastActiveAt: string; // ISO 8601
}
```

### Security considerations for internal API

| Risk                        | Mitigation                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `CHATBOT_SERVICE_KEY` leaks | Stored only in Railway env vars. Never in code, never in logs. Rotatable at any time.          |
| Phone number logged         | App BE truncates phone to first 4 chars + `***` in all log lines.                              |
| Key brute-forced            | Rate limited: max 30 requests/min on `/identify`. Wrong key logs a `warn`.                     |
| Route exposed publicly      | Railway internal networking: `chatbot → app-be.railway.internal`. Not reachable from internet. |

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

Sessions are stored **in the app BE's PostgreSQL database** — not only Redis. This gives the team full visibility into chatbot usage for monitoring, debugging, and analytics. Redis/Upstash is optional and can be used as a read-cache by the chatbot service, but the source of truth is the DB.

### New DB tables (app BE migration required)

#### `chatbot_sessions`

| Column            | Type        | Notes                                                     |
| ----------------- | ----------- | --------------------------------------------------------- |
| `session_id`      | UUID PK     | Generated on creation                                     |
| `phone_number`    | text        | E.164 — one active session per phone at a time            |
| `user_id`         | UUID        | Supabase userId (null for guest sessions)                 |
| `current_plan_id` | UUID        | Nullable — plan currently in focus for this conversation  |
| `created_at`      | timestamptz |                                                           |
| `last_active_at`  | timestamptz | Updated on every message; used for idle expiry            |
| `expires_at`      | timestamptz | `last_active_at + 15 minutes`; recomputed on each message |

#### `chatbot_messages`

| Column        | Type        | Notes                                    |
| ------------- | ----------- | ---------------------------------------- |
| `message_id`  | UUID PK     |                                          |
| `session_id`  | UUID FK     | References `chatbot_sessions.session_id` |
| `sender_type` | text        | `'user'` or `'bot'`                      |
| `content`     | text        | Raw message text                         |
| `created_at`  | timestamptz |                                          |

Messages are also used as the AI conversation history (loaded in order for the current active session).

### Session model

Each WhatsApp phone number gets one active session at a time. The session represents both the AI conversation context and a monitoring/audit record.

```json
// Registered user session
{
  "sessionId": "sess-uuid-xxx",
  "phoneNumber": "+972501234567",
  "userType": "registered",
  "userId": "supabase-uid-xxx",
  "guestParticipants": null,
  "displayName": "Alex",
  "currentPlanId": "plan-1",
  "createdAt": "2026-03-16T10:00:00Z",
  "lastActiveAt": "2026-03-16T10:05:00Z",
  "expiresAt": "2026-03-16T10:20:00Z"
}

// Guest user session
{
  "sessionId": "sess-uuid-yyy",
  "phoneNumber": "+15550001234",
  "userType": "guest",
  "userId": null,
  "guestParticipants": [
    { "participantId": "p-uuid-1", "planId": "plan-uuid-1", "displayName": "Dana" }
  ],
  "displayName": "Dana Smith",
  "currentPlanId": "plan-uuid-1",
  "createdAt": "2026-03-16T10:00:00Z",
  "lastActiveAt": "2026-03-16T10:00:00Z",
  "expiresAt": "2026-03-16T10:15:00Z"
}
```

**Guest session notes:**

- `currentPlanId` defaults to the first (and often only) plan in `guestParticipants`
- If the guest is in multiple plans, the chatbot asks "Which plan? You're a guest in: [list]"
- Guest data routes use `x-guest-participant-id` (v1.5 — not yet implemented)
- Guest session details (DB table structure for `guestParticipants`) TBD

### TTL & limits

| Setting             | Value                                              | Rationale                                                                     |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| Session idle TTL    | **15 minutes** from last message                   | Short idle window keeps context fresh; stale context is worse than no context |
| Max message history | 20 messages (10 pairs) loaded for AI context       | Keeps token usage bounded; full history always available in DB for audit      |
| Re-identification   | On session expiry, re-lookup phone → user identity | Handles edge case of phone number transferred to a different user             |

> **Why 15 minutes (not 24 hours)?** Chatbot conversations are short bursts. If a user doesn't reply for 15 minutes they've mentally moved on. A fresh session on next contact avoids carrying stale AI context.

### First message flow

```
1. Message arrives from +972501234567
2. Call app BE: GET /api/internal/sessions?phone=+972501234567
   → returns active session if exists (expiresAt > now), else null
3a. If no active session:
    → call POST /api/internal/auth/identify
    → response: { userType, userId | null, displayName, guestParticipants | null }
    → call POST /api/internal/sessions to create session in DB
3b. If active session → load identity + recent messages for AI context
4. Build AI request with system prompt + last N messages + new user message
5. Process AI response → send to WhatsApp
6. Call POST /api/internal/sessions/:sessionId/messages to persist both messages
7. Call PATCH /api/internal/sessions/:sessionId to update lastActiveAt + expiresAt
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

| Component       | Technology                       | Notes                                                                                         |
| --------------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
| Runtime         | Node.js 20+, TypeScript          | Same as app BE for consistency                                                                |
| Framework       | Fastify 5                        | Same as app BE; could also be lightweight (Express/Hono) but Fastify keeps tooling consistent |
| AI SDK          | Vercel AI SDK (`ai` package)     | Provider-agnostic; supports Anthropic, OpenAI, others                                         |
| LLM Provider    | TBD (Anthropic or OpenAI)        | Decided at implementation time; AI SDK makes switching trivial                                |
| Session storage | PostgreSQL (app BE DB)           | `chatbot_sessions` + `chatbot_messages` tables; enables monitoring and audit logging          |
| Session cache   | Redis via Upstash (optional)     | Can be added for low-latency active-session reads; source of truth remains the DB             |
| WhatsApp API    | Green API                        | Shared instance with notification system                                                      |
| Hosting         | Railway (same project as app BE) | Private networking for internal API calls                                                     |
| User lookup     | Direct DB query                  | `participants` + `guest_profiles` tables; no Supabase Admin SDK needed                        |

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

# Session cache (optional — sessions are persisted in the app BE DB)
# Add only if using Redis as a read-cache for active sessions
# UPSTASH_REDIS_URL=
# UPSTASH_REDIS_TOKEN=

# Supabase
# Neither the chatbot server NOR the app BE uses SUPABASE_SERVICE_ROLE_KEY for user identification.
# Phone lookup is done via a direct DB query on the app BE's own database.
# The chatbot only needs APP_BE_INTERNAL_URL + CHATBOT_SERVICE_KEY to call /api/internal/auth/identify.
SUPABASE_URL=
```

---

## 9 — Deployment & Infrastructure

### Railway setup

```
Railway Project: chillist
├── Service: chillist-api        (existing app backend)
├── Service: chillist-chatbot    (new — this spec)
└── Database: PostgreSQL         (existing — chatbot_sessions + chatbot_messages added here)

# Redis/Upstash is optional (session read-cache only, not required for v1)
```

### Internal networking

- Chatbot → App BE: `http://chillist-api.railway.internal:<PORT>/api/internal/*`
- No public exposure needed for internal routes
- App BE's public routes remain unchanged

### Deploy process

- Chatbot has its own Dockerfile and deploy pipeline
- Can be deployed independently of the app BE
- Shares the Railway project for environment variable management

### Environment variable setup

#### What to generate once

```bash
# Generate CHATBOT_SERVICE_KEY — run this once, save the output
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store it somewhere safe (password manager). You will paste it into two places below.

---

#### Railway — `chillist-api` service (app BE)

> **Do this now** — the `POST /api/internal/auth/identify` endpoint is already live and requires this key.

| Variable              | Value                     | When    |
| --------------------- | ------------------------- | ------- |
| `CHATBOT_SERVICE_KEY` | `<generated 64-char hex>` | **Now** |

Go to: Railway → Project: chillist → Service: chillist-api → Variables → Add

---

#### Railway — `chillist-chatbot` service (chatbot server — Phase 3)

> Add these when the chatbot service is created in Railway.

| Variable                | Value                                       | Notes                             |
| ----------------------- | ------------------------------------------- | --------------------------------- |
| `CHATBOT_SERVICE_KEY`   | `<same value as chillist-api>`              | Must match exactly                |
| `APP_BE_INTERNAL_URL`   | `http://chillist-api.railway.internal:3333` | Adjust port if different          |
| `GREEN_API_INSTANCE_ID` | `<same as app BE>`                          | Shared instance                   |
| `GREEN_API_TOKEN`       | `<same as app BE>`                          | Shared instance                   |
| `AI_PROVIDER`           | `anthropic` or `openai`                     | TBD at implementation time        |
| `AI_API_KEY`            | `<provider API key>`                        |                                   |
| `UPSTASH_REDIS_URL`     | `<from Upstash dashboard>`                  | New Redis DB for chatbot sessions |
| `UPSTASH_REDIS_TOKEN`   | `<from Upstash dashboard>`                  |                                   |
| `NODE_ENV`              | `production`                                |                                   |
| `SUPABASE_URL`          | `<same as app BE>`                          | Only if chatbot needs JWT verify  |

---

#### GitHub Actions

No new secrets are required for regular CI. Integration tests set `CHATBOT_SERVICE_KEY` themselves in `beforeAll` using a test value.

The E2E pre-deploy test (`tests/e2e/internal-auth-prod.test.ts`) is **manual only** — it is skipped if env vars are missing. To run it before a deploy, set these locally in `.env`:

| Variable                | Value                                         |
| ----------------------- | --------------------------------------------- |
| `CHATBOT_SERVICE_KEY`   | `<production key from Railway>`               |
| `TEST_INTERNAL_PHONE`   | E.164 phone of a registered participant in DB |
| `TEST_INTERNAL_USER_ID` | Expected Supabase userId for that phone       |

---

## 10 — Security Considerations

| Concern               | Mitigation                                                                            |
| --------------------- | ------------------------------------------------------------------------------------- |
| Phone spoofing        | WhatsApp provides device-level verification; Green API relays verified sender numbers |
| Internal API exposure | `/api/internal/*` routes protected by service key; not exposed on public hostname     |
| Service key leakage   | Stored in Railway env vars; never in code; rotatable                                  |
| Excessive AI usage    | Per-user rate limiting on the chatbot side (e.g., max 50 messages/hour)               |
| Data access           | Chatbot can only access plans the user participates in (same access control as app)   |
| Session hijacking     | Sessions keyed by phone number; stored in app BE DB (Railway-access required)         |
| Prompt injection      | AI system prompt includes guardrails; tool definitions limit what the model can do    |

---

## 11 — Definition of Done (v1)

### Infrastructure

- [ ] Chatbot service created in Railway project
- [ ] Internal networking verified (chatbot can reach app BE on private network)
- [ ] Green API webhook updated to point to chatbot service
- [ ] All environment variables configured
- [ ] Upstash Redis provisioned (optional — only if adding session read-cache)

### App BE changes

- [x] `CHATBOT_SERVICE_KEY` env var added to `src/env.ts`, `src/config.ts`, `.env.example` (production refine)
- [x] `src/utils/phone.ts` — `normalizePhone()` utility created
- [x] `src/plugins/internal-auth.ts` — `x-service-key` validation plugin; attaches `request.internalUserId`
- [x] `src/routes/internal.route.ts` — `POST /api/internal/auth/identify` route (registered + guest)
- [x] `src/schemas/internal.schema.ts` — `IdentifyRequest`, `IdentifyResponse`, `GuestParticipantEntry` schemas
- [x] Unit tests: phone normalization, env guards
- [x] Integration tests: service key validation, registered lookup, guest lookup, 404, 400, phone normalization, route isolation
- [ ] DB migration: `chatbot_sessions` table
- [ ] DB migration: `chatbot_messages` table
- [ ] `GET /api/internal/sessions` route (lookup active session by phone)
- [ ] `POST /api/internal/sessions` route (create session)
- [ ] `PATCH /api/internal/sessions/:sessionId` route (update lastActiveAt + expiresAt)
- [ ] `POST /api/internal/sessions/:sessionId/messages` route (append message)
- [ ] `GET /api/internal/plans` route implemented (reuses existing service functions)
- [ ] `GET /api/internal/plans/:planId` route implemented (reuses existing service functions)
- [ ] `PATCH /api/internal/items/:itemId/status` route implemented (reuses existing service functions)
- [ ] Internal data routes: access control enforced (registered via `x-user-id`, guest via `x-guest-participant-id` — v1.5)

### Chatbot service

- [ ] Green API webhook endpoint receives and parses incoming messages
- [ ] Phone → user identity identification works via internal API (registered + guest)
- [ ] Unregistered / pending-invite phones receive a friendly rejection message
- [ ] AI SDK configured with tools (getMyPlans, getPlanDetails, updateItemStatus)
- [ ] System prompt produces natural, short, WhatsApp-friendly responses
- [ ] Language auto-detection works (Hebrew and English)
- [ ] Session created in app BE DB on first message, loaded on subsequent messages
- [ ] Sessions expire after **15 minutes** of inactivity
- [ ] Last 20 messages loaded for AI context per session
- [ ] Plan name fuzzy matching works for natural references

### Testing

- [ ] Integration tests for all internal API routes (app BE side)
- [ ] Unit tests for session management logic
- [ ] Unit tests for phone → user resolution
- [ ] AI tool calls tested with mocked AI responses
- [ ] End-to-end manual test: real WhatsApp message → chatbot → correct response

---

## 12 — Open Questions & Future Considerations

| Question                  | Status     | Notes                                                                                                                              |
| ------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| NPM shared schema package | Deferred   | Not needed for v1 since chatbot doesn't access DB directly; revisit if direct DB access is added                                   |
| **Concurrent edits**      | 🚩 Flagged | Same item edited simultaneously from WhatsApp and frontend — last-write-wins for now; needs design before write operations go live |
| **Guest session details** | TBD        | DB table structure for guest chatbot sessions (guestProfileId vs userId) needs design                                              |
| Group chat support        | v1.5       | Designed in Section 13; implement after v1 1:1 chat is stable                                                                      |
| Create plan via chatbot   | v2         | Requires more complex tool definitions and write access                                                                            |
| Add/remove items          | v2         | Requires item creation logic in internal API                                                                                       |
| OTP confirmation          | Future     | Add when higher-risk write operations are introduced                                                                               |
| Billing / usage metering  | Future     | Track AI API costs per user if monetizing chatbot as premium feature                                                               |
| Fallback when AI is down  | TBD        | Options: queue messages for retry, or respond with "I'm having trouble, try the app"                                               |
| Green API consolidation   | Future     | Move all WhatsApp sending to chatbot service; app BE requests sends via internal API                                               |

---

## 13 — Group Chat Support (v1.5)

### Overview

The chatbot can be added to a WhatsApp group where plan participants coordinate. Instead of each person messaging the bot privately, the group becomes a shared interface for a specific plan.

### How the bot gets activated in a group

1. Someone adds the chatbot's WhatsApp number to the group
2. The bot sends an introduction message: "Hi! I'm the Chillist Bot. To link me to a plan, say: @Chillist link [plan name]"
3. A registered user mentions the bot with a plan name
4. The bot resolves the user via `/api/internal/auth/identify`, finds the plan, and links the group to that plan
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
3. Look up sender: `POST /api/internal/auth/identify` with sender phone → `{ userType, userId | guestParticipants }`
4. If sender is not found (404) → respond: "I don't recognize your number. Sign up at chillist.app to use me."
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

| Scenario                                                     | Behavior                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Bot added to group, no plan linked yet                       | Bot only responds to "link" commands; all other messages get: "Link me to a plan first: @Chillist link [plan name]" |
| Plan is deleted in the app                                   | Next bot interaction detects 404 from internal API → unlinks and notifies group                                     |
| User removed from plan in the app                            | Bot responds to that user with "You're no longer part of this plan"                                                 |
| Someone tries to link a plan they don't own                  | Bot responds: "Only the plan owner can link a plan to this group"                                                   |
| Group has a linked plan, someone asks about a different plan | Bot responds: "This group is linked to [plan name]. Message me privately to check other plans."                     |
| Bot is removed from the group                                | Session persists in Redis but expires via TTL; no cleanup needed                                                    |

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

_Chillist — Internal Engineering Document_
_WhatsApp AI Chatbot Architecture Spec v1.0_
