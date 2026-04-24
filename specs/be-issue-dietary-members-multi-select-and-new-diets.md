# Backend issue: `DietaryMember` — support multiple `diets` per person and add `no_fish` / `no_pork` tags

Use this document as the body of a **chillist-be** GitHub issue. Link the paired **chillist-fe** issue/PR that ships the multi-select UI.

---

## Suggested GitHub title

**feat(api): `DietaryMember` — allow multiple food tags per person (`diets: string[]`) and add `no_fish` / `no_pork` enum values**

Suggested labels: `enhancement`, `api`, `schema`, `breaking-change-candidate`.

---

## Summary

`DietaryMember` (schema `def-85` in `docs/openapi.json`) currently models a person's food preference as a **single** required enum `diet` with 10 values. Product now needs:

1. **Multi-select per person** — e.g. a kid who is both `pescatarian` and `gluten_free`. A single enum can't express that.
2. **Two additional tags** — `no_fish` and `no_pork`. These are common in our target audience (mixed-kosher / picky-kid groups) and don't fit any of the existing values.

Frontend (`chillist-fe`) has the UI wired for multi-select (`PersonPreferencesEditor` uses `FoodMultiSelect`) and i18n in all three locales (`dietary.food.no_fish`, `dietary.food.no_pork`, `dietary.food.countSelected`). It is currently **held back** by the contract: on write, FE still sends the legacy single `diet`, so users can select multiple tags on screen but only one survives a round-trip.

---

## Current contract (unchanged, to be extended)

`docs/openapi.json` → `def-85` (DietaryMember):

```json
{
  "type": "object",
  "properties": {
    "type":    { "type": "string", "enum": ["adult", "kid"] },
    "index":   { "type": "integer", "minimum": 0 },
    "diet": {
      "type": "string",
      "enum": [
        "everything", "vegetarian", "vegan", "pescatarian",
        "kosher", "halal", "gluten_free", "dairy_free", "keto", "paleo"
      ]
    },
    "allergies": { "type": "array", "items": { "type": "string", "enum": ["none","nuts","peanuts","gluten","dairy","eggs","soy","shellfish","sesame","fish"] } }
  },
  "required": ["type", "index", "diet", "allergies"]
}
```

`def-86` (DietaryMembersBody) wraps `{ members: DietaryMember[] }` and is nested on `participants` payloads (create/update) as `dietaryMembers`.

---

## Proposed contract

Extend `def-85` as follows. Goal: accept both the legacy single tag and a new array, so the rollout is non-breaking for existing callers.

```json
{
  "type": "object",
  "properties": {
    "type":  { "type": "string", "enum": ["adult", "kid"] },
    "index": { "type": "integer", "minimum": 0 },

    "diet": {
      "type": "string",
      "enum": [
        "everything", "vegetarian", "vegan", "pescatarian",
        "kosher", "halal", "gluten_free", "dairy_free", "keto", "paleo",
        "no_fish", "no_pork"
      ],
      "description": "Deprecated. Clients should send `diets` instead. If only `diet` is present, treat as `diets: [diet]`."
    },

    "diets": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "everything", "vegetarian", "vegan", "pescatarian",
          "kosher", "halal", "gluten_free", "dairy_free", "keto", "paleo",
          "no_fish", "no_pork"
        ]
      },
      "minItems": 1,
      "uniqueItems": true,
      "description": "Food preference tags for this person. Use [\"everything\"] for no special diet, otherwise any combination of specific tags."
    },

    "allergies": { "$ref": "unchanged" }
  },
  "required": ["type", "index", "allergies"]
}
```

### Semantics

- `diets` is the **canonical** field going forward.
- `diet` becomes **optional** and **deprecated** (mark with `"deprecated": true` in OpenAPI).
- **On write:**
  - If `diets` is present: BE persists `diets` as-is (after dedup + enum validation + `minItems: 1`).
  - If only `diet` is present: BE normalizes to `diets: [diet]` internally, persists the array.
  - If both are present: `diets` wins. BE may log a metric (`dietary_member_both_fields_sent`) so we can see clients catching up.
  - If neither is present: default to `diets: ["everything"]` to preserve current "optional by omission" behavior in the few flows that allow it, **or** 400 with `code: dietary_member_diet_required` — pick one and document it.
- **On read:** BE always returns **both**:
  - `diets`: the real list.
  - `diet`: the first element of `diets` (best-effort) so old FE builds still render.

### New enum values

- `no_fish` — person does not eat fish (distinct from allergy `fish`, which is medical).
- `no_pork` — person does not eat pork.

Both values are orthogonal to the existing tags and may be combined with any other value except `everything` (see validation below).

### Validation rules

- `diets` must be non-empty if sent.
- `diets` items must be unique.
- If `diets` contains `everything`, it must be the **only** value (`diets: ["everything"]`). Otherwise reject with `code: dietary_member_everything_must_be_exclusive`.
- Invalid enum value → 400 with `code: dietary_member_invalid_tag` and the offending value echoed in `details`.
- Unknown field on `DietaryMember` → 400 (current behavior, keep it strict).

