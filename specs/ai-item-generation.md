# Chillist — AI Item Generation

> **Purpose:** Single source of truth for the AI-powered item suggestion feature — architecture, API contract, test strategy, decisions, and implementation phases.
> **Last updated:** 2026-03-26

---

## 1. Overview

After creating a plan, users can trigger AI to generate a suggested packing/food item list based on the plan's context: trip duration, location, activity tags, and participant count. The AI returns structured item suggestions that match the existing item schema (category, unit, subcategory). Users preview the suggestions, select which ones to keep, and bulk-add them to the plan.

**Stack:** Vercel AI SDK (`ai` package v5) with configurable provider (Anthropic or OpenAI). Uses `LanguageModelV2` interface, `generateObject` for structured output, `createProviderRegistry` for multi-provider support, and `MockLanguageModelV2` for testing. Backend-only — the FE calls a single REST endpoint.

---

## 2. Input Signals

All fields are optional. AI degrades gracefully when some are absent.

| Signal | Source | Derived value |
|---|---|---|
| `startDate` / `endDate` | `plans` table | Nights count, trip duration in days |
| `location` (name, country, region) | `plans.location` JSONB | Destination context string |
| `tags[]` | `plans.tags` | Activity type (camping, beach, skiing, etc.) |
| `estimatedAdults` | `plans` table | Adult count |
| `estimatedKids` | `plans` table | Child count |

---

## 3. API Contract

### `POST /plans/:planId/ai-suggestions`

**Auth:** JWT required. Caller must be a participant of the plan (enforced via `checkPlanAccess`).

**Request:** No body. All context is derived from the plan record.

**Response (200):**

```json
{
  "suggestions": [
    {
      "name": "Tent",
      "category": "group_equipment",
      "subcategory": "Venue Setup and Layout",
      "quantity": 1,
      "unit": "pcs",
      "reason": "3-night camping trip for 3 people"
    }
  ]
}
```

**Error responses:**

| Status | When |
|---|---|
| 401 | JWT missing or invalid |
| 404 | Plan not found or caller is not a participant |
| 503 | AI provider threw an error (timeout, rate limit, etc.) — error name starts with `AI_` |
| 500 | Non-AI error (DB failure, unexpected error) |

### `ItemSuggestion` shape

| Field | Type | Constraint |
|---|---|---|
| `name` | `string` | Free text (AI-generated) |
| `category` | `enum` | `group_equipment`, `personal_equipment`, `food` — from `ITEM_CATEGORY_VALUES` in `src/db/schema.ts` |
| `subcategory` | `string` | Prompt-guided to use known vocabulary (see section 4), but free text |
| `quantity` | `number` | Positive integer. `personal_equipment` items use quantity=1 (assigned per participant) |
| `unit` | `enum` | `pcs`, `kg`, `g`, `lb`, `oz`, `l`, `ml`, `m`, `cm`, `pack`, `set` — from `UNIT_VALUES` in `src/db/schema.ts` |
| `reason` | `string` | Short explanation of why the AI suggested this item |

---

## 4. Vocabulary Decision

**No common_items table.** AI generates item names freely. The 700+ hardcoded FE items remain a separate manual bulk-add tool — not involved in AI generation.

**Hard constraints** (enforced by Zod output schema in `generateObject`):

- `category` must be one of `ITEM_CATEGORY_VALUES`
- `unit` must be one of `UNIT_VALUES`

Both are imported directly from `src/db/schema.ts` — single source of truth.

**Soft constraint** (prompt-guided):

Subcategory is `varchar(255)` in the DB (not an enum). The AI prompt lists the known subcategory vocabulary. AI is instructed to prefer these values but may create new ones for novel activity types.

**Equipment subcategories:**
`Venue Setup and Layout`, `Comfort and Climate Control`, `Cooking and Heating Equipment`, `First Aid and Safety`, `Games and Activities`, `Food Storage and Cooling`, `Lighting and Visibility`, `Kids and Baby Gear`, `Drink and Beverage Equipment`, `Other`

**Food subcategories:**
`Beverages (non-alcoholic)`, `Beverages (alcoholic)`, `Grains and Pasta`, `Snacks and Chips`, `Breakfast Staples`, `Meat and Proteins`, `Vegan`, `Fresh Produce`, `Other`

These values live in `src/services/ai/subcategories.ts` as const arrays and are injected into the prompt template — never hardcoded as inline strings.

