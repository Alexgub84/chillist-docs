# Chillist — WhatsApp Integration

> **Purpose:** Single source of truth for all WhatsApp-related features — current state, planned work, architecture, and BE/FE responsibilities.
> **Last updated:** 2026-04-14

---

## 1. Overview

WhatsApp is a core communication channel for Chillist. Two function categories:

1. **Send items list** — send the plan's item checklist to participants via WhatsApp.
2. **Invitation messaging** — send invitations, join-request notifications, and approval/rejection messages via WhatsApp.

---

## 2. Send Items List

### 2.1 BE API — Current (to be replaced)

**Endpoint:** `POST /plans/{planId}/send-list` — sends full item list to one phone.
**Endpoint:** `POST /plans/{planId}/send-list-all` — sends full item list to all participants with phone.

Both will be **deprecated** and replaced by the unified endpoint below.

### 2.2 BE API — Unified Endpoint (planned)

**Endpoint:** `POST /plans/{planId}/send-list`

- **Auth:** JWT required. Caller must be a participant of the plan. `recipient: "all"` requires owner role.
- **Body:**

```json
{
  "recipient": "all" | "self" | "<participantId>",
  "listType": "full" | "buying" | "packing" | "unassigned"
}
```

- **`recipient`:**
  - `"all"` — send to every non-owner participant with a phone number. Owner-only.
  - `"self"` — send to the calling participant's own phone.
  - `"<participantId>"` — send to a specific participant by ID.

- **`listType`** (default: `"full"`):
  - `"full"` — all items (current behavior).
  - `"buying"` — items with at least one assignment in `pending` status (not yet purchased).
  - `"packing"` — items with at least one assignment in `purchased` status.
  - `"unassigned"` — items where `assignmentStatusList` is empty and `isAllParticipants` is false.

- **Response (unified for all recipient types):**

```json
{
  "results": [
    { "participantId": "...", "phone": "...", "sent": true, "messageId": "..." }
  ],
  "total": 1,
  "sent": 1,
  "failed": 0
}
```

Single-recipient calls (`"self"`, `"<participantId>"`) return `results` with one entry.

- **Filtering behavior with `recipient: "all"`:** Each participant receives their own filtered view. E.g., `"buying"` sends each participant only their own pending items.
- **Filtering behavior with specific recipient:** Filters the full plan item list by the specified `listType`.
- **Message language:** Determined by `plan.defaultLang`.
- **Migration:** The old `/send-list` (phone-based) and `/send-list-all` endpoints should be deprecated after FE migrates. The new endpoint uses `participantId` instead of raw phone numbers — the BE resolves the phone internally.

### 2.3 FE — Current State

**Plan page (`plan.$planId.lazy.tsx`):**

- **Owner** sees a green "Send list" button on each non-owner participant card and a "Send to all" link at the top of the Participants section.
- **Non-owner participant** sees a "Send list to me" button on their own card.
- Buttons only appear when `plan.items.length > 0`.
- If a participant has no `contactPhone`, clicking shows a toast error.
- `isSendingList` state disables buttons during send.

**Components and files:**

| File                                        | Role                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `src/routes/plan.$planId.lazy.tsx`          | `handleSendList`, `handleSendListToMe`, `handleSendListAll` handlers |
| `src/components/ParticipantDetails.tsx`     | Renders per-participant send button + "Send to all" link             |
| `src/components/shared/FloatingActions.tsx` | FAB with optional `onSendList` action (currently unused)             |
| `src/core/api.ts`                           | `sendList(planId, phone)` API call                                   |
| `src/i18n/locales/en.json` / `he.json`      | Keys under `sendList.*` and `inviteStatus.*`                         |

**Invite status badges (owner-only):**

- Each participant card shows an invite status badge with a WhatsApp icon: "Not sent", "Sent", or "Joined".
- Visible only to the plan owner.

### 2.4 FE — Planned Changes

**FE API layer (`src/core/api.ts`):**

- Replace `sendList(planId, phone)` and `handleSendListAll` loop with a single `sendList(planId, recipient, listType)` function calling the unified endpoint.
- Update response schema to match the new unified response.

**Plan page (non-owner participant):**

