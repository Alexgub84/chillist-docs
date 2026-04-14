# Chillist — MVP Specification (v1.0)

> **Purpose:** Define a minimal, shippable product for organizing small trips/events with shared checklists. Optimized for rapid build, live testing, and FE/BE division of work.

---

## 1. Product Overview

- **One place** to create a plan (trip, dinner, picnic), invite participants, and track items to bring/buy.
- **Three item groups:** Group Equipment, Personal Equipment & Food.
- **Simple assignments:** Each item can be assigned to one or all participants, with per-person status tracking.
- **Shareable** plan link for participants to view, RSVP, and update item statuses.

**Non-goals (MVP):** Payments, offline sync, push notifications, calendar sync, advanced meals/portions engine.

---

## 2. Features

### 2.1 Plans

Create a plan for any group activity — a camping trip, a dinner party, a beach day. Each plan has a title, optional description, dates (single day or range), and a location with search. Plans have a status (draft, active, archived) and a visibility setting (public, invite-only, private) that controls who can see them.

The plans list shows all plans you own or are invited to. Filter by ownership (All / My plans / Invited) and by time (All / Upcoming / Past). With the All ownership filter, the list is grouped under **My plans** and **Invited** section headings; with My plans or Invited selected, the list is a single column without those headings. Each card shows the plan title, status badge, dates, location, and participant count.

Only the plan owner can edit or delete a plan. Admins can also delete any plan.

### 2.2 Participants & Roles

Every plan has participants with roles:

- **Owner** — full control: edit the plan, manage participants, assign items, approve join requests, transfer ownership.
- **Participant** — can add items, edit items assigned to them, self-assign unassigned items, and update their own preferences.
- **Viewer** — read-only access.

Plans can have multiple owners. The current owner can promote another participant via "Make owner" — both keep owner privileges.

Each participant has group details: number of adults and kids, food preferences, allergies, and free-text notes. The owner can edit anyone's preferences; participants can edit only their own. Per-person structured dietary data is stored in `dietaryMembers` (JSONB) — each adult/kid in the group gets their own diet enum and allergies array.

RSVP status (Pending / Confirmed / Not sure) is shown as a badge next to each participant. Only the plan owner can see RSVP statuses.

### 2.3 Items & Checklists

Items are the core of a plan — the shared checklist of everything the group needs to bring or buy. Each item has a name, category (Equipment or Food), quantity, unit, optional subcategory, and optional notes.

**Adding items:**

- Add a single item with full details.
- **Bulk add** from a library of 700+ suggested items organized by subcategory (e.g., Cooking Equipment, Fresh Vegetables, Dairy). Search, select, and add multiple items at once.

**Categories and grouping:**

- Items are grouped by category (Group Equipment / Personal Equipment / Food), then by subcategory. Items without a subcategory appear under "Other".
- Subcategories include things like Cooking & Heating, Lighting, First Aid, Fresh Produce, Beverages, Vegan, and many more.

**Views and filtering:**

- **All Items** — everything in the plan.
- **My Items** — only items assigned to you.
- **Buying List** — items still to be purchased. Checklist mode with checkboxes.
- **Packing List** — items purchased but not yet packed. Checklist mode with checkboxes.
- Filter by assigned participant.

**Inline editing:** Tap any item to edit its quantity, unit, or status directly. Equipment items always use "pieces" as the unit.

**Checklist mode:** In the Buying List and Packing List views, items show a checkbox. Checking an item triggers a strikethrough animation and advances the status (pending → purchased → packed).

### 2.4 Assignments

Items can be assigned to specific participants so everyone knows who's responsible for what.

- The owner can assign or reassign any item to any participant.
- Non-owners can self-assign unassigned items to themselves.
- **Assign to all:** mark an item as "for everyone" — it appears on every participant's list with individual status tracking.
- **Bulk assign** per subcategory: "Assign all [subcategory] items to [participant]".
- Each participant has their own status per item (pending → purchased → packed), so you can track who bought/packed what independently.

### 2.5 Invitations & Sharing

The owner can invite people to a plan in several ways:

**Invite link:** Each participant gets a unique invite link. The owner can copy it from the plan page or the Manage Participants screen and share it via WhatsApp, SMS, or any messaging app.

**Invite landing page:** When someone opens an invite link:

- **Signed-in users** are automatically added to the plan and redirected to it.
- **Not signed in** — they see the plan preview and can choose to sign in, sign up, or continue as a guest.

**Guest access (no account required):**

- Guests can view the plan, set their RSVP status, fill in their preferences (group size, dietary info), and add/edit items assigned to them.
- RSVP-gated: guests see plan details first, and the items section appears after they respond.
- Guests see limited participant info (display name and role only, no phone/email).

