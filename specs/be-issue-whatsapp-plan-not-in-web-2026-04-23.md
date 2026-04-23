# GitHub issue draft — chillist-be: Investigate plan missing on web after WhatsApp flow (logs + DB)

**Status:** Open investigation (copy into `chillist-be` when ready)

**Suggested title:** Investigate: WhatsApp create-plan flow — plan not visible in web; verify internal API and DB (2026-04-23)

---

## Summary

A user completed a multi-turn **create plan** conversation in the WhatsApp bot (title “Camping with friends,” dates, headcount, location). The plan does **not** appear in the **web** app. We need the backend to **correlate production logs** and **database state** to determine whether `POST /api/internal/plans` was called and succeeded, failed, or **never called** (client/LLM path only).

This is **not** a request to change product behavior until root cause is known.

---

## User-visible symptoms

- Plan expected after WhatsApp conversation.
- Plan **absent** (or not listed) in the **signed-in** web experience for the same person.

---

## Runtime evidence (chillist-whatsapp-bot — production Railway)

Source: `npm run railway:logs` on `chillist-whatsapp-chatbot` (export under `chillist-whatsapp-bot/logs/railway-*.log`).

| Field | Value |
|--------|--------|
| WhatsApp E.164 | `+972546340926` |
| Green API `chatId` | `972546340926@c.us` |
| `POST /api/internal/auth/identify` result (as logged by bot) | `userId` = **`0d7cbe6b-69d8-47ea-81e4-bacd05ce5ef1`** (logged once on new session) |
| First bot log line (session + identify) | `2026-04-23T07:05:17.678Z` approx. (see raw log) |
| Message sequence (in order) | `Hey` → `I want to create a new plan` → `Camping with friends` → `10 adults and 5 kids` + `3/5` (location) → `One day march` (duration) |
| Per-turn outcome | Each inbound message is followed by `AI reply sent` (200 on webhook) |

**Important limitation:** The WhatsApp service **does not** currently emit structured production logs for **outbound** internal API calls (e.g. `createPlan` success/failure). Therefore **we cannot** prove from these logs alone that `POST /api/internal/plans` ran or returned 201. That proof must come from **chillist-be** request logs, tracing, or DB rows.

---

## Correlation time window (for log queries)

Use the **UTC** range covering the full conversation; extend ±5 minutes for clock skew and latency.

- **From:** `2026-04-22T17:38:00Z` (prior noise in same export) or narrow to `2026-04-23T07:05:00Z`
- **To:** `2026-04-23T07:10:00Z` (last user message in sample ~`07:08:12Z` UTC, reply completed ~`07:08:18Z` UTC)

Adjust if your log timezone differs; Railway log lines in the sample use `…Z` (UTC).

---

## Investigation A — Request logs (chillist-be)

1. **Filter** for `POST` paths matching internal plans creation:
   - `POST /api/internal/plans` (or the exact registered path in OpenAPI)
2. **Filter** by header or parsed context:
   - `x-user-id: 0d7cbe6b-69d8-47ea-81e4-bacd05ce5ef1`
3. For each matching (or **absent**) request, record:
   - Timestamp
   - HTTP status (**201** expected on success)
   - Request body (at least `title` — no need to log full PII in the issue; confirm presence in **secure** log storage)
   - Error body on 4xx/5xx
4. **If there are no requests** in the window: likely **bot did not call** the API (e.g. model did not emit `createPlan` tool, or tool error before HTTP). That points to **chillist-whatsapp-bot / AI** follow-up, not DB.
5. **If there are 4xx/5xx** responses: use message + stack to fix validation, auth, or owner resolution.
6. **If there is 201** with a `plan.id`: proceed to **Investigation B** to confirm the row and visibility rules.

---

## Investigation B — Database

Run read-only checks (exact table/column names per your schema).

1. **User row**
   - Find user `0d7cbe6b-69d8-47ea-81e4-bacd05ce5ef1` (or your `users` primary key if named differently).
   - Confirm `users.phone` (or canonical phone column) is **`+972546340926`** and matches the identify contract in [phone-management.md](./phone-management.md) and [whatsapp-chatbot-spec.md](./whatsapp-chatbot-spec.md) §*User Identification*.

2. **Plans for that user**
   - List plans where this user is **owner** or **participant** (same rules as `GET /plans` for the web).
   - Check for a plan created in the time window with title or metadata consistent with *Camping with friends* (or whatever was persisted from the request body).
   - If a row **exists** but web does not show it: investigate **RLS**, **list filters** (e.g. archived, soft delete), and **FE query** (separate issue on `chillist-fe` if needed).
   - If **no** plan row: pair with **Investigation A** — no `POST` vs failed `POST` vs different `x-user-id`.

3. **Idempotency / duplicates**
   - If multiple partial rows or duplicate titles exist, note IDs for cleanup only after root cause is clear.

---

## Hypotheses to confirm or rule out (BE can tick)

| # | Hypothesis | How to test |
|---|------------|-------------|
| H1 | `POST /api/internal/plans` **never** hit in the window | No rows in request logs; no new `plans` row for user |
| H2 | `POST` returned **4xx/5xx** (validation, owner resolution) | Log entry + `plans` table unchanged or error in logs |
| H3 | `POST` returned **201** and plan **exists** | Log + DB row; if web still empty → visibility/FE/auth |
| H4 | Plan created under **different** `x-user-id` (misrouting) | Search logs for any `createPlan` in window; compare `x-user-id` to `0d7cbe6b-…` |
| H5 | User’s **web** session is **not** `0d7cbe6b-…` | Compare Supabase `auth.user().id` in browser to DB; document if mismatch (product/education) |

---

## Suggested follow-ups (after root cause)

- If **H1** / **H2**: align with `chillist-whatsapp-bot` (forced tool, error surfacing, prompt). Reference [chillist-whatsapp-bot](https://github.com/Alexgub84/chillist-whatsapp-bot) `createPlan` in `src/conversation/tools.ts` and internal client.
- If **H3** with **visible DB row** but not in web: open a **fe** or **be list API** issue with exact plan id.
- If **H5**: document that WhatsApp and web must share the same Supabase user; ensure `users.phone` is set for that account (see [phone-management.md](./phone-management.md)).

---

## References

- [whatsapp-chatbot-spec.md](./whatsapp-chatbot-spec.md) — `POST /api/internal/auth/identify`, `POST /api/internal/plans`
- [phone-management.md](./phone-management.md) — `users.phone` as canonical for chatbot identity
- [chatbot-internal-create-plan-issue.md](./chatbot-internal-create-plan-issue.md) — original internal route ticket context (`chillist-be#199`)

---

## Copy-paste block for GitHub body (condensed)

```markdown
## Context
WhatsApp user `+972546340926` went through a create-plan flow; plan not visible on web. Bot production logs show identify `userId=0d7cbe6b-69d8-47ea-81e4-bacd05ce5ef1` and successful webhook handling; they do **not** prove `POST /api/internal/plans` was called.

## Ask
1. **Logs (UTC ~2026-04-23 07:05–07:10 + slack):** any `POST /api/internal/plans` with `x-user-id: 0d7cbe6b-69d8-47ea-81e4-bacd05ce5ef1`? Status and outcome?
2. **DB:** plans/participation for that user; any plan matching this conversation; confirm `users.phone` = `+972546340926`.

## Outcome
- Confirm H1 (no call) / H2 (error) / H3 (201 + row) / H4 / H5 per linked spec: `chillist-docs/specs/be-issue-whatsapp-plan-not-in-web-2026-04-23.md`
```

---

**End of draft**