---

## Impact

- **User-facing (blocked today):**
  - Can't record two tags for the same person (e.g. kid is `pescatarian` **and** `gluten_free`).
  - Can't record `no_fish` / `no_pork` at all.
- **FE:** multi-select UI + i18n already shipped; waiting on BE to persist. Once BE ships, FE flips `serializeDietaryMembers` to send `diets` instead of `diet`.
- **Storage:** `participants.dietary_members` is already a JSON column; the shape change is application-layer, not a SQL migration. (Confirm during implementation — if it's normalized into a relational table with a `diet` column, add a join table or a JSON array column; see **Open questions**.)

---

## Proposed fixes (backend)

1. **OpenAPI (`docs/openapi.json`):**
   - Add `diets` to `def-85` (array of enum, `minItems: 1`, `uniqueItems: true`).
   - Add `no_fish`, `no_pork` to both the `diet` and `diets` enums.
   - Mark `diet` as `deprecated: true`; remove `"diet"` from `required`.
   - Update `def-86` description to reflect multi-tag semantics.
2. **Runtime validation** (Fastify/AJV or Zod at the route):
   - Accept `diets` on every route that accepts `dietaryMembers` — currently: `POST /participants`, `PATCH /participants/:id`, plus any invite / join-request ingest that hydrates participants.
   - Apply the normalization and validation rules above in a single `normalizeDietaryMembers(input) → canonical` helper so it's consistent across routes.
3. **Persistence:**
   - Store the canonical `diets: string[]`.
   - On read, always hydrate both `diet` (first element) and `diets` to keep old FE builds working.
4. **Tests:**
   - Unit: `normalizeDietaryMembers` — legacy `diet` only, new `diets` only, both present, neither present, invalid enum, duplicate tag, `everything` combined with another tag.
   - Integration: `POST` then `GET` a participant with `diets: ["pescatarian", "gluten_free"]` — both fields round-trip correctly.
   - Integration: legacy client sending `diet: "vegan"` still gets `200` and reads back `{ diet: "vegan", diets: ["vegan"] }`.

---

## Acceptance criteria

- [ ] `docs/openapi.json` → `def-85` has `diets: string[]`, `no_fish` + `no_pork` added to both diet enums, `diet` marked deprecated and removed from `required`.
- [ ] Runtime validation (Fastify/AJV or Zod) matches OpenAPI exactly — no drift.
- [ ] `POST /participants` and `PATCH /participants/:id` accept `dietaryMembers.members[].diets` and persist it.
- [ ] `GET` responses always include both `diet` (first tag) and `diets` (full array) on every `DietaryMember`.
- [ ] Normalizer unit tests cover: legacy only, new only, both, neither, invalid, duplicate, `everything`-exclusivity.
- [ ] Integration test: create participant → `diets: ["pescatarian","gluten_free"]` round-trips.
- [ ] Integration test: create participant → `diet: "vegan"` (legacy) round-trips as `diets: ["vegan"]`.
- [ ] `no_fish` and `no_pork` accepted and persisted.
- [ ] Changelog / release note in `chillist-docs/current/status.md` once shipped, so FE can flip the write path.

---

## Rollout plan (BE → FE)

1. **BE ships the contract change** (this issue). OpenAPI + validation + tests.
2. FE runs `npm run api:sync` to pull the new `docs/openapi.json`, regenerates types.
3. FE flips `serializeDietaryMembers` in `src/data/dietary-options.ts` to write `diets` (keeping `diet` for one release as a compatibility shim, then dropping it).
4. Once prod traffic shows 0 requests with only `diet`, BE can start logging a warning and eventually remove the legacy field.

---

## Open questions (please confirm during implementation)

- Is `participants.dietary_members` stored as a JSON column, or normalized? If normalized with a `diet` column, we need a join-table migration — quote a separate migration issue if so.
- Should we seed **existing rows** so `diets = [diet]` on read even without a migration? Simplest: do it in the read mapper. Migration optional.
- Should `no_fish` and `no_pork` flow into the AI item-generation prompt as hard filters, or soft hints? (FE issue covers prompt wording; BE just needs to persist the tags.)
- Is there a `kosher_dairy` / `kosher_meat` split we should seed together with `no_pork`? Out of scope for this issue unless product says otherwise.

---

## References

- **chillist-fe** — paths relative to that repo:
  - `src/data/dietary-options.ts` — `FOOD_PREFERENCE_OPTIONS`, `MemberDietary`, serializer/parser.
  - `src/components/shared/PersonPreferencesEditor.tsx` — `FoodMultiSelect` UI.
  - `src/core/openapi.json` — pulled from this repo; **do not edit by hand**.
  - `src/i18n/locales/{en,he,es}.json` — `dietary.food.no_fish`, `dietary.food.no_pork`, `dietary.food.countSelected`.
- **chillist-docs:**
  - `dev-lessons/frontend.md` — entry “Shipped FE with a `DietaryMember` shape the backend cannot accept” (root cause of this issue).
  - `guides/issue-management.md` — BE-first rollout for shared features.
