# Chillist — Current Status

> **Purpose:** Living document describing all features currently implemented and working in production. Auto-updated by BE and FE deploy workflows.
> **Last updated:** 2026-03-30
> **BE version:** (update on deploy — AI usage tracking: `ai_usage_logs` table, `recordAiUsage()` service, `GET /admin/ai-usage` route, cost estimation)
> **FE version:** —

---

## 1. What Is Chillist

A web app for organizing group activities — camping trips, dinner parties, beach days, picnics. One place to create a plan, invite people, build a shared checklist of what to bring or buy, and track who's handling what. Works on desktop, tablet, and mobile. Available in English, Hebrew, and Spanish.

---

## 2. Working Features

### Plans

Create a plan for any group event using a **4-step wizard**:

1. **Plan Type** — title (required) at the top, then a 3-tier tag wizard that collects structured tags describing the plan (e.g., Camping → Cooking → Shared meals), then an optional description textarea below the tags. Tier 1 is single-select, tiers 2 and 3 are multi-select. Tags are stored as `string[]` on the plan. The step can be skipped entirely (title is validated before advancing). Selected tags are shown as chips with back-navigation to edit previous tiers. A summary screen shows all selections before confirming.
2. **Plan Details** — date/time (one-day toggle or date range), location (Google Maps autocomplete — only place name is shown; city/country/region/lat/lon are auto-populated), language, and currency.
3. **Preferences** — two clearly separated sections: **Your Details** (owner's adults/kids count, food preferences, allergies, notes; RSVP auto-set to "confirmed") and **Total Group Estimate** (estimated total adults and kids for planning quantities). The plan is created silently at this step — the user sees a seamless transition to the next step.
4. **Add Items** — the bulk add wizard is embedded inline so the owner can immediately pick items from the 700+ item library. This step can be skipped.

Owner details (name, phone, email) are auto-filled from the user's profile and not shown in the wizard. Defaults are applied silently: status = active, visibility = invite-only.

Each plan has a title, optional description, date or date range, and a location with Google Maps search. Plans have a status (draft / active / archived) and a visibility setting (public / invite-only / private) that controls who can find and access them. The owner can set a currency and default language per plan.

The plans list shows all plans you own or are invited to. Filter by ownership (All / My plans / Invited) and by time (All / Upcoming / Past). With the **All** ownership filter selected, plans are grouped under two section headings — **My plans** (owned) and **Invited** — so owned and invited trips are easy to tell apart. With **My plans** or **Invited** selected, the list stays a single flat list (no section headings). Each card shows the plan title, status, dates, location, and participant count. **Invited** (non-owner) participants see a **leave plan** control on the card; confirming in the dialog resolves their participant id (from the list embedding or `GET /plans/:planId/participants` if needed), then calls `DELETE /participants/:participantId`, removes them from the plan, and clears their item assignments.

The **edit plan** modal follows the same 2-step layout: Step 1 for plan details (title, description, location, dates, status, language, currency, tags) and Step 2 for owner preferences + participant estimation. Location in edit mode also shows only the place name with Google Maps autocomplete.

Only the plan owner can edit or delete a plan. Platform admins can also delete any plan.

The plan detail page shows a **Headcount** section with two cards: **Reported** (aggregated adults and kids from all participants) and **Estimated** (the owner's estimation of other participants, stored as `estimatedAdults`/`estimatedKids` on the plan). Values show a dash when not set.

### Items & Checklists

Items are the core of every plan — the shared list of everything the group needs. Each item has a name, category (Group Equipment, Personal Equipment, or Food), quantity, unit, optional subcategory, and optional notes.

You can add a single item with full details, or use the **bulk add wizard** to pick from a library of 700+ suggested items organized by subcategory (Cooking Equipment, Fresh Vegetables, Dairy, First Aid, Lighting, Beverages, Vegan, and many more). Search, select, and add multiple items at once.

**AI** — **Plan owners** can **suggest items with AI** from the last step of plan creation (before the library picker), from the plan page via a **Suggest items with AI** button beside the Items heading and via the floating action menu, and from the full **Manage Items** page via the same button and menu. Non-owners do not see these entry points (backend still enforces access on the AI endpoint). The app calls the backend to generate suggestions from your plan (dates, location, tags, group size, and **aggregated dietary preferences** from confirmed/pending participants). Item names, subcategories, and reasons are generated in the **plan's language** (English, Hebrew, or Spanish); non-English calls use a stronger model tier for quality. The AI may create plan-specific subcategory labels (e.g. "Fishing Gear", "Ski Equipment") beyond the built-in examples, guided to keep a moderate number of distinct subcategories. You preview suggestions in a modal, adjust quantities, deselect items, then add the rest in one bulk action. Personal equipment suggestions are assigned to everyone (one per participant). Confirming AI suggestions during plan creation closes the wizard and navigates to the plan page.

Items are grouped by category, then by subcategory. **Subcategory handling is multilingual:** subcategory values are stored in the plan's language (English, Hebrew, or Spanish). Grouping uses the stored string, group headers display it directly, and sorting respects the active locale. The item form has a subcategory autocomplete with localized suggestions. Bulk-add translates subcategories to the plan language at creation time. Unknown/custom subcategories (from AI or user) are displayed as-is. Four views are available:

- **All Items** — everything in the plan
- **My Items** — only items assigned to you
- **Buying List** — items still to be purchased (checklist mode with checkboxes)
- **Packing List** — items purchased but not yet packed (checklist mode)

You can also filter by which participant an item is assigned to.

Inline editing lets you tap any item to change its quantity, unit, or status. In checklist mode, checking an item triggers a strikethrough animation and advances its status (pending → purchased → packed).

### Participants & Roles

Every plan has participants with roles:

- **Owner** — full control: edit the plan, manage participants, assign items, approve join requests, transfer ownership.
- **Participant** — can add items, edit their own assigned items, self-assign unassigned items, update their own preferences.
- **Viewer** — read-only access.

Plans can have multiple owners. The current owner can promote another participant via "Make owner."

Each participant has group details: number of adults and kids, food preferences, allergies, and free-text notes. The owner can edit anyone's preferences; participants can only edit their own. A linked non-owner participant can **leave the plan** from the plans list (confirmation dialog); the same `DELETE /participants/:participantId` endpoint is used when an owner removes someone. Item assignments for that participant are cleared. RSVP status (Pending / Confirmed / Not sure) is shown as a badge next to each participant, visible to the owner.

Per-person dietary data is supported via `dietaryMembers` — a structured JSONB field on each participant where each adult/kid in the group gets their own `diet` (single-select enum) and `allergies` (multi-select enum array). The legacy `foodPreferences`/`allergies` text fields are retained for backward compatibility.

### Assignments

Items can be assigned to specific participants so everyone knows who's responsible for what:

- The owner can assign or reassign any item to any participant.
- Non-owners can self-assign unassigned items.
- **Assign to all** marks an item as "for everyone" — it appears on every participant's list with individual status tracking.
- **Bulk assign per subcategory** lets you assign all items in a subcategory to one participant at once.

Each participant has their own status per item (pending → purchased → packed), so you can track who bought or packed what independently.

For **personal equipment**, new items default to “assign to all” (`isAllParticipants`). If the client omits `assignmentStatusList`, the backend fills one pending entry per plan participant so lists stay consistent (same behavior on JWT and invite flows). Details: [item-handling.md](./item-handling.md).

### Invitations & Sharing

The owner can invite people to a plan by sharing a unique invite link per participant. The link can be copied and shared via WhatsApp, SMS, or any messaging app.

When someone opens an invite link:

- **Signed-in users** are automatically added to the plan and redirected to it.
- **Not signed in** — they see a plan preview and can choose to sign in, sign up, or continue as a guest.

**Guest access (no account required):** Guests can view the plan, set their RSVP, fill in preferences (group size, dietary info), and add or edit items. The items section appears after the guest responds to RSVP. The invite response includes the guest's own identity fields (`name`, `lastName`, `contactPhone`) in `myPreferences` so the frontend can prefill forms without asking the guest to re-enter details the owner already provided. Other participants' PII remains hidden (display name and role only — no phone or email).

**Request to join:** If someone has a link to an invite-only plan but isn't a participant, they see a plan preview and a "Request to Join" form. The owner can approve or reject requests from the Manage Participants page.

**WhatsApp send list:** The owner can send the plan's item list to participants via WhatsApp. A green "Send list" button appears on each non-owner participant card, and a "Send to all" link at the top of the Participants section. Non-owner participants see a "Send list to me" button on their own card. The owner also sees an invite status badge (with WhatsApp icon) on each participant: "Not sent", "Sent", or "Joined". See [WhatsApp spec](../specs/whatsapp.md) for full details, planned features, and BE gaps.

### Expenses

Track expenses per participant within a plan. Each expense has an amount, optional description, and can be linked to specific items from the plan. The owner can manage all expenses; participants can manage their own.

A **settlement summary** calculates the fair share per participant, shows who overpaid or underpaid, and lists the minimum transfers needed to settle up.

### Weather

When a plan has a location and dates, a 7-day weather forecast is shown on the plan page with daily icons and labels (Clear, Partly cloudy, Rain, Snow, etc.). Powered by Open-Meteo, runs entirely in the frontend.

### Authentication & Profiles

Sign up with email/password or Google OAuth. Email confirmation required. After signing up, users complete their profile (name, phone, email). The Edit Profile form pre-fills the phone field from `GET /auth/profile` (`preferences.phone`) — the canonical backend source — with a fallback to Supabase `user_metadata.phone`. Default food preferences, allergies, and equipment can be set in the profile and are pre-filled into new plans. Phone numbers are normalized to E.164 format before submission — the `PhoneInput` component accepts flexible input (spaces, dashes, parentheses, leading zeros, pasted international numbers) and the frontend validates the normalized result before sending to the backend.

JWT-based sessions with automatic token refresh. Session expiry shows a modal prompting re-authentication. All plan creation and management requires sign-in.

### Multilingual Support

English, Hebrew, and Spanish. Language toggle in the header switches instantly. Hebrew uses right-to-left layout. Language preference is saved locally and also persisted to the backend (`users.preferredLang` via `PATCH /auth/profile`). On login or session restore, `GET /auth/profile` is called and a non-null `preferredLang` is applied as the active language — enabling cross-device sync. Only backend-supported languages (`he`, `en`) are synced; `es` is stored locally only.

**Geo-based default (anonymous visitors):** A Cloudflare Pages Function middleware (`functions/_middleware.ts`) reads the visitor's country from `request.cf.country` on every request. Visitors from Israel receive a `chillist-geo-lang=he` cookie; all others receive `chillist-geo-lang=en`. The client reads this cookie at startup (`src/i18n/index.ts`) and applies it as the initial language when no explicit language is saved in localStorage. Logged-in users always follow their `preferredLang` profile setting, which overrides geo. The language switcher permanently overrides geo (persisted to localStorage and profile).

### Landing Page

A marketing home page with a hero section, a 3-step "How it works" quick intro (Create a plan → Add gear and food → Track together), and a 7-feature deep-dive section showcasing the full user journey: Plans Dashboard, Manage Your Group, AI Packing Lists, Easy Item Management, Live Progress Tracking, Expenses & Settlement, and WhatsApp Integration. Each feature has a mobile screenshot (EN + HE), scroll-reveal animations, and auth-aware call-to-action buttons. Screenshot script: `npm run screenshots` (starts mock server + dev server and restores `.env.local`; no manual auth toggle).

### Admin

Platform-level admin users can view all plans regardless of visibility, delete any plan, and see pending join requests across all plans.

---

## 3. User Flows

### Owner creates a plan and invites friends

1. Sign up or sign in (email or Google).
2. Start the 4-step plan creation wizard.
3. Step 1: Enter title, pick plan type tags via the 3-tier tag wizard (e.g., Camping → Cooking → Shared meals), optionally add a description, or skip tags.
4. Step 2: Enter dates, location (Google Maps autocomplete), language, currency → click Next.
5. Step 3: Fill in your details (adults/kids count, dietary needs, allergies) and estimate total group size → click Next (plan is created silently).
6. Step 4: Bulk-pick items from the 700+ item library, confirm **Suggest items with AI** (then you land on the plan), or skip to go straight to the plan.
7. From the plan page: add participants by name/phone, or share invite links.
8. Assign items to participants (or let them self-assign).
9. Track progress as people mark items purchased and packed.
10. Log expenses and see the settlement summary.

### Invited participant joins via link

1. Receive an invite link via WhatsApp, SMS, or email.
2. Open the link → sign in, sign up, or continue as guest.
3. Set RSVP status and fill in preferences (group size, dietary info).
4. View items, add your own, self-assign unassigned ones.
5. Mark items as purchased or packed.
6. Log your own expenses.

### Guest access (no account)

1. Open an invite link → choose "Continue without signing in."
2. See the plan preview and RSVP.
3. After responding, the items section appears.
4. Add items, edit items assigned to you, update your preferences.
5. Come back anytime using the same link — no expiry.

### Request to join a plan

1. Open a plan link you're not a participant of.
2. See the plan preview → fill in the "Request to Join" form (pre-filled from your profile).
3. Wait for the owner to approve.
4. Once approved, full plan access.

### Managing the group (owner)

1. Go to Manage Participants from the plan page.
2. View all participants with full details and preferences.
3. Edit anyone's preferences, transfer ownership, regenerate invite tokens.
4. See pending join requests → approve or reject each one.

---

## 4. Technical Overview

### Stack

| Layer        | Technology                                                                   |
| ------------ | ---------------------------------------------------------------------------- |
| Frontend     | React 19, TypeScript, Vite 7, Tailwind CSS v4, TanStack Router + React Query |
| Backend      | Node.js 20+, Fastify 5, TypeScript (ESM), Zod validation, Vercel AI SDK      |
| Database     | PostgreSQL via Drizzle ORM                                                   |
| Auth         | Supabase (email + Google OAuth), JWT verified via JWKS                       |
| API contract | OpenAPI 3.1, auto-generated from Fastify schemas                             |
| FE deploy    | Cloudflare Pages via GitHub Actions                                          |
| BE deploy    | Railway via GitHub Actions                                                   |

### Security

- JWT required on all protected routes. Guest access via invite token in URL.
- Internal routes (`/api/internal/*`) use service-key auth (`x-service-key` header matches `CHATBOT_SERVICE_KEY` env var). Not exposed publicly — Railway internal network only.
- Rate limiting (100 req/min global, 10 req/min on auth endpoints, 30 req/min on internal identify).
- Security headers (Helmet), CORS restricted to frontend URL in production.
- All input validated with Zod. SQL injection prevented via Drizzle ORM parameterized queries.
- **Session ID tracking:** Every request carries a `sessionId` for log correlation. For authenticated users this is the Supabase `session_id` JWT claim; for guests it is a `guest_<sha256-prefix>` derived from the invite token. Returned from `GET /auth/me` for FE use. No DB storage — analytics integration planned for a later phase.

### Database Tables

- **plans** — event details, location, dates, status, visibility, currency
- **participants** — per-plan members with roles, preferences, invite tokens, RSVP. Stores `contactPhone` (E.164) and optionally `userId` (set when invite is claimed) or `guestProfileId` (set when guest accesses without signing up). `dietaryMembers` JSONB column holds per-person structured dietary data (diet enum + allergies array per adult/kid)
- **items** — equipment/food with per-participant status tracking
- **item_changes** — audit log of item modifications
- **users** — per-user app-level data: phone (E.164, nullable), preferred language (`he`/`en`, nullable), default food preferences, allergies, and equipment. Indexed on `phone` for chatbot lookups. Renamed from `user_details`.
- **guest_profiles** — anonymous guest users (accessed plan via invite link, no Supabase account). Stores name, phone, email, dietary preferences
- **participant_join_requests** — pending/approved/rejected join requests. Also carries `dietaryMembers` JSONB, passed through to the `participants` record on approval
- **participant_expenses** — per-participant expenses with item linking
- **plan_invites** — invite send history and acceptance tracking per participant
- **whatsapp_notifications** — audit log of WhatsApp messages sent (invitation_sent, join_request_pending/approved/rejected)
- **ai_usage_logs** — tracks every AI model invocation (tokens, cost, duration, model, feature type, status). Admin-queryable via `GET /admin/ai-usage`

### Backend API Routes

| Area           | Routes                                                                     | What They Do                                                                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health         | `GET /health`                                                              | Server and database status check                                                                                                                                                                                             |
| Plans          | `POST`, `GET`, `GET /:id`, `GET /:id/preview`, `PATCH /:id`, `DELETE /:id` | Create, list, read, preview, update, delete plans                                                                                                                                                                            |
| Plans          | `GET /plans/pending-requests`                                              | List plans with pending join requests                                                                                                                                                                                        |
| Participants   | `POST`, `GET`, `GET /:id`, `PATCH /:id`, `DELETE /:id`                     | Add, list, read, update, remove participants                                                                                                                                                                                 |
| Participants   | `POST /.../regenerate-token`                                               | Regenerate a participant's invite token                                                                                                                                                                                      |
| Items          | `POST`, `GET`, `PATCH /:id`                                                | Create, list, update items                                                                                                                                                                                                   |
| Items          | `POST /bulk`, `PATCH /bulk`                                                | Bulk create and bulk update items                                                                                                                                                                                            |
| AI Suggestions | `POST /plans/:planId/ai-suggestions`                                       | Generate AI-powered packing/food item suggestions based on plan context (dates, location, tags, participants). Uses Vercel AI SDK with Anthropic/OpenAI. See [AI spec](../specs/ai-item-generation.md)                       |
| Invite (guest) | `GET /invite/:token`                                                       | Get plan data as a guest via invite token. Returns `myPreferences` with the guest's own `name`, `lastName`, `contactPhone` plus dietary/RSVP fields                                                                          |
| Invite (guest) | `PATCH /invite/:token/preferences`                                         | Update guest preferences and RSVP                                                                                                                                                                                            |
| Invite (guest) | `POST`, `PATCH`, `POST /bulk`, `PATCH /bulk` on items                      | Guest item CRUD (single + bulk)                                                                                                                                                                                              |
| Join Requests  | `POST`, `PATCH /:id`                                                       | Submit a join request, approve or reject                                                                                                                                                                                     |
| Claim          | `POST /claim/:token`                                                       | Link a registered user to a participant spot                                                                                                                                                                                 |
| Internal       | `POST /api/internal/auth/identify`                                         | Resolve phone number to Chillist user — queries `users.phone` directly (E.164 index lookup), returns `userId` + `displayName` (from Supabase, falling back to participant record). Chatbot use only.                                                  |
| Internal       | `GET /api/internal/plans`                                                  | List plans for a resolved chatbot user — returns `InternalPlanSummary[]` with `id`, `name`, `date`, `role`, `participantCount`, `itemCount`, `completedItemCount`. Requires `x-service-key` + `x-user-id`. Chatbot use only. |
| Auth           | `GET /me`, `GET /profile`, `PATCH /profile`, `POST /sync-profile`          | Current user, read/update preferences, sync from Supabase                                                                                                                                                                    |
| Expenses       | `POST`, `GET`, `PATCH /:id`, `DELETE /:id`                                 | Create, list, update, delete expenses                                                                                                                                                                                        |
| Admin          | `GET /admin/plans`, `GET /admin/ai-usage`                                  | Admin-only: list all plans, view AI usage logs with filters and cost summary                                                                                                                                                 |

### CI/CD

- **Backend:** GitHub Actions runs tests with PostgreSQL 16, migrations, typecheck + lint + vitest, build, OpenAPI validation. Deploy to Railway on main after CI passes. OpenAPI changes require `fe-notified` label on PRs.
- **Frontend:** GitHub Actions runs lint, typecheck, unit + integration tests, Playwright E2E (Chrome). Deploy to Cloudflare Pages on push to main.

### Testing

- **Backend:** Vitest integration tests with Testcontainers (PostgreSQL). 300+ tests covering auth, permissions, CRUD, AI suggestion generation, and edge cases.
- **Frontend:** Vitest + React Testing Library (unit + integration), Playwright E2E, mock API server for development.

---

## 5. What's Not Working Yet

See [MVP Target](mvp-target.md) for the full breakdown. Key gaps:

- WhatsApp send list — FE UI done, BE `/api/send-list` endpoint implemented; actual Green API delivery integration in progress
- WhatsApp chatbot — Phase 3 complete + Phase 4 BE partially done: `GET /api/internal/plans` implemented (returns chatbot-friendly plan summaries with counts); AI layer (Vercel AI SDK, tool definitions) pending
- Error tracking and structured logging (BE + FE)
- Analytics event collection (BE + FE)
- Health monitoring and alerts
- Deploy notifications
- Weather backend integration (FE has the UI, BE not connected yet)
