# Chillist — Current Status

> **Purpose:** Living document describing all features currently implemented and working in production. Auto-updated by BE and FE deploy workflows.
> **Last updated:** 2026-04-21
> **BE version:** 1.33.0 — **`POST /api/internal/plans`** (WhatsApp chatbot): service-key + `x-user-id`; body `title` and optional plan fields; server resolves owner name/phone (`users`, Supabase metadata, participant fallback); `201` `{ plan: { id, name, date } }`. Also: AI suggestions **per-category REST** — `POST /plans/:planId/ai-suggestions/:category` (`food` \| `group_equipment` \| `personal_equipment`). Frontend fires **three parallel requests** per “Generate” and renders each JSON response as it completes (no streaming). Optional body `{ "subcategories"?: string[] }` scopes hints to that category. **`X-Generation-Id: <uuid>`** on all three calls correlates `ai_usage_logs.metadata.generationId`; if omitted, the BE generates a UUID per call. **`plans.aiGenerationCount`** increments **once per category call** (not once per burst). Plain JSON response: `{ suggestions, aiUsageLogId, generationId }`. Prod quality check: `npm run test:ai-suggestions-e2e` (sets `RUN_AI_E2E=true`; real AI + Docker).
> **FE version:** 1.37.1 — **Custom date/time pickers:** Replaced native `<input type="date|time">` with custom calendar (react-day-picker) and time-slot popover components, fixing broken iOS Safari/Chrome display in all locales including RTL. (Also: plan page shortcuts, home redesign — see `guides/frontend.md`.)

---

## 1. What Is Chillist

A web app for organizing group activities — camping trips, dinner parties, beach days, picnics. One place to create a plan, invite people, build a shared checklist of what to bring or buy, and track who's handling what. Works on desktop, tablet, and mobile. Available in English, Hebrew, and Spanish.

---

## 2. Working Features

### Plans

Create a plan for any group event using a **4-step wizard**:

