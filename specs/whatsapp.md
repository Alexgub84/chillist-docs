# Chillist — WhatsApp Integration

> **Purpose:** Single source of truth for all WhatsApp-related features — current state, planned work, architecture, and BE/FE responsibilities.
> **Last updated:** 2026-03-15

---

## 1. Overview

WhatsApp is a core communication channel for Chillist. Two function categories:

1. **Send items list** — send the plan's item checklist to participants via WhatsApp.
2. **Invitation messaging** — send invitations, join-request notifications, and approval/rejection messages via WhatsApp.

---

## 2. Send Items List

### 2.1 BE API

**Endpoint:** `POST /plans/{planId}/send-list`

- **Auth:** JWT required. Caller must be a participant of the plan.
- **Body:** `{ phone: string }` — recipient phone in E.164 format.
- **Response:** `{ sent: boolean, messageId?: string, error?: string }`
- **Behavior:** Sends the **entire** item list for the plan, grouped by category (name, quantity, unit). Message language is determined by `plan.defaultLang`.

**Endpoint:** `POST /plans/{planId}/send-list-all`

- **Auth:** JWT required. Caller must be the plan owner.
- **Body:** none.
- **Response:** `{ total: number, sent: number, failed: number, results: Array<{ participantId, phone, sent, messageId?, error? }> }`
- **Behavior:** Sends the item list to every non-owner participant who has a phone number. Messages are sent in parallel. Response includes per-participant results.

**Limitations (no BE support yet):**

- Cannot filter by assignment (e.g., only items assigned to a specific participant).
- Cannot filter by assignment status (e.g., only unassigned items).
- Cannot filter by list type (e.g., buying list = pending, packing list = purchased).

### 2.2 FE — Current State

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

### 2.3 FE — Planned Changes

**Plan page (non-owner participant):**

- Move "Send list to me" from participant card to a button **above the items list** (near filter tabs).
- Label reflects current filter: "Send my buying list" / "Send my packing list" / "Send full list" (label-only for now — BE always sends full list).
- Disabled with tooltip if participant has no phone number.

**Plan page (owner):**

- Remove send-list buttons from participant cards entirely. Owner sends from manage-participants page instead.

**Manage-participants page (owner):**

- New WhatsApp menu (dropdown or button group) in the action bar:

| Option                               | BE support | Implementation                                                 |
| ------------------------------------ | ---------- | -------------------------------------------------------------- |
| Send item list to all participants   | ✅ Yes     | `POST /plans/{planId}/send-list-all` (dedicated bulk endpoint) |
| Send item list to chosen participant | ✅ Yes     | Participant picker, then `sendList()`                          |
| Send unassigned items to all         | ❌ No      | Disabled — needs BE `filter` param                             |
| Send unassigned items to selected    | ❌ No      | Disabled — needs BE `filter` param                             |

---

## 3. Invitation Messaging

> **Status:** Implemented (3 of 4 triggers). Rejection notification not yet sent.

### 3.1 Implemented Messages

| Trigger                     | Recipient   | BE status      | Message content                                                  |
| --------------------------- | ----------- | -------------- | ---------------------------------------------------------------- |
| Owner invites participant   | Participant | ✅ Implemented | Plan title, invite deep-link (`/invite/{planId}/{token}`)        |
| User submits join request   | Plan owner  | ✅ Implemented | Requester full name, plan title, deep-link to join-requests page |
| Owner approves join request | Requester   | ✅ Implemented | Plan title, confirmation, deep-link to plan                      |
| Owner rejects join request  | Requester   | ❌ Not sent    | —                                                                |

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

---

## 5. Post-MVP Stretch

- **Rejection notification:** Send WhatsApp message when owner rejects a join request.
- **Opt-in muting:** Participants can mute WhatsApp notifications per plan. Requires BE notification preferences + FE toggle.
- **Quick status updates via WhatsApp:** Participants reply to a notification to mark items as purchased/packed. Requires BE webhook for incoming WhatsApp messages.
- **Filtered send:** BE adds `filter` parameter to `POST /send-list` (e.g., `unassigned`, `participant:{id}`, `status:pending`).
- **WhatsApp bot:** Two-way conversation for plan updates, item check-offs, and reminders.

---

## 6. Related Docs

- [MVP Target — WhatsApp section](mvp-target.md#2-whatsapp-integration-basic)
- [Current Status — WhatsApp](current-status.md)
- [MVP Spec — Roadmap item #11](mvp-v1.md#5-roadmap-post-mvp)
- [Frontend Guide](../guides/frontend.md)
