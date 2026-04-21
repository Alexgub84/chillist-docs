# Frontend issue: AI suggestions — per-category REST (3 parallel calls)

Use this document as the body of a **chillist-fe** GitHub issue. Depends on **chillist-be** shipping `POST /plans/:planId/ai-suggestions/:category` and regenerated `docs/openapi.json` (BE ≥ 1.32.0).

---

## Suggested GitHub title

**feat(ai): migrate item suggestions to per-category REST — parallel calls + `X-Generation-Id`**

---

## Summary

The backend no longer exposes a single “all categories in one response” or streaming (SSE/NDJSON) contract. Item suggestions are generated with **one AI call per category**, via:

`POST /plans/:planId/ai-suggestions/:category`

where `category` is one of: `food`, `group_equipment`, `personal_equipment`.

The frontend should fire **three requests in parallel** when the user taps “Suggest items with AI”, and **render each category’s results as its response arrives** (progressive UI). All three requests in one user action must share the same correlation id via the **`X-Generation-Id`** header so analytics and support can group one “generation burst.”

---

## Why this shape

- **CORS and simplicity:** Plain JSON POSTs work with the normal Fastify + `@fastify/cors` path; no stream parsing or hijacked responses.
- **Natural FE patterns:** `Promise.all`, React Query `useQueries`, or three mutations with independent loading/error state.
- **Per-call semantics:** `plans.aiGenerationCount` on the backend increments **once per category call** (three increments per full “Generate” if all three succeed).

---

## API contract (FE must implement)

### Endpoint

`POST /plans/{planId}/ai-suggestions/{category}`

| Path param   | Value |
| ------------ | ----- |
| `planId`     | UUID  |
| `category`   | `food` \| `group_equipment` \| `personal_equipment` |

### Headers

| Header | Required | Notes |
| ------ | -------- | ----- |
| `Authorization` | Yes | `Bearer <jwt>` |
| `Content-Type` | Yes for JSON body | `application/json` (or send `{}` / omit body where allowed) |
| `X-Generation-Id` | **Strongly recommended** | Single UUID for all three calls in one user gesture. Backend validates UUID format; **400** if malformed. If omitted, backend generates a **different** UUID per call — fine for API clients, **bad for correlating one burst** in admin/logs. |

### Request body (optional)

```json
{
  "subcategories": ["breakfast", "snacks"]
}
```

- Only hints for **that** category. Omit or `{}` for no hints.
- Unknown keys: rely on OpenAPI / BE validation (`additionalProperties: false` on BE — extra keys may 400 unless stripped).

### Response `200`

```json
{
  "suggestions": [
    {
      "id": "uuid",
      "name": "…",
      "category": "food",
      "subcategory": "…",
      "quantity": 1,
      "unit": "pcs",
      "reason": "…"
    }
  ],
  "aiUsageLogId": "uuid",
  "generationId": "uuid"
}
```

- `suggestions[].id` is required for linking to `POST .../items/bulk` via `aiSuggestionId` (same as before).
- `generationId` in the body echoes the effective id (header if valid, else server-generated for that call).

### Errors (handle explicitly)

| Status | Meaning / FE action |
| ------ | ------------------- |
| **400** | Invalid `category` path or invalid `X-Generation-Id` — show validation message; do not retry blindly. |
| **401** | Auth — refresh session or sign in. |
| **404** | Plan not found or not a participant — same as today. |
| **502** | AI failure — show “AI temporarily unavailable” + retry **per failed category** (not necessarily all three). |
| **500** | Generic server error — log, toast, optional retry. |

**Important:** Partial success is normal: e.g. food + group_equipment return 200, personal_equipment returns 502. UI should show two filled cards and one error/retry for the failed category.

---

## Recommended integration (best practice)

### 1. One UUID per user gesture

```ts
const generationId = crypto.randomUUID()
```

Use the **same** `generationId` on all three `fetch`/API calls started by a single “Generate” click.

### 2. Parallel requests

Prefer `Promise.allSettled` (not `Promise.all`) so one category’s failure does not reject the whole batch:

```ts
const categories = ['food', 'group_equipment', 'personal_equipment'] as const

const results = await Promise.allSettled(
  categories.map((category) =>
    api.post(`/plans/${planId}/ai-suggestions/${category}`, {
      body: subcategoriesByCategory?.[category]
        ? { subcategories: subcategoriesByCategory[category] }
        : {},
      headers: { 'X-Generation-Id': generationId },
    })
  )
)
```

Then merge successful payloads into your existing preview state keyed by `category`.

### 3. React Query

- **Option A — `useQueries`:** three parallel queries with a shared `generationId` in `queryKey` or meta; enable only when user triggers generate (not on mount).
- **Option B — single mutation** that internally runs three requests and updates local state as each completes (good if you want incremental UI updates: use separate `await` chains or progressive state updates).

Avoid a single query that assumes one combined response.

### 4. Progressive UI

- Show three skeletons or category placeholders immediately.
- When a category resolves, fill that column/card; leave others loading.
- On 502 for one category, show inline error + “Retry” for **that category only** (reuse same `generationId` if retry is part of the same session, or new UUID if user explicitly starts a “new generation” — product decision; correlating retries is easier if you keep the same id).

### 5. Types and OpenAPI

- Regenerate the FE API client / Zod schemas from the **updated** `docs/openapi.json` in chillist-be.
- Remove any types referring to NDJSON lines, SSE events, or a single batched `categories` map in the **request** body for the old monolithic POST.

### 6. Delete legacy client code

Remove or replace:

- NDJSON line parsing (`application/x-ndjson`, `ReadableStream` line splitter).
- SSE (`EventSource` or fetch streaming for `/ai-suggestions/stream`).
- Any client assuming **503** for AI errors — backend uses **502** for the discriminated AI error path on this route (align toasts and i18n).

### 7. Mock server / E2E

- Update MSW handlers (or mock server) to expose **three** routes or one parameterized route:  
  `post('/plans/:planId/ai-suggestions/:category', ...)`.
- Return JSON matching the new shape; optionally delay one category to simulate progressive loading.

---

## Acceptance criteria

- [ ] “Suggest items with AI” triggers **three** POSTs in parallel with the same `X-Generation-Id`.
- [ ] Preview UI updates **per category** as each response arrives (no blocking on the slowest call before showing anything — unless product explicitly wants “all or nothing”).
- [ ] Partial failure: if one category returns 502, the other two still display; user can retry or dismiss the failed bucket.
- [ ] Bulk confirm still sends `aiSuggestionId` from each suggestion’s `id` (unchanged contract with `items/bulk`).
- [ ] No NDJSON/SSE code paths remain for AI suggestions.
- [ ] OpenAPI-derived types match BE; CI typecheck passes.

---

## References

- BE spec / product: [mvp-v1.md](mvp-v1.md) (AI item suggestions row), [current/status.md](../current/status.md) (Working Features — AI).
- Architecture lesson: [dev-lessons/backend.md](../dev-lessons/backend.md) — streaming vs per-category REST.
- Optional deep dive (partially outdated on single-POST details): [ai-item-generation.md](ai-item-generation.md) — prompt/model behavior; **trust OpenAPI + this issue for HTTP shape**.

---

## Optional follow-up issues

- E2E: assert three network calls and shared `X-Generation-Id` header in Playwright.
- i18n copy for per-category error and “Retry this category” button.