---

## 5. Architecture

### AI SDK Native Approach

Instead of a custom `IAiService` interface, the feature uses Vercel AI SDK primitives directly:

- **`LanguageModelV2`** (from `@ai-sdk/provider`) — universal model interface, used as injection point
- **`MockLanguageModelV2`** (from `ai/test`) — drop-in test double, no custom fake needed
- **`generateObject`** with `output: 'array'` — structured JSON output with Zod validation
- **`createProviderRegistry`** — manages multiple providers (Anthropic, OpenAI)

### Core function

```typescript
generateItemSuggestions(model: LanguageModelV2, plan: PlanForAiContext)
  → Promise<{ suggestions: ItemSuggestion[], prompt: string, usage: {...} }>
```

Accepts any `LanguageModelV2` (real provider or mock). Returns parsed suggestions, the prompt that was sent, and token usage.

### Context formatters (reusable)

`src/services/ai/plan-context-formatters.ts` — pure functions:

- `formatLocationForAi(location)` — builds location string
- `resolveLocationTextForAi(location)` — nullable wrapper
- `normalizeTagsForAi(tags)` — trims and filters
- `resolveParticipantEstimates(adults, kids)` — defaults nulls to 0

### Prompt structure

Prompt assembly in `src/services/ai/item-suggestions/build-prompt.ts` uses templates from `prompt-templates.ts`:

1. **SYSTEM_INSTRUCTION** — role context
2. **Plan context** — title, duration, location, tags, group size (dynamic)
3. **CONTEXT_GUIDANCE** — how to interpret duration, location, tags+accommodation, group size
4. **CATEGORY_RULES** — personal_equipment (qty=1/person), group_equipment (shared), food (scaled)
5. **SUBCATEGORY_GUIDANCE** — preferred subcategory vocabulary
6. **VALID_ENUMS** — allowed category and unit values
7. **CLOSING_INSTRUCTION** — 15-40 items, each with a reason

### Model provider

`src/services/ai/model-provider.ts` — `resolveLanguageModel(aiProvider)` returns:
- `anthropic:claude-3-5-haiku-20241022` for `AI_PROVIDER=anthropic`
- `openai:gpt-4o-mini` for `AI_PROVIDER=openai`

### Fastify plugin

`src/plugins/ai-model.ts` — decorates `fastify.aiModel` with a `LanguageModelV2`. Accepts `AiModelPluginOptions { model?: LanguageModelV2 }` for test injection.

---

## 6. Logging

Every AI request logged at `info` level in the route handler:

```typescript
request.log.info({
  planId,
  promptLength: result.prompt.length,
  suggestionsCount: result.suggestions.length,
  usage: result.usage,
}, 'AI item suggestions generated')
```

Failure: `request.log.error({ err, planId }, 'Failed to generate AI suggestions')` → 503 or 500.

---

## 7. Environment Variables

| Variable | Dev default | Production |
|---|---|---|
| `AI_PROVIDER` | `anthropic` | required — `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` | optional | required when `AI_PROVIDER=anthropic` |
| `OPENAI_API_KEY` | optional | required when `AI_PROVIDER=openai` |

Env guards in `src/env.ts` (`.refine()`):

- Production blocks missing API key for the selected provider
- Development allows omitted keys

---

## 8. Test Strategy

### Mock approach

Uses `MockLanguageModelV2` from `ai/test` — drop-in replacement for any `LanguageModelV2`. No custom fake service needed.

**Important:** When mocking `generateObject` with `output: 'array'`, the mock model must return `{ "elements": [...] }` as the text content (the SDK wraps array schemas internally).

### Unit tests

| File | What it tests |
|---|---|
| `tests/unit/ai/subcategories.test.ts` | Non-empty arrays, regression guard for all known seed values |
| `tests/unit/ai/plan-context-formatters.test.ts` | All formatter functions with field combos |
| `tests/unit/ai/env-guards.test.ts` | AI env variable validation guards |
| `tests/unit/ai/item-suggestions/output-schema.test.ts` | Zod schema parsing, enum validation, rejection of invalid data |
| `tests/unit/ai/item-suggestions/build-prompt.test.ts` | Prompt content for various plan scenarios |
| `tests/unit/ai/item-suggestions/generate.test.ts` | `generateItemSuggestions` with MockLanguageModelV2 — happy path, usage, empty, invalid JSON, invalid category, model error |