- Move "Send list to me" from participant card to a button **above the items list** (near filter tabs).
- Label reflects current filter: "Send my buying list" / "Send my packing list" / "Send full list".
- Calls unified endpoint with `recipient: "self"` + appropriate `listType`.
- Disabled with tooltip if participant has no phone number.

**Plan page (owner):**

- Remove send-list buttons from participant cards entirely. Owner sends from manage-participants page instead.

**Manage-participants page (owner):**

- New WhatsApp menu (dropdown or button group) in the action bar:

| Option                                    | `recipient`         | `listType`     |
| ----------------------------------------- | ------------------- | -------------- |
| Send full item list to all                | `"all"`             | `"full"`       |
| Send full item list to chosen participant | `"<participantId>"` | `"full"`       |
| Send buying list to all                   | `"all"`             | `"buying"`     |
| Send packing list to all                  | `"all"`             | `"packing"`    |
| Send unassigned items to all              | `"all"`             | `"unassigned"` |
| Send unassigned items to chosen           | `"<participantId>"` | `"unassigned"` |

---

## 3. Invitation Messaging

> **Status:** Implemented (3 of 4 triggers). Rejection notification not yet sent.

### 3.1 Messages

| Trigger                     | Recipient   | BE status      | Message content                 | Deep link in message                            |
| --------------------------- | ----------- | -------------- | ------------------------------- | ----------------------------------------------- |
| Owner invites participant   | Participant | ✅ Implemented | Plan title, invite link         | `/invite/{planId}/{token}`                      |
| User submits join request   | Plan owner  | ✅ Implemented | Requester full name, plan title | `/manage-participants/{planId}` (join requests) |
| Owner approves join request | Requester   | ✅ Implemented | Plan title, confirmation        | `/plan/{planId}`                                |
| Owner rejects join request  | Requester   | ❌ Not sent    | Plan title, rejection notice    | —                                               |

### 3.2 BE Implementation Details

- **Provider:** Green API (`HttpGreenApiClient`).
- **Delivery:** Fire-and-forget — `.then()` inside route handlers; does not block the HTTP response.
- **Audit:** Every send attempt is recorded in the `whatsapp_notifications` table (type: `invitation_sent | join_request_pending | join_request_approved`, status: `sent | failed`, messageId, error).
- **Invite status tracking:** On successful invitation send, the participant's `inviteStatus` field is updated from `pending` to `invited`. When the participant claims/joins, it becomes `accepted`.
- **Message templates:** Bilingual (en/he), resolved from `plan.defaultLang`. Defined in `src/services/whatsapp/messages.ts`.
- **No queue / no opt-in muting** — both deferred to post-MVP.

### 3.3 FE Requirements

- Notification preferences toggle per plan in participant settings (post-MVP — no BE support yet).
- No FE work needed for the actual sending — BE handles delivery.

---

## 4. Architecture & Conventions

### 4.1 FE Conventions

- **WhatsApp icon:** Use `WhatsAppIconSmall` component for all WhatsApp UI elements.
- **Send logic location:** Send-list handlers live in route files (`plan.$planId.lazy.tsx`, `manage-participants.$planId.lazy.tsx`), not in shared components.
- **Phone format:** All phone numbers must be E.164 before any API call. Use `normalizePhone()` + `isValidE164()` from `country-codes.ts`.
- **Invite status:** Owner-only information. Never expose to non-owner participants.
- **i18n keys:** All WhatsApp-related strings live under `sendList.*` and `inviteStatus.*` namespaces.
- **Data-testid:** All WhatsApp buttons must have `data-testid` attributes for E2E testing.

### 4.2 BE Architecture

**Service layer (`src/services/whatsapp/`):**

| File                   | Role                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `types.ts`             | `IWhatsAppService`, `IGreenApiClient`, `SendResult` types                                                 |
| `green-api.service.ts` | `HttpGreenApiClient` (real HTTP), `GreenApiWhatsAppService` (wraps client, phone→chatId), `phoneToChatId` |
| `fake.service.ts`      | `FakeGreenApiClient` — test double that fakes only the HTTP transport layer                               |
| `messages.ts`          | Bilingual message templates (en/he) for invite, join-request, approval, send-list                         |
| `index.ts`             | Factory + re-exports                                                                                      |

