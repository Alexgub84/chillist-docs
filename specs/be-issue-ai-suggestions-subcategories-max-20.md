# Backend issue: `POST /plans/:planId/ai-suggestions/:category` — `subcategories` max 20 conflicts with frontend vocabulary

Use this document as the body of a **chillist-be** GitHub issue. Optional: link **chillist-fe** issue or PR if the FE adds a temporary client-side cap.

---

## Suggested GitHub title

**fix(api): AI suggestions request rejects valid `subcategories` hints — `maxItems: 20` too low vs product vocabulary**

Suggested labels: `bug`, `api`, `ai` (adjust to your repo’s convention).

---

## Summary

`POST /plans/:planId/ai-suggestions/:category` validates the optional JSON body so that `subcategories` **must not contain more than 20 items**. The **chillist-fe** client sends the full canonical subcategory list per category (product vocabulary used for items and i18n). That list is **longer than 20** for `group_equipment` and `food`, so the API returns **400** with a message like:

`"body/subcategories must NOT have more than 20 items"`

Users see failed AI suggestions for those categories; only categories with ≤20 hints (e.g. `personal_equipment`) succeed. This is a **contract mismatch** between BE validation and FE/product lists, not bad user input.

---

## Current behavior (bug)

| Path | Symptom |
| ---- | ------- |
| `group_equipment` | 400 — client sends **21** canonical English subcategory strings. |
| `food` | 400 — client sends **31** canonical English subcategory strings. |
| `personal_equipment` | 200 — client sends **8** strings (under the limit). |

Parallel requests: two categories error, one succeeds — e.g. UI shows **“1 out of 3 categories ready”** with raw API error text in the category panel.

---

## Reproduction

1. Open a plan as a participant.
2. Trigger **AI item suggestions** (the flow that calls per-category `POST .../ai-suggestions/:category` three times in parallel with `X-Generation-Id`).
3. Observe network: `group_equipment` and `food` return **400**; response / logs show `subcategories` length validation failure.

No special plan data required: the failure happens when the body includes the **full hint list** the FE builds from its subcategory catalog.

---

## Evidence (frontend contract)

The frontend builds the request in **chillist-fe** (paths relative to that repo):

- [`src/hooks/useAiSuggestionsParallel.ts`](https://github.com/chillist/chillist-fe/blob/main/src/hooks/useAiSuggestionsParallel.ts) — one POST per category; body includes `subcategories` from `buildAiSubcategoriesForCategory`.
- [`src/core/api.ts`](https://github.com/chillist/chillist-fe/blob/main/src/core/api.ts) — `buildAiSubcategoriesForCategory` starts from `SUBCATEGORIES_BY_CATEGORY[category]` and appends any unique subcategory strings found on existing plan items (can only **increase** length).
- [`src/data/subcategories.ts`](https://github.com/chillist/chillist-fe/blob/main/src/data/subcategories.ts) — canonical arrays: **21** equipment rows (`EQUIPMENT_SUBCATEGORIES`), **31** food rows (`FOOD_SUBCATEGORIES`), **8** personal rows (`PERSONAL_EQUIPMENT_SUBCATEGORIES`).

So the **minimum** payload size for “all hints for this category” is already **21** and **31** — above **20** before any merge of user item data.

---

## Root cause

Backend request schema (e.g. JSON Schema `maxItems: 20` on `subcategories`) is **stricter than the product’s published subcategory vocabulary** that the frontend is designed to send as AI hints. The limit appears to have been chosen without aligning to the length of those lists.

---

## Impact

- **User-facing:** AI suggestions partially or fully broken for **group** and **food** in production.
- **Support / analytics:** Per-category failures skew success rates; `X-Generation-Id` groups a burst where 2/3 calls are 400.

---

## Proposed fixes (backend — pick one strategy)

**A. Raise or remove `maxItems` (recommended if the model/prompt can accept the full list)**  
- Set `maxItems` to at least **31** (food), or **omit** an upper bound and rely on max request size / timeout.  
- Update OpenAPI / published schema and any AJV/Fastify route schema.  
- Revisit prompt/token limits if the server passes the full array into the model context.

**B. Keep a cap but document it and align the contract**  
- If **20** is a hard requirement (cost, latency, model context), document the exact rule in OpenAPI and return a **clear 400** message.  
- Coordinate with **chillist-fe** so the client sends a **prioritized subset** (e.g. subcategories present on existing items first, then fill to 20). That is a **joint** FE+BE change; BE-only fix is insufficient if the product requires full coverage.

**C. Alternative API shape (larger change)**  
- e.g. accept a different hint format, or multiple requests — only if (A)/(B) are unacceptable.

---

## Acceptance criteria

- [ ] `POST /plans/:planId/ai-suggestions/{category}` accepts a request body whose `subcategories` array includes **all** canonical subcategory strings the product uses for that category (at minimum: length **≥ 31** for `food`, **≥ 21** for `group_equipment`), **or** the API contract explicitly documents a lower cap and the frontend is updated to match (joint release).
- [ ] OpenAPI / `docs/openapi.json` in **chillist-be** reflects the same rule as runtime validation.
- [ ] Regression test: body with 21+ subcategory strings for `food` / `group_equipment` does **not** 400 for length (unless the chosen strategy is (B) with an agreed cap and FE ships the subset logic).
- [ ] No raw JSON Schema / AJV messages leaked to end users as the primary error string (optional polish).

---

## References

- chillist-docs: [fe-ai-suggestions-per-category-migration.md](./fe-ai-suggestions-per-category-migration.md) — optional `{ "subcategories": string[] }` body.
- chillist-docs: [ai-item-generation.md](./ai-item-generation.md) — product context for AI item generation.

---

## Appendix: example failing request shape (illustrative)

`POST /plans/{planId}/ai-suggestions/food` with body containing 31 entries matching `FOOD_SUBCATEGORIES` in chillist-fe — **400** today.

```json
{
  "subcategories": [
    "Fresh Vegetables",
    "Fresh Fruit",
    "... 29 more per subcategories.ts ..."
  ]
}
```