1. **Plan Type** — title (required) at the top, then a 3-tier tag wizard that collects structured tags describing the plan (e.g., Camping → Cooking → Shared meals), then an optional description textarea below the tags. **Tag options are fetched from `GET /plan-tags`** (React Query, `staleTime: Infinity`); a spinner is shown while loading and an error state with retry on failure. Tier 1 is single-select, tiers 2 and 3 are multi-select. Tier 2 options are organized by concern (stay, food, vibe) with **mutex groups** enforcing mutually exclusive choices within each concern and **cross-group rules** that disable or deselect contradictory options across concerns. Duration/day-count questions are omitted (handled by the date picker in step 2). Tags are stored as `string[]` on the plan. Legacy tag ids from older plans are preserved through round-trips even if no longer offered in the wizard. The step can be skipped entirely (title is validated before advancing). Selected tags are shown as chips with back-navigation to edit previous tiers. A summary screen shows all selections before confirming.
2. **Plan Details** — date/time (one-day toggle or date range; custom calendar and time-slot picker popovers via `react-day-picker` and Headless UI, with full RTL and locale support), location (Google Maps autocomplete — only place name is shown; city/country/region/lat/lon are auto-populated), language, and currency.
3. **Preferences** — two clearly separated sections: **Your Details** (owner's adults/kids count, food preferences, allergies, notes; RSVP auto-set to "confirmed") and **Total Group Estimate** (estimated total adults and kids for planning quantities). The plan is created silently at this step — the user sees a seamless transition to the next step.
4. **Add Items** — the bulk add wizard is embedded inline so the owner can immediately pick items from the 700+ item library. This step can be skipped.

Owner details (name, phone, email) are auto-filled from the user's profile and not shown in the wizard. Defaults are applied silently: status = active, visibility = invite-only.

Each plan has a title, optional description, date or date range, and a location with Google Maps search. Plans have a status (draft / active / archived) and a visibility setting (public / invite-only / private) that controls who can find and access them. The owner can set a currency and default language per plan.

The plans list shows all plans you own or are invited to. Filter by ownership (All / My plans / Invited) and by time (All / Upcoming / Past). **Ownership filter badges** show counts for plans that match the **currently selected time filter** (so e.g. on Upcoming, “All” / “My plans” count only upcoming plans — the same set as the list). With the **All** ownership filter selected, plans are grouped under two section headings — **My plans** (owned) and **Invited** — so owned and invited trips are easy to tell apart. With **My plans** or **Invited** selected, the list stays a single flat list (no section headings). Each card shows the plan title, status, dates, location, and participant count. **Invited** (non-owner) participants see a **leave plan** control on the card; confirming in the dialog resolves their participant id (from the list embedding or `GET /plans/:planId/participants` if needed), then calls `DELETE /participants/:participantId`, removes them from the plan, and clears their item assignments.

The **edit plan** modal follows the same 2-step layout: Step 1 for plan details (title, description, location, dates, status, language, currency, tags) and Step 2 for owner preferences + participant estimation. Location in edit mode also shows only the place name with Google Maps autocomplete.

Only the plan owner can edit or delete a plan. Platform admins can also delete any plan they are not a participant of — if an admin is an invited participant on a plan, they see the leave button instead of the admin delete button on that card.

The plan detail page shows a **Headcount** section with two cards: **Reported** (aggregated adults and kids from all participants) and **Estimated** (the owner's estimation of other participants, stored as `estimatedAdults`/`estimatedKids` on the plan). Values show a dash when not set. Shortcut links to **manage participants** (owner only), **manage items**, and **expenses** are shown as a compact row of icon cards (centered on wider viewports), above the item list.

### Items & Checklists

Items are the core of every plan — the shared list of everything the group needs. Each item has a name, category (Group Equipment, Personal Equipment, or Food), quantity, unit, optional subcategory, and optional notes.

You can add a single item with full details, or use the **bulk add wizard** to pick from a library of 700+ suggested items organized by subcategory (Cooking Equipment, Fresh Vegetables, Dairy, First Aid, Lighting, Beverages, Vegan, and many more). Search, select, and add multiple items at once. On the plan page and **Manage Items** view, when a category (Group Equipment, Personal Equipment, or Food) has no items yet but other categories do, the empty category panel includes a button that opens the same bulk-add flow with that category pre-selected (subcategory step), so you do not have to re-pick the category from the floating action. The Hebrew item list (`common-items.he.json`) uses Israeli colloquial terms (e.g. מנגל not גריל, גזייה not כירת קמפינג, פיתה not לחם פיתה) and includes Israeli-specific foods and equipment (מטקות, סחוג, עמבה, ביסלי, במבה, ערק, זעתר, מרגז, etc.) while omitting items irrelevant to Israel (bear gear, American snacks/games, pork items replaced with שישליק, קבב, פסטרמה, שניצל).

**AI** — **Plan owners** can **suggest items with AI** from the last step of plan creation (before the library picker), from the plan page via a **Suggest items with AI** button beside the Items heading and via the floating action menu, and from the full **Manage Items** page via the same button and menu. Non-owners do not see these entry points (backend still enforces access on the AI endpoint). The app calls the backend **three times in parallel** — once per category (`POST /plans/:planId/ai-suggestions/food`, `.../group_equipment`, `.../personal_equipment`) — with a shared **`X-Generation-Id`** header so analytics can group the burst. Each response is plain JSON (`suggestions`, `aiUsageLogId`, `generationId`); the UI can show each category’s card as its request finishes. Optional body per call: `{ "subcategories": ["..."] }` for hints in that category only. Generation uses your plan context (dates, location, tags, group size, and **aggregated dietary preferences** from confirmed/pending participants). Item names, subcategories, and reasons follow the **plan's language** (English, Hebrew, or Spanish); non-English calls use a stronger model tier for quality. The AI may create plan-specific subcategory labels (e.g. "Fishing Gear", "Ski Equipment") beyond the built-in examples, guided to keep a moderate number of distinct subcategories. You preview suggestions in a modal grouped by category and by each suggestion’s subcategory (with select/deselect all at both levels), adjust quantities, deselect individual lines, then add the rest in one bulk action. Personal equipment suggestions are assigned to everyone (one per participant). Confirming AI suggestions during plan creation closes the wizard and navigates to the plan page. Each response includes stable suggestion ids and an `aiUsageLogId`; when you confirm, each accepted line is sent to bulk (or single) item create with optional `aiSuggestionId` so the backend can record acceptance. Fetched items expose `source` (`manual` | `ai_suggestion`) and nullable `aiSuggestionId`.

Items are grouped by category, then by subcategory. **Subcategory handling is multilingual:** subcategory values are stored in the plan's language (English, Hebrew, or Spanish). Grouping uses the stored string, group headers display it directly, and sorting respects the active locale. The item form has a subcategory autocomplete with localized suggestions. Bulk-add translates subcategories to the plan language at creation time. Unknown/custom subcategories (from AI or user) are displayed as-is. Four views are available:

- **Buying list** (default tab on plan and manage-items) — pending + unassigned items; canceled lines do not appear here. **Packing list** — not yet packed (pending + purchased). **All** — every item in scope **except** canceled rows. Canceled items behave as if deleted on the frontend: they never appear in any tab, do not count toward the All badge, are excluded from the bulk-add wizard's "already in plan" map (so they are not pre-selected), and are removed from the AI suggestions "existing items" set (so the model can re-suggest them).
- **My Items** — only items assigned to you
- **Buying List** — items still to be purchased (checklist mode with checkboxes)
- **Packing List** — items purchased but not yet packed (checklist mode)

You can also filter by which participant an item is assigned to.

Inline editing lets you tap any item to change its quantity, unit, or status. **Cancel** (mark item as canceled) is available on every item, including unassigned ones. Canceled items are hidden everywhere on the frontend — Buying, Packing, All, the bulk-add wizard, and AI suggestions — so re-adding a previously canceled item via the bulk-add wizard reactivates the existing row (viewer's entry flips back to pending) instead of creating a duplicate. In checklist mode, checking an item triggers a strikethrough animation and advances its status (pending → purchased → packed).

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

**Browser session tracking** — the frontend sends an `X-Session-ID` header (UUID v4, managed in localStorage with 15 min inactivity expiry) on every request. The backend reads the header, validates its format, upserts a `sessions` row after each non-health response (`last_activity_at`, optional `user_id` when JWT present), and includes `sessionId` in structured request/response logs. Anonymous, guest, and authenticated traffic share the same browser session id. `POST /auth/logout` sets `ended_at` on that session row (no JWT required). `GET /auth/me` returns `sessionId` from the header (not the Supabase JWT `session_id` claim). Selected tables store optional `session_id` for analytics joins (see Technical Overview).

### Multilingual Support

English, Hebrew, and Spanish. Language toggle in the header switches instantly. Hebrew uses right-to-left layout. Language preference is saved locally and also persisted to the backend (`users.preferredLang` via `PATCH /auth/profile`). On login or session restore, `GET /auth/profile` is called and a non-null `preferredLang` is applied as the active language — enabling cross-device sync. Only backend-supported languages (`he`, `en`) are synced; `es` is stored locally only.

**Geo-based default (anonymous visitors):** A Cloudflare Pages Function middleware (`functions/_middleware.ts`) reads the visitor's country from `request.cf.country` on every request. Visitors from Israel receive a `chillist-geo-lang=he` cookie; all others receive `chillist-geo-lang=en`. The client reads this cookie at startup (`src/i18n/index.ts`) and applies it as the initial language when no explicit language is saved in localStorage. Logged-in users always follow their `preferredLang` profile setting, which overrides geo. The language switcher permanently overrides geo (persisted to localStorage and profile).

### Landing Page

A marketing home page with a **two-column hero** (headline, badge, primary and secondary CTAs, hero image with fallback), **How it works** as three illustrated cards (no screenshot carousel), a **five-tile bento** for features (dashboard, WhatsApp, AI lists, participant needs, shared expenses), a **dark closing CTA** with two actions, and a **footer** (About, Privacy, Terms — Privacy/Terms anchor to sections on `/about`). Brand palette and Epilogue are scoped via `index.css` `@theme`; full-bleed sections use the `full-bleed` utility inside the root `max-w-7xl` layout. Scroll-reveal animations, full **EN / HE / ES** copy, and auth-aware primary links (hero → `/plans` or `/signup`; bottom → `/create-plan` or `/signup`; secondary → `/plans`). The header brand logo is also auth-aware: it routes signed-in users to `/plans` and guests to `/`. Optional `public/hero.jpg` for the hero; `npm run screenshots` still generates legacy step/feat PNGs but the current home layout does not use them.

### Admin

Platform-level admin users open **`/admin/dashboard`** (from the header when signed in as admin). The page has **tabs**: **All Plans** lists every plan (no “create plan” button on this screen), supports the same delete and list behavior as the main plans list, and shows **pending join requests** across plans when present. The **AI Usage** tab loads **`GET /admin/ai-usage`**: filters (plan/user UUID, feature, status, date range) synced to the URL, paginated log table with **duration** and **color-coded status**, **expandable rows** for provider, language, prompt length, result count, log id, metadata JSON, and full error text, plus summary totals including breakdowns by feature and model. The **Chatbot AI** tab loads **`GET /admin/chatbot-ai-usage`** for **`chatbot_ai_usage`** rows: filters (`userId`, `sessionId`, `chatType`, `status`, date range; URL keys `cbAi*`), optional **session type** filter All / Production / Quality test (`cbAiSessionType` — client-side; quality-test runs use `session_id` values prefixed with `qt-`), a **Test** column marking those rows, summaries (tokens, cost, by model, by chat type, by tool name) that update to reflect the active filter, and expandable rows for session, message index, tool calls, and errors — read-only; table is owned by the chatbot service.

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
- **Browser session (FE + BE):** The SPA generates a UUID v4 per browser profile, stores it in `localStorage` (`chillist-session-id` + `chillist-session-last-active`), refreshes activity on user interaction (debounced), expires after 15 minutes of inactivity, and clears on explicit sign-out. Every outbound API request sends `X-Session-ID` via `doFetch` / `authFetch`. The BE upserts `sessions` from that header (see Database Tables), correlates logs with `sessionId` + `userId`, and records `session_id` on analytics rows where relevant. Independent of PostHog analytics IDs.
- **PostHog analytics (FE):** `posthog-js` + `@posthog/react`; client initialized in `src/lib/posthog.ts` (no init in `main.tsx`). Production uses `api_host` `/ingest` and configurable `ui_host` (US default; EU via `VITE_PUBLIC_POSTHOG_REGION` / `VITE_PUBLIC_POSTHOG_UI_HOST`). `functions/ingest/[[path]].ts` proxies to PostHog with a **narrow forwarded header allowlist** (avoids `401` on `/flags/` from stray `Authorization` / `cf-*` headers). Cloudflare env `POSTHOG_INGEST_HOST` / `POSTHOG_ASSET_HOST` override defaults for EU. Dev uses `VITE_PUBLIC_POSTHOG_HOST` (direct). `initAnalytics()` registers `session_id` on boot. `identifyUser` / `registerUserContext` / `trackUserSignedIn` on `SIGNED_IN`; `trackUserSignedOut` / `unregisterUserContext` / `resetAnalytics` on `SIGNED_OUT`. `PlanProvider` registers `plan_id` while a plan route is mounted. Disabled when token is placeholder `"token"`. `VITE_POSTHOG_MOCK=true` uses `src/lib/mock-posthog.ts` (accumulates events in memory, `console.debug` in dev, exposes `getCapturedEvents` / `clearCapturedEvents` for tests — no network). Token: `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN`.
- **Client logging (FE):** `src/lib/logger.ts` — in development, logs go to the browser console; in production, logs go through `setProdLogSink` (default no-op) so a third-party reporter can be registered from `src/lib/<vendor>.ts` without importing the vendor from feature code. Real-time plan updates (`usePlanWebSocket`) use this logger.

### Database Tables

- **plans** — event details, location, dates, status, visibility, currency
- **participants** — per-plan members with roles, preferences, invite tokens, RSVP. Stores `contactPhone` (E.164) and optionally `userId` (set when invite is claimed) or `guestProfileId` (set when guest accesses without signing up). `dietaryMembers` JSONB column holds per-person structured dietary data (diet enum + allergies array per adult/kid)
- **items** — equipment/food with per-participant status tracking
- **sessions** — browser session id (`id` = UUID from `X-Session-ID`), optional `user_id`, `device_type`, `user_agent`, `last_activity_at`, `ended_at`
- **item_changes** — audit log of item modifications; optional `session_id` for correlation
- **users** — per-user app-level data: phone (E.164, nullable), preferred language (`he`/`en`, nullable), default food preferences, allergies, and equipment. Indexed on `phone` for chatbot lookups. Renamed from `user_details`.
- **guest_profiles** — anonymous guest users (accessed plan via invite link, no Supabase account). Stores name, phone, email, dietary preferences
- **participant_join_requests** — pending/approved/rejected join requests; optional `session_id`. Also carries `dietaryMembers` JSONB, passed through to the `participants` record on approval
- **participant_expenses** — per-participant expenses with item linking
- **plan_invites** — invite send history and acceptance tracking per participant; optional `session_id` (for future flows)
- **whatsapp_notifications** — audit log of WhatsApp messages sent (invitation_sent, join_request_pending/approved/rejected); optional `session_id`
- **ai_usage_logs** — tracks every AI model invocation (tokens, cost, duration, model, feature type, status, full prompt text, raw model response, error type, finish reason); optional `session_id`. Admin-queryable via `GET /admin/ai-usage`
- **chatbot_ai_usage** — chatbot-side AI call metrics (session, user, plan, model, dm/group, tool_calls JSONB, tokens, cost, status). Written by the WhatsApp chatbot service; backend admin route is **read-only**: `GET /admin/chatbot-ai-usage`

### Backend API Routes

| Area           | Routes                                                                            | What They Do                                                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health         | `GET /health`                                                                     | Server and database status check                                                                                                                                                                                             |
| Plans          | `POST`, `GET`, `GET /:id`, `GET /:id/preview`, `PATCH /:id`, `DELETE /:id`        | Create, list, read, preview, update, delete plans                                                                                                                                                                            |
| Plans          | `GET /plans/pending-requests`                                                     | List plans with pending join requests                                                                                                                                                                                        |
| Participants   | `POST`, `GET`, `GET /:id`, `PATCH /:id`, `DELETE /:id`                            | Add, list, read, update, remove participants                                                                                                                                                                                 |
| Participants   | `POST /.../regenerate-token`                                                      | Regenerate a participant's invite token                                                                                                                                                                                      |
| Items          | `POST`, `GET`, `PATCH /:id`                                                       | Create, list, update items                                                                                                                                                                                                   |
| Items          | `POST /bulk`, `PATCH /bulk`                                                       | Bulk create and bulk update items                                                                                                                                                                                            |
| AI Suggestions | `POST /plans/:planId/ai-suggestions/:category` (`food` \| `group_equipment` \| `personal_equipment`) | One AI call per category; optional JSON body `{ "subcategories"?: string[] }`; optional header `X-Generation-Id` (UUID) to correlate the three parallel calls. Response: `{ suggestions, aiUsageLogId, generationId }`. Uses Vercel AI SDK with Anthropic/OpenAI. See [AI spec](../specs/ai-item-generation.md) |
| Invite (guest) | `GET /invite/:token`                                                              | Get plan data as a guest via invite token. Returns `myPreferences` with the guest's own `name`, `lastName`, `contactPhone` plus dietary/RSVP fields                                                                          |
| Invite (guest) | `PATCH /invite/:token/preferences`                                                | Update guest preferences and RSVP                                                                                                                                                                                            |
| Invite (guest) | `POST`, `PATCH`, `POST /bulk`, `PATCH /bulk` on items                             | Guest item CRUD (single + bulk)                                                                                                                                                                                              |
| Join Requests  | `POST`, `PATCH /:id`                                                              | Submit a join request, approve or reject                                                                                                                                                                                     |
| Claim          | `POST /claim/:token`                                                              | Link a registered user to a participant spot                                                                                                                                                                                 |
| Internal       | `POST /api/internal/auth/identify`                                                | Resolve phone number to Chillist user — queries `users.phone` directly (E.164 index lookup), returns `userId` + `displayName` (from Supabase, falling back to participant record). Chatbot use only.                         |
| Internal       | `GET /api/internal/plans`                                                         | List plans for a resolved chatbot user — returns `InternalPlanSummary[]` with `id`, `name`, `date`, `role`, `participantCount`, `itemCount`, `completedItemCount`. Requires `x-service-key` + `x-user-id`. Chatbot use only. |
| Internal       | `GET /api/internal/plans/:planId`                                                 | Full plan detail for chatbot — participants (`id`, `name`, `role`) and items with chatbot `status`/`assignee`/`category` (`gear`/`food`). Caller must be a plan participant. `401`/`403`/`404` as documented in OpenAPI.     |
| Internal       | `PATCH /api/internal/items/:itemId/status`                                        | Body `{ status: done \| pending }` — upserts caller’s `assignmentStatusList` entry (`done`→`purchased`). Caller must be a participant on the item’s plan.                                                                    |
| Internal       | `GET /api/internal/plan-tags`                                                     | Full plan tag taxonomy for chatbot use. Served from static JSON file (`src/data/plan-creation-tags.json`). Requires `x-service-key` only.                                                                                    |
| Plan Tags      | `GET /plan-tags`                                                                  | Full plan tag taxonomy (tier1 archetypes, universal flags, tier2 axes, tier3 specifics, item generation bundles). Served from static JSON file bundled with server. Requires JWT.                                            |
| Auth           | `GET /me`, `GET /profile`, `PATCH /profile`, `POST /sync-profile`, `POST /logout` | Current user, read/update preferences, sync from Supabase, end browser session                                                                                                                                               |
| Expenses       | `POST`, `GET`, `PATCH /:id`, `DELETE /:id`                                        | Create, list, update, delete expenses                                                                                                                                                                                        |
| Admin          | `GET /admin/plans`, `GET /admin/ai-usage`, `GET /admin/chatbot-ai-usage`          | Admin-only: list all plans; item-suggestion AI usage logs; chatbot AI usage logs (separate table, read-only)                                                                                                                 |

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
- WhatsApp chatbot — Phase 3 complete + Phase 4 BE: `GET /api/internal/plans`, `GET /api/internal/plans/:planId`, `PATCH /api/internal/items/:itemId/status` implemented; AI layer (Vercel AI SDK, tool definitions) pending
- Error tracking and structured logging (BE + FE)
- Analytics event collection (BE + FE)
- Health monitoring and alerts
- Deploy notifications
- Weather backend integration (FE has the UI, BE not connected yet)