**Plugin (`src/plugins/whatsapp.ts`):**

- Registers `fastify.whatsapp` (type `IWhatsAppService`).
- Always wraps the client in `GreenApiWhatsAppService` so `phoneToChatId` and service logic run in all environments.
- Accepts `greenApiClient` option for test injection; defaults to `HttpGreenApiClient` (production) or `NoopGreenApiClient` (dev/fake).

**Database:**

- `whatsapp_notifications` table — audit log of every WhatsApp send attempt.
- `participants.inviteStatus` — enum `pending | invited | accepted`.

**Environment (`src/env.ts`):**

- `WHATSAPP_PROVIDER`: `green_api` | `fake` (default: `fake`).
- `GREEN_API_INSTANCE_ID`, `GREEN_API_TOKEN`: required when provider is `green_api`.
- Guards: `fake` is blocked in production; credentials are required for `green_api`.

**Testing:**

- `FakeGreenApiClient` replaces only the HTTP transport — all service logic (`phoneToChatId`, message formatting, notification recording) runs for real in tests.
- Injected via `buildApp` options: `{ whatsapp: { greenApiClient: fakeGreenApi } }`.
- Test assertions use `chatId` format (e.g., `972501234567@c.us`) since the fake sits below `phoneToChatId`.

### 4.3 Internal API (chatbot / WhatsApp service)

All under `/api/internal/*`, `x-service-key` = `CHATBOT_SERVICE_KEY`, plus `x-user-id` for the acting user **except** where noted.

| Method | Path | Headers | Purpose |
| ------ | ---- | ------- | ------- |
| `POST` | `/api/internal/auth/identify` | `x-service-key` only | Resolve E.164 phone → `userId` + display name (lookup on **`users.phone`** — see [phone-management.md](./phone-management.md)) |
| `GET` | `/api/internal/plans` | `x-service-key` + `x-user-id` | List user’s plans with summary counts (undated or `startDate` ≥ now UTC; past-dated plans omitted) |
| `POST` | `/api/internal/plans` | `x-service-key` + `x-user-id` | Create plan for that user; body `title` + optional metadata; owner name/phone resolved server-side (`InternalCreatePlanBody`). Optional `ownerPreferences` sets the owner participant’s RSVP (`pending` \| `confirmed` \| `not_sure`), `adultsCount` / `kidsCount` (integers ≥ 0), and `foodPreferences` / `allergies` (free text); omit or `null` for DB defaults. |
| `GET` | `/api/internal/plans/:planId` | `x-service-key` + `x-user-id` | Full plan: participants and items (chatbot field names; membership required) |
| `PATCH` | `/api/internal/items/:itemId/status` | `x-service-key` + `x-user-id` | Body `{ status: "done" \| "pending" }` — upserts caller’s assignment (`done` maps to `purchased` in DB) |
| `POST` | `/api/internal/plans/:planId/expenses` | `x-service-key` + `x-user-id` | Body `{ amount, description?, itemIds? }` — creates expense for caller's participant. Linked items auto-advance from `pending` to `purchased`. |
| `GET` | `/api/internal/plan-tags` | `x-service-key` only | **Global reference data** — full bundled taxonomy JSON (same document as public `GET /plan-tags`). No user context; safe to cache for the process lifetime. |

**Expenses — linking items after logging amount only:** There is no internal `PATCH` for expenses. If the user first logs an expense without `itemIds` and later wants to attach checklist items, the **app REST API** `PATCH /api/expenses/:expenseId` (JWT auth; body `itemIds` replaces the full list) validates plan membership and advances only newly added items from `pending` to `purchased`. The chatbot would need a user session path or a future internal update endpoint to do the same without JWT.

**Plan tags (`GET /api/internal/plan-tags`) — how the WhatsApp service should use it**

