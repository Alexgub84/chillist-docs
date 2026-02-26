# Chillist — MVP Specification (v1.0)

> **Purpose:** Define a minimal, shippable product for organizing small trips/events with shared checklists. Optimized for rapid build, live testing, and FE/BE division of work.

---

## Implementation Status

> Last updated: 2026-02-26

| Feature | Status | Notes |
|---------|--------|-------|
| Plans CRUD | Done | Full REST API + FE screens. Delete plan UI with owner-only visibility + confirmation modal (issue #29). Admin delete button on plans list with confirmation modal (issue #103). Plans list auth-aware CTA: signed-in users see "Create New Plan" link; unauthenticated users see "Sign In" / "Sign Up" buttons instead. **Plans list membership filter:** tabs for All / I own / Invited to — filters by `createdByUserId` and participant `userId`/`role`. Requires BE to return `createdByUserId` and `participants` (minimal: participantId, userId, role) in `GET /plans` response. |
| Participants CRUD | Done | Scoped to plans, role-based. Owner-only participant edit: only the plan owner sees "Edit" buttons on participant preference cards; non-owners and unauthenticated users see a read-only list. RSVP status badges (Pending/Confirmed/Not sure) displayed next to non-owner participants, visible only to the plan owner in both Group Details and Manage Participants modal. |
| Items CRUD | Done | Equipment/food categories, inline editing, permission-gated edit controls (`canEdit` prop) |
| Item status flow | Done | pending → purchased → packed → canceled |
| Bulk assign (subcategory) | Done | Owner: assign any items to any participant. Non-owner: assign only unassigned items to themselves via "Assign all to…" per subcategory. |
| Status filtering | Done | Filter items by status on plan screen |
| Category grouping | Done | Items grouped by equipment/food. Subcategory grouping: Category → Subcategory → Items (plan items list, items page, invite page). Items without subcategory go under "Other". **Vegan subcategory** added for plant-based/vegan food items (tofu, tempeh, vegan cheese, veggie burgers, etc.); appears in BulkAddModal and plan item grouping. |
| SEO & sharing metadata | Done | OG tags, Twitter Card, favicon, web manifest, logo in header |
| Share link | Done | Invite token per participant, public `GET /plans/:planId/invite/:inviteToken` endpoint. FE: copy/share buttons in Manage Participants modal and Group Details section. Invite landing page at `/invite/:planId/:inviteToken` — read-only plan view with auth-aware CTA: unauthenticated users see "Sign in to join" / "Create an account" linking to `/signin?redirect=/plan/:planId`; authenticated users are auto-redirected to `/plan/:planId` (invite is claimed automatically). Sign-in and sign-up pages support `?redirect` search param for post-auth navigation. Mock server + E2E tests. Issue #60, #101. **Invite claim flow (issue #109 — fixed):** Email auth awaits `claimInvite()` before navigation. OAuth redirects to `/plan/:planId` directly; AuthProvider claims in background. Invite page auto-claims and redirects authenticated users. Guest preferences modal stays on invite page (no redirect to auth-gated route). **Remaining:** `PATCH /plans/:planId/invite/:inviteToken/preferences` endpoint not yet implemented in BE (guest preferences save returns 404 in production). |
| Guest invite flow redesign | Done | Invite API returns `myParticipantId`, `myRsvpStatus`, `myPreferences` (single source of truth, no localStorage). RSVP field (confirmed/not_sure) added to PreferencesForm as styled radio buttons. RSVP-gated flow: unauthenticated guests see plan details only until they respond; after RSVP, items section appears with add/edit capability. Edit button next to guest's name in participants list to re-open preferences. Guest item CRUD via `POST/PATCH /plans/:planId/invite/:inviteToken/items[/:itemId]` — items auto-assigned to guest, guests can only edit their own. Mock server endpoints + FE API helpers implemented. i18n keys added (en + he). |
| Participant preferences | Done | Preferences modal (adults, kids, food prefs, allergies, notes) after plan creation for owner + edit per participant on plan detail page. Group Details section shows all participants' preferences. |
| Assignments | Partial | DB table exists (`item_assignments`), API routes not implemented |
| Weather | Not started | Optional forecast for plan location |
| Auth | In progress | Phase 1 (invite tokens) done. Phase 2 (BE JWT via JWKS) done. Phase 3 (FE sign-up/sign-in/OAuth + JWT injection) done. Phase 4 (user management schema) done: `guest_profiles`, `user_details`, `plan_invites` tables added; `createdByUserId` on plans, `userId`/`guestProfileId`/`inviteStatus` on participants; Supabase is single PII store. Phase 5 (opportunistic user tracking) done: records userId when JWT present. Phase 6 (profile endpoints + security hardening) done: `GET/PATCH /auth/profile`, `@fastify/rate-limit` (100/min global, 10/min auth), `@fastify/helmet`. Phase 7 (plan ownership + access control) — FE done: JWT sent on all API requests, 401 retry with token refresh, AuthErrorModal for session expiry, 404 handling for access-denied plans, visibility gating by auth state (authed: private/invite_only, unauthed: public only), plans list auth-aware CTA (signed-in: "Create New Plan"; unauthenticated: "Sign In"/"Sign Up"), owner-only participant edit (non-owners see read-only preferences), RSVP status display (owner-only), and profile metadata sync propagation via `POST /auth/sync-profile` after `USER_UPDATED` (refresh JWT first, fire-and-forget). BE: `unlisted` renamed to `invite_only` in visibility enum. Google OAuth on sign-in and sign-up. Profile completion page. Owner pre-fill from session. E2E tests deferred (#67). |
| i18n (Hebrew + English) | Done | i18next + react-i18next. All UI text translated. Language toggle in header. RTL support for Hebrew. Language persisted to localStorage. Unit + E2E tests. |
| Home / Landing page | Done | Hero section with campfire photo, 3-step "How it works" onboarding (Create a plan → Add gear/food → Track together) with mobile app screenshots per language (EN/HE), scroll-reveal animations, auth-aware CTAs. Screenshot script: `npm run screenshots`. |

### Stack (Actual vs Planned)

| Layer | Planned | Actual |
|-------|---------|--------|
| FE Framework | React + Vite | React 19 + Vite 7 |
| FE Routing | React Router | TanStack Router (file-based, lazy routes) |
| FE Data | React Query + Context | TanStack React Query + custom fetch with Zod validation (`api.ts`) + openapi-fetch (`api-client.ts`) |
| FE Styling | Tailwind CSS | Tailwind CSS v4 (Vite plugin, no config file) |
| FE Forms | — | React Hook Form + Zod resolvers |
| FE Testing | — | Vitest + React Testing Library + Playwright E2E |
| FE Deploy | Vercel / Cloudflare Pages | Cloudflare Pages (GitHub Actions) |
| BE Framework | Fastify (TypeScript, ESM) | Fastify 5 (TypeScript, ESM) |
| BE Validation | Zod (v1.1) | Zod from day one (fastify-type-provider-zod) |
| BE Database | In-memory → DynamoDB | PostgreSQL (Drizzle ORM) |
| BE Deploy | Railway / Vercel / Fly.io | Railway (staging + production) |
| API Contract | — | OpenAPI 3.1 (auto-generated from Fastify schemas) |

---

## 1. Product Overview

- **One place** to create a plan (trip, dinner, picnic), invite participants, and track items to bring/buy.
- **Two item groups:** Equipment & Food.
- **Simple assignments:** Each item can be assigned to a participant (full or partial responsibility).
- **Shareable** plan link for participants to view/update statuses (MVP: public; optional name-only session).

**Non-goals (MVP):** Payments, complex permissions, offline sync, push notifications, calendar sync, advanced meals/portions engine.

---

## 2. Core Entities

- **Participant**
  - `participantId`, `displayName`, `name`, `lastName`, `role` ("owner" | "participant" | "viewer"), optional: `avatarUrl`, `contactEmail`, `contactPhone`, `adultsCount`, `kidsCount`, `foodPreferences`, `allergies`, `notes`
  - Scoped to a plan via `planId`
  - Timestamps: `createdAt`, `updatedAt`
- **Plan**
  - `planId`, `title`, optional: `description`, `location` (name/country/region/city/lat/lon/timezone), `startDate`, `endDate`, `tags[]`
  - `ownerParticipantId`, `status` ("draft" | "active" | "archived"), `visibility` ("public" | "invite_only" | "private")
  - Timestamps: `createdAt`, `updatedAt`
- **Items**
  - **EquipmentItem** | **FoodItem** (discriminated by `category`)
  - Fields: `itemId`, `planId`, `name`, `category` ("equipment" | "food"), `quantity`, `unit` ("pcs" | "kg" | "g" | "lb" | "oz" | "l" | "ml" | "pack" | "set"), `status` ("pending" | "purchased" | "packed" | "canceled"), optional `notes`, optional `assignedParticipantId`
  - Timestamps: `createdAt`, `updatedAt`
- **ItemAssignment** (DB table exists, API routes not yet implemented)
  - `assignmentId`, `planId`, `itemId`, `participantId`, optional: `quantityAssigned`, `notes`, `isConfirmed`
  - Timestamps: `createdAt`, `updatedAt`
- **User** (managed by Supabase Auth, not stored in our DB)
  - `id` (UUID, from Supabase `auth.users`), `email`, `role` ("authenticated"), `user_metadata` (display name, avatar from Google OAuth)
  - Identity lives in Supabase. BE verifies JWTs via JWKS. FE reads user profile from Supabase session.
  - No `users`/`profiles` table in our DB yet. Will add when needed (Step 3: Permissions) to link users to plans/participants.
- **Weather** (not yet implemented)
  - `WeatherBundle` (current + daily forecast) fetched for plan.location; non-blocking.

---

## 3. User Stories (MVP)

1. As an **owner**, I can create a plan with a title and dates.
2. As an **owner**, I can add participants (names only are enough for MVP).
3. As an **owner/participant**, I can add items (equipment/food), set quantities and units.
4. As a **participant**, I can assign an item to myself or be assigned by the owner.
5. As a **participant**, I can update item status (pending → purchased → packed).
6. As anyone with the **share link**, I can view the plan's items and see who brings what.
7. Optional: As a **viewer**, I can see read-only details.

---

## 4. Feature Scope

### 4.1 Plans
- CRUD plans.
- Plan screen shows participants, items grouped by category, and completion stats.

### 4.2 Participants
- Add/remove participants to a plan.
- Role: "owner" (full edit), "participant" (update items & self-assign), "viewer" (read-only).
- Plans can have multiple owners. The current owner can promote another participant to owner via "Make owner" (confirmation modal). Both keep owner privileges.
- Only plan owners can edit participant preferences (adults, kids, food prefs, allergies, notes). Non-owners and unauthenticated users see a read-only participant list.
- RSVP status (`pending` | `confirmed` | `not_sure`) is displayed as a badge next to each non-owner participant. Only plan owners can see RSVP statuses (in Group Details and Manage Participants modal).

### 4.3 Items
- Add item (name, category, quantity, unit, notes, status).
- Group by category; filter by status; simple text search.
- Inline editing for quantity, unit, and status fields.
- Equipment items always use "pcs" as the unit. Food items require a unit.
- Checklist mode: in Buying List / Packing List filtered views, items show a checkbox instead of the status dropdown. Checking an item triggers strikethrough + fade animation then advances the status (pending → purchased, purchased → packed). Details are read-only in this mode.
- Bulk: change status to "packed" or "purchased" for selected items (optional nice-to-have).

### 4.4 Assignments
- Assign item to participant; optional partial quantity (e.g., water 10× → Alex 6, Sasha 4).
- Show responsibility per person.

### 4.5 Weather (optional, non-blocking)
- Fetch and show a 3–5 day forecast for the plan location.

---

## 5. Non-Functional Requirements

- **MVP Platform:** Web app (desktop, tablet, mobile responsive).
- **FE Stack:** React 19 + Vite + Tailwind CSS v4; TanStack React Query; TanStack Router (file-based).
- **BE Stack:** Node.js 20+ + Fastify 5 (TypeScript, ESM), PostgreSQL (Drizzle ORM).
- **API Contract:** OpenAPI 3.1 auto-generated from Fastify Zod schemas. Backend owns the spec.
- **Deployment:**
  - FE: Cloudflare Pages via GitHub Actions.
  - BE: Railway (staging + production environments).
- **Quality:** ESLint + Prettier, TypeScript strict, Husky pre-push hooks, Vitest + Playwright.
- **Security:** CORS restriction + API key (legacy) + Supabase JWT verification via JWKS. See [Backend Guide — Security](../guides/backend.md#security).

---

## 6. API (REST) — Endpoints

> Full contract: `chillist-be/docs/openapi.json` (backend owns it, frontend fetches via `npm run api:fetch`)

Base URL: `/` (versioning can be added later: `/v1`)

### Health
- `GET /health` → `{ status: "healthy", database: "connected" }`

### Plans
- `GET /plans` → `Plan[]`
- `POST /plans` → `201 Plan`
- `GET /plans/:planId` → `PlanWithItems` (plan + items array)
- `PATCH /plans/:planId` → `Plan` (updated plan)
- `DELETE /plans/:planId` → `{ ok: true }`

### Participants
- `GET /plans/:planId/participants` → `Participant[]`
- `POST /plans/:planId/participants` → `201 Participant`
- `GET /participants/:participantId` → `Participant`
- `PATCH /participants/:participantId` → `Participant`
- `DELETE /participants/:participantId` → `{ ok: true }`

### Items
- `GET /plans/:planId/items` → `Item[]`
- `POST /plans/:planId/items` → `201 Item`
- `PATCH /items/:itemId` → `Item` (also used to cancel/restore items via status field)

### Auth
- `GET /auth/me` → `{ user: { id, email, role } }` (JWT required — returns 401 without valid token)

**Status codes:** `200` OK, `201` Created, `400` Invalid, `401` Unauthorized, `404` Not Found, `500` Internal Error, `503` Unavailable.

**Error format:** `{ message: string, code?: string }`

---

## 7. UX Flow (Happy Path)

1. Create Plan → Add Title/Date.
2. Add Participants (names only) → owner marked automatically.
3. Add Items (equipment/food) → set quantities.
4. Assign items to people (optional) → share link.
5. Participants update statuses as they buy/pack.

---

## 8. Sharing & Access

- **Share links** (done): Each participant has a unique `inviteToken`. Public `GET /plans/:planId/invite/:inviteToken` returns plan data with PII stripped.
- **Invite landing page** (done): `/invite/:planId/:inviteToken` — read-only plan preview. Auth-aware CTA: unauthenticated users see "Sign in to join" / "Create an account" linking to `/signin?redirect=/plan/:planId`, plus "Continue without signing in" which opens a preferences modal (adults, kids, food, allergies, notes) — on submit/skip the modal closes and the guest stays on the invite page. Authenticated users are auto-redirected to `/plan/:planId` (invite is claimed automatically before redirect). Sign-in and sign-up pages support `?redirect` search param for post-auth navigation. **Invite claim flow:** clicking sign-in/sign-up from the invite page stores `{ planId, inviteToken }` in localStorage. Email auth: sign-in/sign-up pages await `claimInvite()` before navigating to the plan. OAuth: redirects to `/plan/:planId` directly; `AuthProvider.onAuthStateChange` claims the invite in the background. If an authenticated user visits the invite page directly (e.g., opens an old invite link), the page auto-claims and redirects to the plan. **Remaining BE work:** `PATCH /plans/:planId/invite/:inviteToken/preferences` endpoint not yet implemented (guest preference saves return 404).
- **Supabase JWT auth** (in progress): FE signs up/in via Supabase directly (email+password or Google OAuth). BE verifies JWTs via JWKS. `GET /auth/me` proves the auth chain works.
- **Auth-gated UI** (done):
  - **Plans list:** Signed-in users see "Create New Plan" link. Unauthenticated users see "Sign In" / "Sign Up" buttons with a prompt "Sign in to create and manage plans".
  - **Plan detail — edit plan:** Only the plan owner sees the "Edit Plan" button.
  - **Plan detail — participant preferences:** Only the plan owner sees "Edit" buttons on participant cards. Non-owners and unauthenticated users see read-only preferences.
  - **Plan detail — RSVP status:** RSVP status badges are visible only to the plan owner, shown next to non-owner participants.
  - **Plan detail — item edit permissions:** Owner can edit all items. Non-owner authenticated users can only edit items assigned to them (pencil button, inline status/quantity/unit, cancel hidden for non-assigned items). Non-owners can still self-assign unassigned items. Guests can only edit items assigned to their `myParticipantId`. Permission is controlled via `canEdit` prop on `ItemCard` and `canEditItem` callback on `CategorySection`, applied consistently across plan detail page, items page, and invite page.
  - **Plan detail — admin delete:** Only admin users (detected via `app_metadata.role`) see the delete button.
  - These checks are UX-only. The BE enforces access control via JWT verification.
- **Future:** Route-level permissions, plan ownership linked to Supabase user, visibility enforcement (public/invite_only/private).

---

## 9. Deployment & Security

- **FE:** Cloudflare Pages via GitHub Actions. See [Frontend Guide](../guides/frontend.md#cicd-github-actions--cloudflare-pages).
- **BE:** Railway via GitHub Actions. See [Backend Guide](../guides/backend.md#deployment-railway).
- **Database:** Railway-managed PostgreSQL with Drizzle migrations.
- **Security:** CORS + API key (legacy fallback) + Supabase JWT verification via JWKS (asymmetric keys, no secrets stored). See [Backend Guide — Security](../guides/backend.md#security).

---

## 10. Roadmap (Post-MVP)

1. ~~**Share link**~~ — Done (invite tokens).
2. ~~**Proper auth**~~ — In progress (Supabase JWT on BE done, FE sign-up/sign-in next).
3. **User profiles table** — link Supabase users to plans/participants in our DB.
4. **Route-level permissions** — enforce who can view/edit which plans based on JWT identity.
5. **Assignments** — item → participant with partial quantities.
6. **Personalized views** — filter per participant.
7. **Meals → auto food list** (portions per person; day-by-day plan).
8. **Weather integration** with alerts (wind, rain).
9. **Swipe UI** on mobile for quick status change.
10. **Save participant presets** (what each person usually brings).
11. **WhatsApp/Telegram integration** for updates and quick check-offs via bot.

---

## 11. Definition of Done (MVP)

- [x] Plans CRUD working end-to-end.
- [x] Participants CRUD working end-to-end.
- [x] Items CRUD working end-to-end (with inline editing).
- [x] Deployed FE (Cloudflare Pages) + BE (Railway).
- [x] OpenAPI spec generated and shared between repos.
- [x] CI/CD pipelines for both repos.
- [ ] Share link — public plan access.
- [ ] Assignments — API routes for item → participant (DB table exists).
- [ ] At least 1 real trip tested by team with 3+ participants.