**Request to join:** If someone has a link to an invite-only plan but isn't a participant, they see a plan preview and a "Request to Join" form. The owner can approve or reject requests from the Manage Participants page.

### 2.6 Authentication & Profiles

**Sign up / Sign in:** Email + password or Google OAuth. Email confirmation required.

**Profile:** After signing up, users can complete their profile (name, phone, email). This info pre-fills when they create a plan or join one.

**Default preferences:** Users can set default food preferences, allergies, and equipment in their profile. These are pre-filled into new plans they create or join, but can be customized per plan.

**Session management:** JWT-based. Automatic token refresh. Session expiry shows a modal prompting re-authentication.

### 2.7 Manage Participants (Owner)

A dedicated page for plan owners to manage their group:

- View all participants with full details and preferences.
- Edit any participant's preferences.
- Add new participants manually.
- Transfer ownership ("Make owner").
- Regenerate invite tokens (if a link is compromised).
- **Join requests section:** see pending requests with the requester's details, and approve or reject them.

### 2.8 Weather

When a plan has a location and dates, a weather forecast is shown on the plan page. Daily forecasts with weather icons and labels (Clear, Partly cloudy, Rain, Snow, etc.).

### 2.9 Multilingual Support

The app supports English, Hebrew, and Spanish. All UI text is translated. A language toggle in the header switches languages instantly. Hebrew uses right-to-left layout. Language preference is saved locally.

### 2.10 Landing Page

A marketing home page with:

- **Hero** — two-column layout (stacked on small screens), badge, split headline with accent underline, subtitle, primary CTA (auth-aware: `/plans` vs `/signup`), secondary link to **How it works** (`#how-it-works`), hero image (`/hero.jpg` with gradient fallback).
- **How it works** — same three steps (create plan → add gear and food → track together) as styled cards with icons and sample UI chrome (not mobile screenshot strips).
- **Features** — five-tile bento grid: Centralized dashboard, WhatsApp, AI packing lists, Participant needs, Shared expenses (icons + copy, no per-feature screenshots on the page).
- **Bottom CTA** — dark band, headline + subheadline + tagline, primary (create plan / sign-up) and secondary (view plans) actions.
- **Footer** — logo, copyright, links to About and to `/about#privacy` / `/about#terms`.
- Scroll-reveal animations, full i18n (EN, HE, ES), RTL-safe layout. Legacy `npm run screenshots` assets (`step-*`, `feat-*` PNGs) may still exist in `public/` but are not required for the current landing layout.

### 2.11 Admin

Admin users (platform-level role, not per-plan) can:

- Open the admin dashboard at `/admin/plans` with tabs: **All Plans**, **AI Usage**, and **Chatbot AI**.
- View all plans regardless of visibility; the admin **All Plans** tab does not show the “create plan” CTA (creation stays on the main `/plans` flow).
- Delete any plan.
- See pending join requests across all plans.
- On **AI Usage**, view paginated AI usage logs and aggregated summary (tokens, cost, by feature/model) from `GET /admin/ai-usage` with filters; each row can be expanded for provider, language, timing/detail fields, metadata, and errors.
- On **Chatbot AI**, view paginated rows from `chatbot_ai_usage` via `GET /admin/chatbot-ai-usage` (read-only; table is written by the chatbot service), with filters (`userId`, `sessionId`, `chatType`, `status`, date range; URL keys `cbAi*`), optional **session type** filter All / Production / Quality test (`cbAiSessionType` — client-side; quality-test runs use `session_id` values prefixed with `qt-`), a **Test** column marking those rows, summaries (tokens, cost, by model, by chat type, by tool name), and expandable rows for session, message index, tool calls, and errors.

---

## 3. User Stories (MVP)

1. As an **owner**, I can create a plan with a title and dates.
2. As an **owner**, I can add participants and invite them via a shareable link.
3. As an **owner/participant**, I can add items (equipment/food), set quantities and units.
4. As a **participant**, I can assign an item to myself or be assigned by the owner.
5. As a **participant**, I can update item status (pending → purchased → packed).
6. As a **guest** with an invite link, I can view the plan, RSVP, set preferences, and add/edit my items — without creating an account.
7. As anyone with the **plan link**, I can request to join if I'm not yet a participant.

---

## 4. UX Flows

### Happy path (owner)

1. Sign up / sign in.
2. Create plan → add title, pick tags, optionally add description, then set dates, location.
3. Set your group preferences (adults, kids, dietary).
4. Add participants by name/phone, or share invite links.
5. Add items — single or bulk from the suggested library.
6. Assign items to participants (or let them self-assign).
7. Track progress as people mark items purchased and packed.

