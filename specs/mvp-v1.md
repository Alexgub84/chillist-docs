# Chillist — MVP Specification (v1.0)

> **Purpose:** Define a minimal, shippable product for organizing small trips/events with shared checklists. Optimized for rapid build, live testing, and FE/BE division of work.

---

## Implementation Status

> Last updated: 2026-02-17

| Feature | Status | Notes |
|---------|--------|-------|
| Plans CRUD | Done | Full REST API + FE screens |
| Participants CRUD | Done | Scoped to plans, role-based |
| Items CRUD | Done | Equipment/food categories, inline editing |
| Item status flow | Done | pending → purchased → packed → canceled |
| Status filtering | Done | Filter items by status on plan screen |
| Category grouping | Done | Items grouped by equipment/food |
| SEO & sharing metadata | Done | OG tags, Twitter Card, favicon, web manifest, logo in header |
| Share link | Done | Invite token per participant, public `GET /plans/:planId/invite/:inviteToken` endpoint |
| Assignments | Partial | DB table exists (`item_assignments`), API routes not implemented |
| Weather | Not started | Optional forecast for plan location |
| Auth | In progress | Phase 1 (invite tokens) done. Phase 2 (Supabase JWT verification on BE) done. FE sign-up/sign-in next. |

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
  - `participantId`, `displayName`, `name`, `lastName`, `role` ("owner" | "participant" | "viewer"), optional: `avatarUrl`, `contactEmail`, `contactPhone`
  - Scoped to a plan via `planId`
  - Timestamps: `createdAt`, `updatedAt`
- **Plan**
  - `planId`, `title`, optional: `description`, `location` (name/country/region/city/lat/lon/timezone), `startDate`, `endDate`, `tags[]`
  - `ownerParticipantId`, `status` ("draft" | "active" | "archived"), `visibility` ("public" | "unlisted" | "private")
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
- **Quality:** ESLint + Prettier, TypeScript strict, Husky pre-commit hooks, Vitest + Playwright.
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
- `PATCH /items/:itemId` → `Item`
- `DELETE /items/:itemId` → `{ ok: true }`

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
- **Supabase JWT auth** (in progress): FE signs up/in via Supabase directly. BE verifies JWTs via JWKS. `GET /auth/me` proves the auth chain works.
- **Plans remain public** for now. No route-level permission enforcement until Step 3 (Permissions + Privacy).
- **Future:** Route-level permissions, plan ownership linked to Supabase user, visibility enforcement (public/unlisted/private).

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