### Integration tests

`tests/unit/ai-suggestions.route.test.ts` — full route with MockLanguageModelV2:

- 200 with suggestions, correct structure
- 401 without JWT
- 404 for inaccessible plan
- 503 when AI model throws (AI-prefixed error)
- 500 when non-AI error occurs

### Prompt quality validation (real API, skipped by default)

`tests/unit/ai/item-suggestions/prompt-quality.test.ts` — `describe.skip`:

5 scenarios: camping trip (3 nights, family), beach day (adults only), hotel city break, minimal context, winter camping.

Each scenario validates:
- Valid category/unit enum values
- Non-empty name and reason
- 70%+ subcategories from known vocabulary
- `personal_equipment` items have `quantity = 1`
- At least one item from each category
- Sleeping gear presence/absence based on accommodation tags

Run manually: `AI_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-... npx vitest run tests/unit/ai/item-suggestions/prompt-quality.test.ts`

---

## 9. UX Flow (FE — for reference)

1. User creates a plan (title, dates, location, tags, participant estimates)
2. On the plan page, user clicks "Suggest Items" button
3. FE calls `POST /plans/:planId/ai-suggestions`
4. Loading state shown while AI generates
5. Response arrives → preview modal shows suggested items with checkboxes
6. User selects/deselects items, adjusts quantities if needed
7. User confirms → FE calls `POST /plans/:planId/items/bulk` with selected items
8. Items appear in the plan

---

## 10. Files

### New files (BE)

- `src/services/ai/subcategories.ts` — subcategory vocabulary constants
- `src/services/ai/plan-context-formatters.ts` — reusable plan→AI context formatters
- `src/services/ai/model-provider.ts` — resolveLanguageModel + createProviderRegistry
- `src/services/ai/index.ts` — barrel exports
- `src/services/ai/item-suggestions/output-schema.ts` — Zod schema for AI output
- `src/services/ai/item-suggestions/prompt-templates.ts` — static prompt text
- `src/services/ai/item-suggestions/build-prompt.ts` — prompt assembly from plan context
- `src/services/ai/item-suggestions/generate.ts` — generateItemSuggestions function
- `src/services/ai/item-suggestions/index.ts` — barrel exports
- `src/plugins/ai-model.ts` — Fastify plugin decorating fastify.aiModel
- `src/schemas/ai-suggestions.schema.ts` — JSON schemas for OpenAPI
- `src/routes/ai-suggestions.route.ts` — POST /plans/:planId/ai-suggestions

### Modified files (BE)

- `src/env.ts` — AI_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY + refines
- `src/config.ts` — aiProvider, anthropicApiKey, openAiApiKey
- `src/app.ts` — BuildAppOptions + register aiModelPlugin + aiSuggestionsRoutes
- `src/types/fastify.d.ts` — fastify.aiModel: LanguageModelV2
- `src/schemas/index.ts` — register AI suggestion schemas
- `.env.example` — add AI vars

### Test files

- `tests/unit/ai/subcategories.test.ts`
- `tests/unit/ai/plan-context-formatters.test.ts`
- `tests/unit/ai/env-guards.test.ts`
- `tests/unit/ai/item-suggestions/output-schema.test.ts`
- `tests/unit/ai/item-suggestions/build-prompt.test.ts`
- `tests/unit/ai/item-suggestions/generate.test.ts`
- `tests/unit/ai/item-suggestions/prompt-quality.test.ts` (skipped — real API)
- `tests/unit/ai-suggestions.route.test.ts`

---

## 11. Dependencies

```bash
npm install ai@5 @ai-sdk/anthropic@2 @ai-sdk/openai@2 msw
npm install zod@3.25  # upgraded for ai@5 compatibility
```

---

## 12. Open Questions / Future

- **Common items vocabulary:** If AI-generated names cause too many near-duplicates with the FE library, revisit seeding items into a `common_items` DB table and using them as a constrained vocabulary in the prompt.
- **Caching:** No caching in v1. If the same plan context generates the same suggestions, consider caching by plan context hash.
- **Streaming:** v1 returns the full response. If generation is slow (>5s), consider streaming partial results to the FE.
- **Cost tracking:** Token usage is logged. If costs grow, add a daily/monthly budget guard or per-plan generation limit.
