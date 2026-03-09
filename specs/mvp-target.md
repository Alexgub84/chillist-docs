# Chillist — MVP Target

> **Purpose:** Define the remaining work required to declare MVP complete and ready for real-world usage.
> **Last updated:** 2026-03-09

---

## 1. MVP Criteria

MVP is ready when:

1. All core features (plans, items, participants, assignments, invites, auth, expenses) are stable and tested in production.
2. Basic WhatsApp integration is working (invite sharing + plan update notifications).
3. Error tracking, structured logging, and alerting are operational on both BE and FE.
4. Analytics capture basic usage metrics (plan creation, item completion, active users).
5. At least 1 real trip tested by the team with 3+ participants.

---

## 2. WhatsApp Integration (Basic)

### 2.1 Invite Sharing via WhatsApp

- Owner can share an invite link directly to a WhatsApp contact or group from the plan page.
- Uses the Web Share API (mobile) or WhatsApp deep link (`https://wa.me/?text=...`) as fallback.
- The shared message includes the plan title, date range, and invite URL.
- **Scope:** FE only — no BE changes needed. Uses existing invite token URLs.

### 2.2 Plan Update Notifications (BE → WhatsApp)

- When key events happen, send a WhatsApp notification to participants who have a phone number:
  - New item added to the plan
  - Participant RSVP changed
  - Plan details updated (dates, location)
  - New participant joined (via join request approval)
- Uses a WhatsApp Business API provider (Twilio or Meta Cloud API).
- Notifications are opt-in — participants can mute notifications per plan.
- **BE:** New `notifications` service with a WhatsApp adapter. Queue-based (avoid blocking request handlers).
- **FE:** Notification preferences toggle per plan in participant settings.

### 2.3 Quick Status Updates via WhatsApp (Post-MVP Stretch)

- Participants can reply to a WhatsApp notification to mark items as purchased/packed.
- Requires a webhook endpoint on BE to receive incoming WhatsApp messages.
- **Deferred to post-MVP** unless team capacity allows.

---

## 3. Analytics

### 3.1 Backend Analytics

- Track key business events via structured log entries (queryable in Railway logs or a log aggregator):
  - `plan.created` — with userId, visibility
  - `plan.deleted` — with userId, planId
  - `participant.joined` — with method (invite link, join request, manual add)
  - `participant.claimed` — registered user linked to participant
  - `item.created` — with method (single, bulk), category
  - `item.status_changed` — from/to status, participantId
  - `expense.created` — with amount, planId
  - `invite.opened` — inviteToken used (track guest engagement)
- Implementation: A lightweight `analytics.service.ts` that emits structured JSON logs. No external analytics provider needed for MVP.
- Each event log includes: `event`, `timestamp`, `userId` (nullable), `planId` (nullable), `metadata` (event-specific fields).

### 3.2 Frontend Analytics

- Track user interaction events:
  - Page views (route changes)
  - Plan creation flow completion rate (started vs. completed)
  - Bulk add wizard usage (how many items per session)
  - Invite link copy/share actions
  - Language switch events
  - Auth flow: sign-up started, sign-up completed, sign-in, OAuth used
- Implementation: A thin analytics abstraction (`analytics.ts`) that can be wired to any provider.
- MVP provider: Console logging in development + a lightweight option for production (Plausible, Umami, or PostHog free tier — privacy-friendly, no cookie banners needed).

### 3.3 Key Metrics Dashboard (Post-MVP Stretch)

- Total plans created / active
- Total registered users
- Average items per plan
- Average participants per plan
- Guest vs. registered participant ratio
- **Deferred** — MVP just needs the data collection in place.

---

## 4. Error Tracking & Logging

### 4.1 Backend — Structured Logging

- **Current state:** Fastify's built-in pino logger with basic request logging.
- **Target:**
  - Structured JSON logs for all requests (method, path, status, duration, userId).
  - Error logs with full stack traces, request context (planId, userId, route), and correlation IDs.
  - Separate log levels: `error` for 5xx, `warn` for 4xx auth failures and rate limits, `info` for business events, `debug` for development.
  - Unhandled rejection and uncaught exception handlers that log before process exit.
  - Database query errors logged with query context (table, operation) but never with user data.
- **Implementation:**
  - Configure pino with `serializers` for request/response/error.
  - Add a `requestId` (UUID) to every request via Fastify's `genReqId` — included in all logs and returned in response headers (`X-Request-Id`).
  - Add `planId`, `userId` to the request logger context where available.

### 4.2 Backend — Error Handling

- **Current state:** Route-level try/catch with generic error responses.
- **Target:**
  - Centralized error handler plugin that catches all unhandled errors.
  - Custom error classes (`AppError`, `NotFoundError`, `ForbiddenError`, `ValidationError`) with `statusCode` and `code` fields.
  - Consistent error response format: `{ message, code, requestId }`.
  - Never expose internal details (stack traces, SQL errors) in production responses.
  - Log the full error internally, return a safe message externally.