### Invited participant

1. Receive invite link via WhatsApp/SMS.
2. Open link → sign in (or continue as guest).
3. Set RSVP and preferences.
4. View items, add your own, self-assign unassigned ones.
5. Mark items as purchased/packed.

### Request to join

1. Open a plan link you're not a participant of.
2. See plan preview → fill in "Request to Join" form.
3. Wait for owner approval.
4. Once approved, full plan access.

---

## 5. Roadmap (Post-MVP)

1. ~~**Share link**~~ — Done.
2. ~~**Auth**~~ — Done.
3. ~~**User profiles**~~ — Done.
4. ~~**Permissions**~~ — Done.
5. ~~**Assignments**~~ — Done.
6. **Personalized views** — filter per participant.
7. **Meals → auto food list** (portions per person; day-by-day plan).
8. **Weather integration** with alerts (wind, rain).
9. **Swipe UI** on mobile for quick status change.
10. **Save participant presets** (what each person usually brings).
11. **WhatsApp/Telegram integration** for updates and quick check-offs via bot. See [WhatsApp spec](whatsapp.md) for full details.

---

## 6. Definition of Done (MVP)

- [x] Plans CRUD working end-to-end.
- [x] Participants CRUD working end-to-end.
- [x] Items CRUD working end-to-end (with inline editing).
- [x] Deployed FE (Cloudflare Pages) + BE (Railway).
- [x] OpenAPI spec generated and shared between repos.
- [x] CI/CD pipelines for both repos.
- [x] Share link — invite tokens, invite landing page, claim flow, guest preferences.
- [x] Assignments — per-participant tracking, bulk assign, assign-to-all.
- [x] Auth — JWT enforcement, guest auth via invite token, join requests, profiles.
- [ ] At least 1 real trip tested by team with 3+ participants.

---

---

# Technical Reference

> Everything below is implementation detail for developers — data models, API endpoints, stack, deployment, and implementation status tracking.

---

## T1. Core Entities

- **Participant**
  - `participantId`, `displayName`, `name`, `lastName`, `role` ("owner" | "participant" | "viewer"), optional: `avatarUrl`, `contactEmail`, `contactPhone`, `adultsCount`, `kidsCount`, `foodPreferences`, `allergies`, `notes`
  - `userId` — nullable Supabase UUID, set when a registered user claims this participant spot
  - `inviteToken` — unique 64-char hex for invite links
  - `inviteStatus` ("pending" | "invited" | "accepted"), `rsvpStatus` ("pending" | "confirmed" | "not_sure")
  - `lastActivityAt` — updated on each guest access via invite token
  - Scoped to a plan via `planId`
  - Timestamps: `createdAt`, `updatedAt`
- **Plan**
  - `planId`, `title`, optional: `description`, `location` (name/country/region/city/lat/lon/timezone), `startDate`, `endDate`, `tags[]` (3-tier taxonomy v1.2: tier 1 single-select plan type, tier 2 multi-select with mutex groups + cross-group rules, tier 3 multi-select specifics; legacy tag ids preserved on edit)
  - `ownerParticipantId`, `createdByUserId` (Supabase UUID of the plan creator)
  - `status` ("draft" | "active" | "archived"), `visibility` ("public" | "invite_only" | "private")
  - `defaultLang` (varchar(10), nullable) — ISO 639-1 language code for the plan UI (e.g. en, he)
  - `currency` (varchar(10), nullable) — ISO 4217 currency code (e.g. USD, EUR, ILS). Used as the currency for participant expenses.
  - Timestamps: `createdAt`, `updatedAt`
- **Item**
  - **GroupEquipmentItem** | **PersonalEquipmentItem** | **FoodItem** (discriminated by `category`)
  - Fields: `itemId`, `planId`, `name`, `category` ("group_equipment" | "personal_equipment" | "food"), `quantity`, `unit` ("pcs" | "kg" | "g" | "lb" | "oz" | "l" | "ml" | "m" | "cm" | "pack" | "set"), optional `subcategory`, optional `notes`
  - `isAllParticipants` (boolean) — when true, the item is assigned to all plan participants
  - `assignmentStatusList` (JSONB array of `{ participantId, status }`) — per-participant assignment and status tracking. Each entry tracks a participant's individual status ("pending" | "purchased" | "packed" | "canceled") for this item. No top-level `status` field — status is per-participant.
  - Timestamps: `createdAt`, `updatedAt`
