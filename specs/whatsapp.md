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

| Option                               | BE support | Implementation                                    |
| ------------------------------------ | ---------- | ------------------------------------------------- |
| Send item list to all participants   | ✅ Yes     | Loop `sendList()` for each participant with phone |
| Send item list to chosen participant | ✅ Yes     | Participant picker, then `sendList()`             |
| Send unassigned items to all         | ❌ No      | Disabled — needs BE `filter` param                |
| Send unassigned items to selected    | ❌ No      | Disabled — needs BE `filter` param                |

---

## 3. Invitation Messaging

> **Status:** Not implemented. Needs BE work.

### 3.1 Planned Messages

| Trigger                     | Recipient   | Message content                                 |
| --------------------------- | ----------- | ----------------------------------------------- |
| Owner invites participant   | Participant | Plan title, dates, invite link                  |
| User submits join request   | Plan owner  | Requester name, plan title, link to manage page |
| Owner approves join request | Requester   | Plan title, confirmation, link to plan          |
| Owner rejects join request  | Requester   | Plan title, rejection notice                    |

### 3.2 BE Requirements

- New notification service with WhatsApp adapter (Twilio or Meta Cloud API).
- Queue-based delivery (don't block request handlers).
- Opt-in: participants can mute notifications per plan.
- New endpoints or event hooks for triggering messages on invite/join-request/approve/reject actions.

### 3.3 FE Requirements

- Notification preferences toggle per plan in participant settings.
- No FE work needed for the actual sending — BE handles delivery.

---

## 4. Architecture & Conventions

- **WhatsApp icon:** Use `WhatsAppIconSmall` component for all WhatsApp UI elements.
- **Send logic location:** Send-list handlers live in route files (`plan.$planId.lazy.tsx`, `manage-participants.$planId.lazy.tsx`), not in shared components.
- **Phone format:** All phone numbers must be E.164 before any API call. Use `normalizePhone()` + `isValidE164()` from `country-codes.ts`.
- **Invite status:** Owner-only information. Never expose to non-owner participants.
- **i18n keys:** All WhatsApp-related strings live under `sendList.*` and `inviteStatus.*` namespaces.
- **Data-testid:** All WhatsApp buttons must have `data-testid` attributes for E2E testing.

---

## 5. Post-MVP Stretch

- **Quick status updates via WhatsApp:** Participants reply to a notification to mark items as purchased/packed. Requires BE webhook for incoming WhatsApp messages.
- **Filtered send:** BE adds `filter` parameter to `POST /send-list` (e.g., `unassigned`, `participant:{id}`, `status:pending`).
- **WhatsApp bot:** Two-way conversation for plan updates, item check-offs, and reminders.

---

## 6. Related Docs

- [MVP Target — WhatsApp section](mvp-target.md#2-whatsapp-integration-basic)
- [Current Status — WhatsApp](current-status.md)
- [MVP Spec — Roadmap item #11](mvp-v1.md#5-roadmap-post-mvp)
- [Frontend Guide](../guides/frontend.md)