### 4.3 Frontend — Error Tracking

- **Current state:** React error boundaries on some routes, console.error in catch blocks.
- **Target:**
  - Global error boundary at the app root with a user-friendly fallback UI and "Report issue" action.
  - API error interceptor in the fetch client that:
    - Logs all 4xx/5xx responses with request context (endpoint, method, status).
    - Shows user-friendly toast messages for common errors (network, 401, 403, 429, 500).
    - Captures `X-Request-Id` from response headers for support/debugging.
  - Unhandled promise rejection handler.
  - Integration with an error tracking service (Sentry free tier or similar) for production crash reporting.
  - Source maps uploaded to the error tracker during deploy for readable stack traces.

### 4.4 Frontend — Logging

- **Current state:** Scattered `console.log` / `console.error` calls.
- **Target:**
  - A `logger.ts` utility that wraps console methods with:
    - Log levels (error, warn, info, debug) controllable via env var.
    - Structured output in production (JSON with timestamp, level, context).
    - No-op in production for debug/info levels (reduce noise).
  - API call logging: method, URL, status, duration (at info level in dev, error level for failures in prod).

---

## 5. Alerts

### 5.1 Backend Alerts

- **Health check monitoring:** External uptime monitor (UptimeRobot free tier or Railway's built-in) pings `GET /health` every 60 seconds. Alert on 2+ consecutive failures.
- **Error rate alert:** If 5xx error count exceeds a threshold (e.g., 10 in 5 minutes), send an alert. Implementation: A simple counter in the centralized error handler; threshold check runs on a 5-minute interval. Alert destination: Slack webhook or email.
- **Database connection alert:** If `GET /health` reports `database: "disconnected"`, alert immediately. Already partially in place — needs alerting wired up.
- **Deployment alert:** After each successful Railway deploy, send a Slack/email notification with the commit SHA and deploy timestamp.

### 5.2 Frontend Alerts

- **Deploy notification:** After each Cloudflare Pages deploy, send a Slack/email notification.
- **Error spike alert:** If the error tracking service (Sentry) detects a spike in unhandled errors, it sends an alert. Configured via the Sentry dashboard.
- **Build failure alert:** GitHub Actions already notifies on CI failure via email. Optionally add a Slack webhook step.

### 5.3 Alert Channels

- **Primary:** Slack channel (`#chillist-alerts`) or email to the team.
- **Setup:** Add `SLACK_WEBHOOK_URL` secret to both BE and FE GitHub repos and Railway.
- **MVP scope:** Health check + deploy notifications + CI failure alerts. Error spike alerting can come from the error tracking service's built-in alerts.

---

## 6. Remaining Core Feature Gaps

These items from the existing spec are not yet complete and are required for MVP:

| Feature | Status | What's Left |
|---------|--------|-------------|
| Real trip test | Not done | Run at least 1 real trip with 3+ participants |
| Weather integration (BE) | Not started | FE has UI, BE integration with Open-Meteo pending |
| WhatsApp sharing (basic) | Not started | FE share button with WhatsApp deep link |
| WhatsApp notifications | Not started | BE notification service + Twilio/Meta integration |
| Error tracking (FE) | Not started | Sentry or similar integration |
| Structured logging (BE) | Partial | Pino is there, needs structured context and correlation IDs |
| Frontend logging | Not started | Logger utility with levels |
| Analytics events (BE) | Not started | Analytics service with structured event logs |
| Analytics events (FE) | Not started | Analytics abstraction + lightweight provider |
| Health monitoring | Not started | External uptime monitor + alerts |
| Deploy notifications | Not started | Slack webhook on successful deploy |

---

## 7. MVP Checklist

- [ ] WhatsApp invite sharing (FE deep link)
- [ ] WhatsApp plan update notifications (BE service + provider)
- [ ] BE structured logging with correlation IDs
- [ ] BE centralized error handling with custom error classes
- [ ] BE analytics event logging
- [ ] FE global error boundary + API error interceptor
- [ ] FE error tracking service integration (Sentry)
- [ ] FE logger utility
- [ ] FE analytics abstraction + provider
- [ ] Health check monitoring with alerts
- [ ] Deploy notifications (Slack/email)
- [ ] Error rate alerting (BE)
- [ ] At least 1 real trip tested with 3+ participants
- [ ] Weather integration (BE → FE)

---

## 8. Priority Order

1. **P0 — Ship blockers:** Error tracking (FE + BE), structured logging (BE), health monitoring.
2. **P1 — Core MVP:** WhatsApp invite sharing, analytics events, deploy notifications.
3. **P2 — Enhanced MVP:** WhatsApp notifications, error rate alerts, weather BE integration.
4. **P3 — Stretch:** WhatsApp quick replies, analytics dashboard, advanced alert rules.