- **ItemChange** (audit table)
  - `id`, `itemId`, `planId`, `changeType` ("created" | "updated"), `changes` (JSONB), optional `changedByUserId`, optional `changedByParticipantId`
  - Timestamps: `changedAt`
- **User** (managed by Supabase Auth, app preferences in `user_details`)
  - `id` (UUID, from Supabase `auth.users`), `email`, `role` ("authenticated"), `user_metadata` (display name, avatar from Google OAuth)
  - Identity (PII) lives in Supabase only. BE verifies JWTs via JWKS. FE reads user profile from Supabase session.
  - `user_details` table stores app-specific preferences (`foodPreferences`, `allergies`, `defaultEquipment`) keyed by Supabase UUID. Created lazily on first `PATCH /auth/profile`.
  - Users linked to plans via `plans.createdByUserId` and `participants.userId` (both plain Supabase UUID references, no FK).
- **ParticipantJoinRequest**
  - `requestId`, `planId`, `supabaseUserId`, `name`, `lastName`, `contactPhone`, optional: `contactEmail`, `displayName`, `adultsCount`, `kidsCount`, `foodPreferences`, `allergies`, `notes`
  - `status` ("pending" | "approved" | "rejected")
  - Unique constraint: one request per user per plan
  - Timestamps: `createdAt`, `updatedAt`
- **ParticipantExpense**
  - `expenseId`, `participantId`, `planId`, `amount` (numeric(10,2)), optional `description`, `itemIds` (JSONB array of item UUIDs, default `[]`), optional `createdByUserId`
  - Tracks individual expenses per participant within a plan. Currency is defined at the plan level (`plans.currency`). `itemIds` links the expense to specific items in the same plan — validated on create/update.
  - Timestamps: `createdAt`, `updatedAt`
- **AiUsageLog**
  - `id`, `featureType` ("item_suggestions"), `planId` (nullable FK to plans), `userId` (nullable Supabase UUID), `provider` (varchar), `modelId` (varchar), `lang` (nullable varchar), `status` ("success" | "partial" | "error")
  - Token tracking: `inputTokens`, `outputTokens`, `totalTokens` (all nullable integers)
  - `estimatedCost` (numeric(10,6), nullable) — computed from tokens × model pricing at insert time
  - `durationMs` (integer) — wall-clock time of the AI call
  - `promptLength` (nullable integer), `resultCount` (nullable integer), `errorMessage` (nullable text), `metadata` (nullable JSONB)
  - Timestamps: `createdAt`

---

## T2. API (REST) — Endpoints

> Full contract: `chillist-be/docs/openapi.json` (backend owns it, frontend fetches via `npm run api:fetch`)

Base URL: `/` (versioning can be added later: `/v1`)

### Health

- `GET /health` → `{ status: "healthy", database: "connected" }`

### Plans

- `GET /plans` → `Plan[]` (JWT required — returns only plans where user is owner or linked participant)
- `POST /plans` → `201 Plan` (JWT required — creates plan with owner participant, defaults to `invite_only` visibility)
- `GET /plans/:planId` → `PlanWithItems` (JWT required — plan + items + participants, access controlled)
- `GET /plans/:planId/preview` → plan preview (limited fields for non-participants)
- `PATCH /plans/:planId` → `Plan` (JWT required — owner/admin only)
- `DELETE /plans/:planId` → `{ ok: true }` (JWT required — owner/admin only)
- `GET /plans/pending-requests` → plans with pending join requests (JWT required — owner/admin)

### Admin

- `GET /admin/plans` → `Plan[]` (JWT required, admin only — returns all plans regardless of visibility)
- `GET /admin/ai-usage` → `{ logs, total, summary }` (JWT required, admin only — paginated AI usage logs with filters and aggregated summary. Query params: `planId`, `userId`, `featureType`, `status`, `from`, `to`, `limit`, `offset`)
- `GET /admin/chatbot-ai-usage` → `{ logs, total, summary }` (JWT required, admin only — paginated `chatbot_ai_usage` rows with filters and aggregated summary including by-tool counts. Query params: `userId`, `sessionId`, `chatType`, `status`, `from`, `to`, `limit`, `offset`). Quality-test traffic may use non-UUID `session_id` values prefixed with `qt-`; the admin UI filters Production vs Quality test client-side via URL `cbAiSessionType` and does not require a new query param on the API until server-side filtering is added.

### Participants

- `GET /plans/:planId/participants` → `Participant[]` (JWT required)
- `POST /plans/:planId/participants` → `201 Participant` (JWT required — owner only)
- `GET /participants/:participantId` → `Participant` (JWT required)
- `PATCH /participants/:participantId` → `Participant` (JWT required — owner/admin: any participant; linked participant: own record only)
- `DELETE /participants/:participantId` → `204` (JWT required — plan owner or the linked participant removing their own row; 403 if neither)
- `POST /plans/:planId/participants/:participantId/regenerate-token` → regenerate invite token (JWT required — owner only)