- **When:** Before guiding the user through “create a plan” (or whenever you need valid tag ids / labels). Fetch once at startup or on first use; re-fetch after deploy if you detect a higher `version` in the payload than you cached.
- **Auth:** Only `x-service-key`. Do **not** send `x-user-id` (not required and not used).
- **Payload:** A single JSON document (see `structural_contract` inside the file). **`selection_by_tier`** summarizes single vs multi for tier1, each universal flag, each tier2 axis, and tier3 defaults — use it for radio vs checkbox without scanning every nested `select`. **Every user-facing `label` is `{ en, he }`** — pick `en` or `he` from the user’s locale / last message language.
- **Stable ids:** Persist **`id` strings only** (e.g. `camping`, `food_strategy`, `tent_shared`). Never persist translated label text.
- **Flow (mirrors the app wizard):** `tier1` (single) → `universal_flags` → each applicable `tier2_axes` axis (filter by `shown_for_tier1`) → optional `tier3` drill-down keyed by the selected tier2 **option id** (`options_by_parent`).
- **Selection rules (important):**
  - **Multi-select flags:** `universal_flags.group_character` is multi with `max_select` and **`contradictions`** — pairs of option ids that cannot both be selected; if the user picks one, clear the other in each conflicting pair (same behavior as the app).
  - **Tier 3:** Default is **single-select** (one drill-down choice). Only parents listed in **`tier3.multi_select_parents`** allow multiple selections (today: `booked_activity`). For any other parent, treat tier3 as exactly one choice.
- **Bundles:** If an option has `injects_bundle` (e.g. `travel_abroad`), merge items from `item_generation_bundles[bundleName]` into the generated checklist (bilingual objects `{ en, he }`).

Full step-by-step contract, OpenAPI type name `PlanTagsResponse`, and changelog semantics: **[WhatsApp AI Chatbot spec — GET /api/internal/plan-tags](./whatsapp-chatbot-spec.md#get-apiinternalplan-tags-implemented)**. App BE source file: `chillist-be/src/data/plan-creation-tags.json` (version in root `version` field).

Contract details: `chillist-be/docs/openapi.json` (tag `internal`, operation `GET /api/internal/plan-tags`).

---

## 5. BE Action Items (before FE Phase 2)

Ordered by priority. FE Phase 2 depends on items 1 and 2.

### 5.1 Unified `/send-list` endpoint

Replace the current two endpoints (`/send-list` + `/send-list-all`) with the unified endpoint defined in section 2.2. This is the **main blocker** for FE work.

**Steps:**

1. Add `recipient` and `listType` params to the existing `/send-list` route.
2. Implement item filtering logic (buying, packing, unassigned).
3. For `recipient: "all"`, send per-participant filtered lists in parallel.
4. Return the unified response shape.
5. Keep the old `/send-list` (phone-based) working temporarily for backward compat.
6. Update OpenAPI spec and regenerate `openapi.json`.
7. Add integration tests for each `recipient` × `listType` combination.

### 5.2 Rejection notification

Add WhatsApp notification when owner rejects a join request. The other 3 triggers are already implemented — this completes the set.

**Steps:**

1. Add `join_request_rejected` type to `whatsapp_notifications` table enum.
2. Add rejection message template to `src/services/whatsapp/messages.ts` (en/he).
3. Fire notification in the `PATCH /join-requests/:id` handler when `status=rejected`.

### 5.3 Deprecate old endpoints

After FE migrates to the unified endpoint:

1. Remove `/send-list-all` route.
2. Remove `phone` body param from `/send-list` (now uses `recipient` only).

---

## 6. Post-MVP Stretch

- **Opt-in muting:** Participants can mute WhatsApp notifications per plan. Add `whatsappNotifications` boolean to participants table + FE toggle.
- **Quick status updates via WhatsApp:** Participants reply to a notification to mark items as purchased/packed. Requires BE webhook for incoming WhatsApp messages.
- **Plan update notifications:** Notify participants when items are added, RSVP changes, or plan details are updated.
- **WhatsApp bot:** Two-way conversation for plan updates, item check-offs, and reminders.

---

## 7. Related Docs

- [WhatsApp AI Chatbot spec — internal API & plan tags](./whatsapp-chatbot-spec.md) (full `GET /api/internal/plan-tags` contract)
- [MVP Target — WhatsApp section](../current/mvp-target.md#2-whatsapp-integration-basic)
- [Current Status — WhatsApp](../current/status.md)
- [MVP Spec — Roadmap item #11](mvp-v1.md#5-roadmap-post-mvp)
- [Frontend Guide](../guides/frontend.md)