### Items

- `GET /plans/:planId/items` → `Item[]` (JWT required)
- `POST /plans/:planId/items` → `201 Item` (JWT required — with `assignmentStatusList` for per-participant tracking)
- `POST /plans/:planId/items/bulk` → bulk create items (JWT required)
- `PATCH /plans/:planId/items/bulk` → bulk update items (JWT required)
- `PATCH /items/:itemId` → `Item` (JWT required — owner: any item; participant: own assigned only)

### Join Requests

- `POST /plans/:planId/join-requests` → `201 JoinRequest` (JWT required — authenticated user submits a join request)
- `PATCH /plans/:planId/join-requests/:requestId` → `Participant | JoinRequest` (JWT required — owner/admin approves or rejects; body `{ status: 'approved' | 'rejected' }`)

### Invite (guest access via token in URL)

- `GET /plans/:planId/invite/:inviteToken` → plan data with `myParticipantId`, `myRsvpStatus`, `myPreferences` (filtered items, sanitized participants)
- `PATCH /plans/:planId/invite/:inviteToken/preferences` → update guest per-plan preferences (displayName, group size, dietary, rsvpStatus)
- `POST /plans/:planId/invite/:inviteToken/items` → create item auto-assigned to guest
- `PATCH /plans/:planId/invite/:inviteToken/items/:itemId` → update own assigned or unassigned item
- `POST /plans/:planId/invite/:inviteToken/items/bulk` → bulk create items auto-assigned to guest
- `PATCH /plans/:planId/invite/:inviteToken/items/bulk` → bulk update items (own assigned or unassigned)

### Claim

- `POST /plans/:planId/claim/:inviteToken` → link authenticated user to participant (JWT required)

### Expenses

- `GET /plans/:planId/expenses` → `{ expenses: Expense[], summary: [{ participantId, totalAmount }] }` (JWT required — all expenses for a plan with per-participant totals)
- `POST /plans/:planId/expenses` → `201 Expense` (JWT required — owner/admin: any participant; linked: own only. Body: `{ participantId, amount, description?, itemIds? }`)
- `PATCH /expenses/:expenseId` → `Expense` (JWT required — owner/admin: any; creator: own only)
- `DELETE /expenses/:expenseId` → `{ ok: true }` (JWT required — owner/admin: any; creator: own only)

### Auth

- `GET /auth/me` → `{ user: { id, email, role } }` (JWT required)
- `GET /auth/profile` → `{ user, preferences }` (JWT required — identity from JWT + preferences from `user_details`)
- `PATCH /auth/profile` → `{ user, preferences }` (JWT required — upserts `user_details` for default food prefs, allergies, equipment)
- `POST /auth/sync-profile` → sync profile metadata from Supabase (JWT required — called after `USER_UPDATED` events)

**Plan Tag Taxonomy:** ✅ FE implemented (2026-04-12)

- `GET /plan-tags` → `TaxonomyResponse` (JWT required — latest 3-tier tag taxonomy with version, tier labels, tier1 options, tier2 `options_by_parent` with `mutex_groups` + `cross_group_rules`, tier3 `options_by_parent`) — **FE: `usePlanTags` hook, `staleTime: Infinity`, Zod-validated via `planTagsSchema`**
- `GET /api/internal/plan-tags` → same response shape (x-service-key required, no x-user-id — for WhatsApp chatbot)

**Status codes:** `200` OK, `201` Created, `207` Multi-Status (bulk partial success), `400` Invalid, `401` Unauthorized, `403` Forbidden, `404` Not Found, `429` Rate Limited, `500` Internal Error, `503` Unavailable.

**Error format:** `{ message: string, code?: string }`

---

## T3. Stack

| Layer         | Planned                   | Actual                                                                                               |
| ------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| FE Framework  | React + Vite              | React 19 + Vite 7                                                                                    |
| FE Routing    | React Router              | TanStack Router (file-based, lazy routes)                                                            |
| FE Data       | React Query + Context     | TanStack React Query + custom fetch with Zod validation (`api.ts`) + openapi-fetch (`api-client.ts`) |
| FE Styling    | Tailwind CSS              | Tailwind CSS v4 (Vite plugin, no config file)                                                        |
| FE Forms      | —                         | React Hook Form + Zod resolvers                                                                      |
| FE Testing    | —                         | Vitest + React Testing Library + Playwright E2E                                                      |
| FE Deploy     | Vercel / Cloudflare Pages | Cloudflare Pages (GitHub Actions)                                                                    |
| BE Framework  | Fastify (TypeScript, ESM) | Fastify 5 (TypeScript, ESM)                                                                          |
| BE Validation | Zod (v1.1)                | Zod from day one (fastify-type-provider-zod)                                                         |
| BE Database   | In-memory → DynamoDB      | PostgreSQL (Drizzle ORM)                                                                             |
| BE Deploy     | Railway / Vercel / Fly.io | Railway (staging + production)                                                                       |
| API Contract  | —                         | OpenAPI 3.1 (auto-generated from Fastify schemas)                                                    |

### Non-Functional Requirements

- **MVP Platform:** Web app (desktop, tablet, mobile responsive).
- **FE Stack:** React 19 + Vite + Tailwind CSS v4; TanStack React Query; TanStack Router (file-based).
- **BE Stack:** Node.js 20+ + Fastify 5 (TypeScript, ESM), PostgreSQL (Drizzle ORM).
- **API Contract:** OpenAPI 3.1 auto-generated from Fastify Zod schemas. Backend owns the spec.
- **Quality:** ESLint + Prettier, TypeScript strict, Husky pre-push hooks, Vitest + Playwright.

---

## T4. Deployment & Security

- **FE:** Cloudflare Pages via GitHub Actions. See [Frontend Guide](../guides/frontend.md#cicd-github-actions--cloudflare-pages).
- **BE:** Railway via GitHub Actions. See [Backend Guide](../guides/backend.md#deployment-railway).
- **Database:** Railway-managed PostgreSQL with Drizzle migrations.
- **Security:** CORS restriction + Supabase JWT verification via JWKS (asymmetric keys, no secrets stored) + `@fastify/rate-limit` (100/min global, 10/min auth) + `@fastify/helmet` (security headers). API key removed in v1.14.1. See [Backend Guide — Security](../guides/backend.md#security).

---

## T5. Sharing & Access — Implementation Details

- **Share links:** Each participant has a unique `inviteToken` (64-char hex). `GET /plans/:planId/invite/:inviteToken` returns plan data with PII stripped.
- **Invite landing page** (`/invite/:planId/:inviteToken`): Auth-aware CTA — unauthenticated users see "Sign in to join" / "Create an account" linking to `/signin?redirect=/plan/:planId`, plus "Continue without signing in" which opens a preferences modal. Authenticated users are auto-redirected to `/plan/:planId` (invite claimed automatically). Sign-in and sign-up pages support `?redirect` param for post-auth navigation. **Invite claim flow:** clicking sign-in/sign-up from the invite page stores `{ planId, inviteToken }` in localStorage. Email auth: sign-in/sign-up pages await `claimInvite()` before navigating to the plan. OAuth: redirects to `/plan/:planId` directly; `AuthProvider.onAuthStateChange` claims the invite in the background. Guest preferences (v1.13.0): `PATCH /plans/:planId/invite/:inviteToken/preferences` — guests can update displayName, group size, dietary info, and RSVP status via invite link.
- **Supabase JWT auth:** FE signs up/in via Supabase directly (email+password or Google OAuth). BE verifies JWTs via JWKS. JWT enforced on all protected routes (v1.14.1). Guest auth via invite token in URL. Rate limiting + security headers active.
- **Auth-gated UI:**
  - **Plans list:** Signed-in users see "Create New Plan" link. Unauthenticated users see "Sign In" / "Sign Up" buttons.
  - **Plan detail — edit plan:** Only the plan owner sees the "Edit Plan" button.
  - **Plan detail — participant preferences:** Only the plan owner sees "Edit" buttons on participant cards.
  - **Plan detail — RSVP status:** Only visible to the plan owner.
  - **Plan detail — item edit permissions:** Owner can edit all items. Non-owner authenticated users can only edit items assigned to them. Guests can only edit items assigned to their `myParticipantId`. Permission controlled via `canEdit` prop on `ItemCard` and `canEditItem` callback on `CategorySection`.
  - **Plan detail — admin delete:** Only admin users (detected via `app_metadata.role`) see the delete button.
  - These checks are UX-only. The BE enforces access control via JWT verification.

---

## T6. Implementation Status

> Last updated: 2026-03-31

| Feature                   | Status      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plans CRUD                | Done        | Full REST API + FE screens. Delete plan UI with owner-only visibility + confirmation modal (issue #29). Admin delete button on plans list with confirmation modal (issue #103). **Leave plan (invited users, issue #203):** on the plans list, non-owner participants with a linked account see a leave control and confirmation dialog; calls `DELETE /participants/:participantId`. Plans list auth-aware CTA: signed-in users see "Create New Plan" link; unauthenticated users see "Sign In" / "Sign Up" buttons instead. **Plans list membership filter:** tabs for All / I own / Invited to — filters by `createdByUserId` and participant `userId`/`role`. Requires BE to return `createdByUserId` and `participants` (minimal: participantId, userId, role) in `GET /plans` response.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Participants CRUD         | Done        | Scoped to plans, role-based. Owner-only participant edit: only the plan owner sees "Edit" buttons on participant preference cards; non-owners and unauthenticated users see a read-only list. RSVP status badges (Pending/Confirmed/Not sure) displayed next to non-owner participants, visible only to the plan owner in both Group Details and Manage Participants modal. **Manage Participants route** (`/manage-participants/:planId`): owner-only page with existing participants (full details, edit preferences, make owner) and join requests section (issue #147). Owner-only card link on plan page (below forecast) navigates to this route. **Non-participant join request flow (done, issue #150):** `GET /plans/:planId` returns `{ status: 'not_participant', preview: { title, description, location, startDate, endDate }, joinRequest: null                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | JoinRequest }`for authenticated users who are not yet participants. FE shows a plan preview card plus a "Request to Join" form pre-filled from user profile metadata (name, phone, email, preferences). On submit:`POST /plans/:planId/join-requests`. If a request was already submitted, a status badge (Pending / Approved / Rejected) is shown instead of the form. Routes `items.$planId` and `manage-participants.$planId`also guard against this response shape and redirect to the plan page. **Join request management (done, issue #110):** Owner/admin can approve or reject pending join requests via`PATCH /plans/:planId/join-requests/:requestId`with body`{ status: 'approved' | 'rejected' }`. Approval creates a participant via `addParticipantToPlan()`service (pre-fills defaults from`user_details`). FE: Approve/Reject buttons shown on pending `JoinRequestCard` in Manage Participants page; buttons disabled during mutation; success/error toasts; query invalidation on success. Mock server implements both POST and PATCH join-request endpoints. |
| Items CRUD                | Done        | Group equipment/personal equipment/food categories, inline editing, permission-gated edit controls (`canEdit` prop)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AI item suggestions       | Done        | **BE:** `POST /plans/:planId/ai-suggestions` (JWT, no body; context from plan). `name`, `subcategory`, and `reason` follow `defaultLang` (en/he/es); `category` and `unit` stay English enums. AI may invent plan-specific subcategory labels. **FE (issue #195):** "Suggest items with AI" on plan creation step 5 (above bulk library). On the plan page and Manage Items route, **plan owner only:** inline button beside the Items heading and floating-menu action (non-owners do not see these). Calls AI endpoint, preview modal nested by category then subcategory (category- and subcategory-level select/deselect all), item checkboxes, quantity, reason text; confirms via `POST /plans/:planId/items/bulk`. `personal_equipment` uses `isAllParticipants`. After confirming AI suggestions during plan creation, the wizard closes and navigates to the plan. Errors 503 (retry), 404, 500. Mock server + E2E fixtures include the AI route. FE subcategory i18n refactor: issue #196. See [ai-item-generation.md](ai-item-generation.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Item status flow          | Done        | pending → purchased → packed → canceled (per-participant via `assignmentStatusList`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Bulk assign (subcategory) | Done        | Owner: assign any items to any participant. Non-owner: assign only unassigned items to themselves via "Assign all to…" per subcategory.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Status filtering          | Done        | Filter items by status on plan screen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Category grouping         | Done        | Items grouped by group equipment/personal equipment/food. Subcategory grouping: Category → Subcategory → Items (plan items list, items page, invite page). Items without subcategory go under translated "Other". **Multilingual subcategories (v1.25.0, issue #196):** subcategory values stored in the plan's language (en/he/es). Grouping uses stored string with locale-aware sorting. Subcategory autocomplete in item form shows localized suggestions. Bulk-add translates subcategories at creation time. AI and custom subcategories displayed as-is. **Vegan subcategory** added for plant-based/vegan food items; appears in BulkAddModal and plan item grouping.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| SEO & sharing metadata    | Done        | OG tags, Twitter Card, favicon, web manifest, logo in header                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Share link                | Done        | Invite token per participant, invite landing page, claim flow, guest preferences endpoint (v1.13.0). FE: copy/share buttons, auth-aware invite page, auto-claim for signed-in users.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Guest invite flow         | Done        | Invite API returns `myParticipantId`, `myRsvpStatus`, `myPreferences` (single source of truth). RSVP-gated flow: guests see plan details until they respond, then items section appears. Guest item CRUD via invite URL pattern.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Participant preferences   | Done        | Preferences modal (adults, kids, food prefs, allergies, notes) after plan creation for owner + edit per participant on plan detail page. Group Details section shows all participants' preferences. **Auto-prompt for participants:** when a participant visits the plan page and their preferences are incomplete (`adultsCount` is null OR `rsvpStatus` is `pending`), a PreferencesForm modal auto-opens with RSVP + headcount + dietary fields. The prompt can be skipped but returns on every visit until both headcount and RSVP are submitted. No backend changes needed — uses a frontend heuristic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Assignments               | Done        | Per-participant tracking via `assignmentStatusList` JSONB on items. `isAllParticipants` flag. Owner can assign/reassign any items; non-owners can self-assign. Bulk assign per subcategory.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Participant expenses      | Done        | **BE:** `participant_expenses` table with CRUD API (v1.21.0, PR #132). `GET /plans/:planId/expenses` returns flat list + per-participant totals. `POST /plans/:planId/expenses`, `PATCH /expenses/:expenseId`, `DELETE /expenses/:expenseId`. Access: owner/admin manage all, participants manage own (via `participant.userId`). `checkPlanAccess` enforced on all routes. Optional `itemIds` array links expenses to plan items (validated on create/update). 37 integration tests. **FE:** Dedicated `/expenses/$planId` route with auth guard. Zod schemas (`expense.ts`), API functions, React Query hooks. ExpensesView: per-participant summary, full expense list with edit/delete buttons (permission-gated). ExpenseForm with participant dropdown (owner) or auto-set (participant), amount, description, and multi-select item picker (collapsible, searchable, grouped by category then subcategory with bulk-select per subcategory, filtered by selected participant's assigned items, removable chips). Linked items displayed as blue chips on expense cards. Mock server handlers for all 4 endpoints. i18n keys in en/he/es. **Settlement summary (FE-only):** computes fair share per participant, shows per-person balance (overpaid/underpaid), and lists minimum transfers needed to settle up (greedy algorithm). Displayed as a dedicated card below the expenses summary. Pure frontend calculation using existing BE summary data. **Auto-status on expense (pending):** When an expense is created with linked `itemIds`, the BE should auto-advance those items' per-participant status from `pending` to `purchased` for the expense's participant (items already `packed` or `canceled` are untouched). FE invalidates plan query on expense create/update to reflect updated statuses. Mock server updated to mirror this behavior. |
| Plan detail fields        | Done        | `defaultLang` (ISO 639-1) and `currency` (ISO 4217) nullable columns on plans (v1.21.0, PR #132). Supported in create, update, and read. Currency used as plan-level setting for expense display.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Live item updates (WS)    | Done        | WebSocket for real-time item change notifications (issue #121). BE: `@fastify/websocket` plugin on `GET /plans/:planId/ws?token=<jwt>`, broadcasts `items:changed` on item create/update/bulk (auth + guest paths). FE: `usePlanWebSocket(planId)` hook connects on plan detail and items pages, invalidates React Query cache on message, reconnects with exponential backoff (1s–30s), stops on auth-failure close codes (4001/4003). No new dependencies (browser native WebSocket). 10 unit tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Weather                   | Not started | Optional forecast for plan location (FE has UI, BE integration pending)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Auth                      | Done        | Supabase JWT on BE + FE, guest auth via invite token, join requests, profile endpoints, rate limiting, security headers. API key removed (v1.14.1). JWT enforced on all routes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Browser session (FE)      | Done        | UUID v4 in `localStorage`, 15 min inactivity expiry, `X-Session-ID` on all requests (`api.ts` + `api-client.ts`), cleared on logout. **BE pending:** persist sessions table, structured logs — tracked separately.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| PostHog analytics (FE)    | Done        | `posthog-js` + `@posthog/react`. Client `src/lib/posthog.ts`; super props + identify/reset. Wired: `user_signed_in`, `user_signed_out`, `item_updated`. Further events: [chillist-fe#207](https://github.com/Alexgub84/chillist-fe/issues/207). See `guides/frontend.md` § Analytics.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| i18n (Hebrew + English)   | Done        | i18next + react-i18next. All UI text translated. Language toggle in header. RTL support for Hebrew. Language persisted to localStorage. Unit + E2E tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Home / Landing page       | Done        | Editorial layout: hero (two columns, brand tokens), card-based 3-step how-it-works, 5-tile feature bento, dark bottom CTA, footer with legal anchors on About. EN/HE/ES copy, scroll-reveal, auth-aware CTAs. Optional `/hero.jpg`. Legacy screenshot PNGs optional.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
