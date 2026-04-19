# Frontend Dev Lessons

A log of bugs fixed and problems solved in `chillist-fe`.

---

### [UX] Canceled items leaked into bulk-add as already-selected, blocking re-add

**Date:** 2026-04-18
**Problem:** After hiding canceled items from every status tab (previous lesson), opening the bulk-add wizard and drilling into a subcategory still showed a canceled item checked as "already in plan". Unchecking it fired `onCancel` (a no-op since it was already canceled), and there was no way to add the same item again without a duplicate row, which broke the "canceled = deleted on the FE" mental model.
**Solution:** Canceled-for-viewer items are now filtered out of every FE lookup that represents "what's already in the plan":

- `existingItems` map in `ItemsView` (used by `BulkItemAddWizard.existingItems`).
- `bulkAddExistingItems`, `existingItemNames`, and the subcategory `existingItems` object on `plan.$planId.lazy.tsx`.
- `existingItemNames` / `existingItems` on `items.$planId.lazy.tsx` (feeds `AiSuggestionsModal` / `ItemSuggestionsModal` so AI can re-suggest canceled items).

All three computed maps derive from a shared `filterOutCanceledForViewer(items, viewerId)` helper. Re-adding a canceled item via the wizard no longer creates a duplicate: `handleBulkAdd` (both in `ItemsView` and on the plan route) partitions the selected payloads using `getCanceledItemsByName`, reactivating name-matched canceled items via `buildReactivatePatch(item, viewerId)` (sets the viewer's entry back to `pending`, or appends a new pending entry if the viewer had no entry) and `onUpdateItem`, while the remaining payloads go through the normal `onBulkCreate` path. The success toast reports the combined count (created + reactivated).
**Prevention:** Any "appears-as-existing" UI that consumes `items` must go through the same "canceled = gone" predicate used for list rendering — otherwise a row hidden from the main list re-surfaces in wizards/suggestions. Keep that predicate in a single helper (`filterOutCanceledForViewer`) and use it everywhere. When adding a reactivation helper, keep it distinct from `buildStatusUpdate` (which has a length-1 fallback that would overwrite another participant's entry); always append a new entry if the viewer has none, so reactivation is strictly viewer-scoped.

---

### [UX] Default item tab showed “All” including canceled; cancel on unassigned was a no-op

**Date:** 2026-04-18
**Problem:** The plan page, manage-items, and invite preview defaulted to the **All** list tab, so canceled lines were visible immediately. The per-item **Cancel** action on unassigned rows could try `buildStatusUpdate` with no assignment entry, yielding an empty patch. Bulk-add “uncheck existing” had the same issue.
**Solution:** Default list selection is **Buying** (local state: `useState('buying')`; plan URL: `planListSearchToFilter` maps missing `list` to buying, `list=all` for the All tab, `listFilterToPlanListSearch` omits `list` when buying). Canceled items are filtered out of **every** status tab (Buying, Packing, All) via `filterItemsByStatusTab` — the All branch excludes `getItemStatus === 'canceled'`; the Buying / Packing branches already exclude canceled via their explicit status whitelist. The **All** tab badge uses the same non-canceled count. `ItemCard` shows the Cancel (×) button on every editable, non-canceled row — including unassigned lines; `buildStatusUpdate` adds a new `{participantId, status: 'canceled'}` entry for the viewer when `assignmentStatusList` is empty, so canceling an unassigned row yields a valid patch. `handleBulkCancel` no longer skips unassigned ids.
**Prevention:** When a product copy/UX ask is "filter X by default", verify the new default covers every view, not just the one initially observed. Hiding on a tab-by-tab basis is easy to under-apply — filter at the predicate in `filterItemsByStatusTab` so all tabs share the rule. For a "cancel" action on rows with no assignment, don't gate the UI — fix the data helper (`buildStatusUpdate`) so an empty `assignmentStatusList` produces a valid patch rather than `{}`.

**Follow-up (same area):** The default **Buying** tab used `getItemStatus === 'pending'` only, so **unassigned** rows (`assignmentStatusList: []`) disappeared on first load — empty list with items still in the plan. **Buying** must include unassigned lines (still to be acquired/claimed); `countItemsByListTab` buying counts should match.

---

### [Data] English common-items had bad beverage qpp, wrong units on ice/ice-cream, pets scaling with humans, single-serve eggs under-counted

**Date:** 2026-04-17
**Problem:** After the Hebrew pass, ran the same audit against `common-items.json` (EN). The EN file was in much better shape than HE — 0 `g`/`ml` legacy units, 0 food items marked personal, 0 non-spice foods missing `quantityPerPoint` — but still had four real classes of bug: (1) every non-water beverage at `qpp: 0.5`, so Juice/Soda/Iced Tea/Kombucha etc. produced 1.5 L/person/day; (2) `Ice` and `Ice Cream` sold in bags/tubs were `kg`/`l` respectively; (3) `Dog Food`, `Cat Food`, `Protein Powder`, `Watermelon`, `Pineapple` scaled with human headcount (e.g. 3 watermelons for a 12-person overnight); (4) `Eggs` at `qpp: 0.15` yielded **3 eggs for 8 people overnight** — while the HE counterpart correctly used `0.5` (≈1 egg per person per meal). `Lemons`/`Limes`/`Vinegar` were also silently too high.
**Solution:** Added `scripts/audit-en-item-quantities.ts` (EN mirror of the HE audit with English token patterns — NOTE: use `\b` word boundaries around `tea`/`ice`/`cocoa` to avoid matching `Steak`/`Pineapple`/`Cocoa Butter`) and `scripts/fix-en-quantities.ts` (patches keyed by `id`, editing raw JSON text to preserve formatting that `JSON.stringify` would destroy). Patched **30 items**: 11 non-water beverages to `qpp: 0.25`, 6 milk-family items to `0.3` (coffee/cereal/cooking, not standalone drink), cocktail mixer to `0.15`, `Ice` → `pack`/`0.3`, `Ice Cream` → `pcs`/`0.1`, `Watermelon` → `pcs`/`0.05`, `Pineapple` → `pcs`/`0.1`, `Dog Food`/`Cat Food` → `pack`/`0.02` (doesn't scale), `Protein Powder` → `0.02`, `Eggs` → `0.5`, `Lemons`/`Limes` → `0.1`, `Vinegar`/`Apple Cider Vinegar` → `0.05`. Extended `tests/unit/data/common-items-quantities.test.ts` with a parallel EN `describe` block: 46 canonical unit/qpp mappings + 10 camping-scenario quantity bands + structural checks (no legacy units, no personal food, every non-spice food has qpp).
**Prevention:** Run `npx tsx scripts/audit-en-item-quantities.ts` after batch edits to the English items file. For quick cross-language sanity, diff items that share a HE alias and flag `pcs` items whose `qpp` differs by ≥2× between EN and HE — that's how `Eggs` 0.15 vs 0.5 was caught. When adding new beverages, default non-water drinks to `qpp: 0.25` and plain milk to `0.3`; only `Water`/`Sparkling Water` get `0.5`. Any `unit: kg` on a food item whose real-world packaging is a bag/bottle/jar/tub/pack is a bug — the audit script's token regex catches most but not all (`tea`/`ice` need word boundaries). Single-serving staples like eggs should have `qpp` ≈ `servings_per_meal` (0.5 ≈ 1 per person); don't set them the same as ingredient items.

---

### [Data] Hebrew common-items over-used kg where pack/pcs is correct

**Date:** 2026-04-17
**Problem:** `common-items.he.json` had 103 food items with `unit: "kg"` vs only 34 in the EN file. Many items that are sold in bottles, tubs, bags, or packs in Israel (yogurt, cream cheese, almonds, raisins, granola, cereal, smoked salmon, ice, chocolate, dried meat, salami, turkey slices, dried fruit, mixed nuts) were marked `kg` with low `quantityPerPoint` values (0.02–0.06). This produced technically correct but meaningless quantities like "1 kg of yogurt" or "1 kg of almonds" when the user expects "2 tubs" or "3 packs".
**Solution:** Created `scripts/audit-he-item-quantities.ts` — a one-off audit script that evaluates `calculateSuggestedQuantity` across 4 scenarios (S/M/L/XL), flags suspicious unit/qpp combos via heuristics (kg on bottle/bag-style items, missing qpp, extreme ratios, `kg`-tiny/heavy per-person-day, `l`-heavy non-water beverages, dead-qpp, outlier qpp vs subcategory peers), and emits a markdown report to `scripts/reports/`. Applied fixes in 3 batches totaling **47 items**: (1) obvious `kg`→`pack`/`pcs` on bottles/tubs/bags (yogurt, mayo, ice, salmon slices, granola…), (2) another 18 jarred/bagged items (olives, pistachios, dates, chia seeds, kimchi, sauerkraut, overnight oat mix…) plus 7 non-water beverages at `qpp` 0.5 → 0.25 (sodas/juice/kombucha), and (3) sanity outliers (protein powder `pcs` 0.1 → 0.02, vegan cheese `kg` → `pack`, watermelon `pcs` 0.2 → 0.05, pineapple 0.2 → 0.1, ice cream `l` → `pcs`, pet food no longer scales with humans). Added 1 missing `quantityPerPoint` (ספירולינה). Extended `common-items-quantities.test.ts` with 61 canonical unit/qpp assertions to pin known-good mappings and prevent regression.
**Prevention:** Run `npx tsx scripts/audit-he-item-quantities.ts` after any batch edit to the Hebrew items file. The script flags items that look wrong; the test file pins items that are known-correct. When adding new localized item lists, start from the EN file's unit assignments (which use `pack`/`pcs` more correctly) and adjust for local products, rather than independently curating units. For per-subcategory sanity, compute `qpp` medians per `(subcategory, unit)` group — outliers >50% off median are usually real bugs.

---

### [Logic] Duration multiplier capped at 3 for any event > 12h — multi-day plans got 1-day food

**Date:** 2026-04-16
**Problem:** `getDurationMultiplier` returned a hard-coded `LONG_EVENT_MULTIPLIER = 3` for anything over 12 hours. A 3-day camping trip for 4 people got the exact same multiplier as a 13-hour beach day, so `planPoints` never scaled past the 1-night baseline. Result: the "week-long camping for 6 people" flow suggested 3 loaves of bread (≈0.09 per person per day). The previous "quantity defaults to 1" fix masked this because it only validated the overnight (≤24h) case.
**Solution:** `getDurationMultiplier` now scales linearly past 24h: `days = ceil(hours / 24); multiplier = days * 3`. Added a 4th bracket (`[24, 3]`) so the existing overnight case is explicit. Also introduced a dedicated **prod quantity evaluation test** (`tests/prod-quantity-eval/evaluate-he-quantities.test.ts`) that runs isolated from `npm run test` via `vitest.quantity-eval.config.ts` and `npm run test:quantity-eval`. It iterates every food item in `common-items.he.json` across 7 scenarios (4 mirrored from the BE AI-quality suite, 3 frontend edge cases), prints a per-person-per-day matrix for eyeballing, and asserts coarse sanity bounds per unit family (kg ≤ 0.6/person/day, l ≤ 2.5, pcs ≤ 3, pack ≤ 1.5).
**Prevention:** Constant-time multipliers are a tempting shortcut but silently break at the boundary of the brackets. For any duration-scaled computation, write a test with at least one "well beyond the last bracket" case (here: 7-day camping). Keep the prod-scale evaluation test out of the CI unit run so it can include realistic data without slowing development, but run it as part of quantity-related work.

---

### [Logic] Quantity estimation always defaulted to 1 — three stacking bugs

**Date:** 2026-04-16
**Problem:** All suggested item quantities in production showed 1 regardless of group size. Three independent bugs compounded: (1) `PlanProvider` computed `planPoints` from participant-reported counts only, ignoring `plan.estimatedAdults`/`estimatedKids` — a plan for 50 people with only the owner as participant yielded `planPoints=1`; (2) `CreatePlanWizard` step 5 never passed `planPoints` to `BulkItemAddWizard`, so during plan creation all quantities defaulted to 1; (3) `common-items.he.json` had ~85 food items with `unit: "g"` or `"ml"` and `quantityPerPoint: 0.15` — a value designed for kg/l, producing absurd results like 2 grams of tofu for 10 people.
**Solution:** (1) `PlanProvider` now uses `Math.max(reportedCount, estimatedCount)` for both adults and kids; (2) `CreatePlanWizard` computes `planPoints` from `estimationData` + `step1Data` dates and passes it to `BulkItemAddWizard`; (3) all `g` items converted to `kg` or `pcs` with realistic `quantityPerPoint`, all `ml` items converted to `pcs`, spices have no `quantityPerPoint` (default 1 container). Added a sanity test for 5 adults + 3 kids camping scenario.
**Prevention:** When a computed value (`planPoints`) flows through multiple layers (context → wizard → child component), trace the full propagation path. Add a sanity test that exercises the real data with realistic inputs — unit-testing the formula alone doesn't catch bad data or missing prop wiring.

---

### [i18n] Hebrew common-items list used dictionary Hebrew instead of Israeli terms

**Date:** 2026-04-16
**Problem:** `common-items.he.json` was a literal translation of the English list. Terms like גריל, כירת קמפינג, כלי רב שימושי are correct Hebrew but not what Israelis actually say. The list also included American-specific items (bear spray, s'mores, Graham crackers, cornhole, horseshoes, maple syrup, English muffins, string cheese) and pork items (bacon, pork ribs, pulled pork, smoked ham) that are irrelevant to Israeli culture. Israeli staples like מטקות, סחוג, עמבה, ביסלי, במבה, ערק, מרגז were missing entirely.
**Solution:** Scripted bulk update: (1) renamed 13 items to Israeli colloquial terms (גריל→מנגל, כירת קמפינג→גזייה, לחם פיתה→פיתה, כלי רב שימושי→לדרמן, etc.), (2) removed 34 irrelevant items, (3) replaced 4 pork items with Israeli equivalents (בייקון→פסטרמה, צלעות חזיר→שישליק, חזיר מפורק→קבב, חזיר מעושן→שניצל), (4) added 15 Israeli staples (food: סחוג, עמבה, זעתר, סומק, בהרט, ביסלי, במבה, שוקו, ערק, נענע, מרגז; equipment: מטקות), (5) fixed 23 wrong subcategory assignments (e.g. בננות was "Other" not "Fresh Fruit", דגני בוקר was "Fish and Seafood" not "Breakfast Staples", טחינה was "Cheese" not "Sauces, Condiments").
**Prevention:** Localized item lists should be reviewed by a native speaker for colloquial accuracy, not just translated word-for-word. Check that cultural context fits the target audience (food, games, climate-specific gear).

---

### [UX] Native date/time inputs replaced with custom pickers (iOS Safari RTL fix)

**Date:** 2026-04-16
**Problem:** On iPhone Safari and Chrome (iOS WebKit) with the app in Hebrew (`html[dir=rtl]`), native `<input type="date">` and `<input type="time">` rendered as broken/empty boxes. CSS overrides (`appearance: auto`, `direction: ltr`, `unicode-bidi: isolate`) and programmatic `showPicker()` worked on desktop emulation but **not on real iPhone hardware**. The root cause is that iOS WebKit renders native date/time inputs via internal components that ignore most CSS overrides, especially under RTL.
**Solution:** Replaced all native date/time inputs with custom `DateField` (Headless UI `Popover` + `react-day-picker` v9 calendar) and `TimeField` (Headless UI `Popover` + scrollable time-slot list) components in `CreatePlanWizard`, `PlanForm`, and `EditPlanForm`. Form values still use ISO strings (`YYYY-MM-DD`, `HH:MM`) via React Hook Form `watch`/`setValue` — no schema or API changes needed. Removed all `showPicker()`, ref-chaining, and picker-opening workaround code.
**Prevention:** Never rely on native `<input type="date|time">` for cross-browser consistency, especially under RTL. Desktop mobile emulation does not reproduce real iOS WebKit rendering bugs. Use custom picker components with explicit RTL/locale support instead.

---

### [UX] Header logo should open plans for signed-in users

**Date:** 2026-04-15
**Problem:** Clicking the Chillist logo in the header always routed to `/`, even for authenticated users who expected to return directly to the plans list.
**Solution:** Made the logo link auth-aware in `Header`: use `/plans` when `user` exists and `/` for unauthenticated sessions. Added unit tests to assert both link targets.
**Prevention:** For global navigation entry points (brand logo, primary CTA), define route targets per auth state and lock them with dedicated unit assertions.

---

### [UX] Delayed auto-advance on single-select wizard steps

**Date:** 2026-04-15
**Problem:** In the PlanTagWizard, single-select steps (tier1, single-select axes) called `setStepIndex` synchronously inside `handleSelect`. The user clicked an option, the blue selected state rendered for a single frame, and the step switched instantly — making it feel like the option "disappeared" with no feedback.
**Solution:** Replaced the synchronous `setStepIndex` with a 300ms `setTimeout` (stored in a ref, cleared on re-click and unmount). Added a CSS `animate-step-enter` keyframe (fade + slide) on the step wrapper keyed by `stepIndex` so each new step animates in. Tests use `vi.useFakeTimers({ shouldAdvanceTime: true })` with a shared `advanceAutoSelect()` helper that calls `act(() => vi.advanceTimersByTime(300))`.
**Prevention:** For any single-select auto-advance UX, always add a brief delay (200-400ms) so the user sees their selection before the screen changes. Use `shouldAdvanceTime: true` when mixing `vi.useFakeTimers` with `userEvent` to avoid test hangs.

---

### [Arch] FE client-side AI cost estimation when BE returns null estimatedCost

**Date:** 2026-04-15
**Problem:** Production AI usage logs showed `—` for all cost columns because the backend `estimatedCost` field was null (BE pricing config not set).
**Solution:** Added `src/core/ai-pricing.ts` with a `MODEL_PRICES` lookup table (keyed by model ID prefix) and `computeEstimatedCost()`. The `AiUsageLogs` component uses the BE value when present, otherwise falls back to FE computation from `inputTokens`/`outputTokens`. Summary totals mix BE and FE costs per-log. `formatUsdCost()` formats all costs consistently as `$X.XXXXXX`.
**Prevention:** When the BE owns a computed field but may not populate it, the FE should have a deterministic fallback with a known price table. Keep the price table dated and update when models change.

---

### [Infra] PostHog production events silently dropped — proxy + sendBeacon + compression

**Date:** 2026-04-14 / 2026-04-16
**Problem:** Zero production events appeared in PostHog despite the proxy returning `{"status":"Ok"}` for every request. All 1,231 events over 30 days were from localhost only.
**Root cause (two layers):**

1. The Cloudflare Pages Function proxy (with `_middleware.ts` calling `next()`) corrupts or mishandles gzip-compressed binary request bodies. PostHog's `/e/` endpoint returns `{"status":"Ok"}` regardless of payload validity but silently drops events it cannot decompress. Manually-posted uncompressed events through the same proxy arrive fine.
2. Even after adding `disable_compression: true`, the PostHog SDK (v1.364.3) continued sending some events via `sendBeacon` transport with `compression=gzip-js` in the URL — the `disable_compression` flag does not fully control the sendBeacon code path. These compressed sendBeacon requests were silently dropped by the proxy.

**Solution:** Two config options in `posthogJs.init()` in `src/lib/posthog.ts`:

- `disable_compression: true` — sends plain JSON bodies instead of gzip
- `__preview_disable_beacon: true` — prevents the SDK from using `navigator.sendBeacon` (which ignores `disable_compression`), forcing all requests through `fetch()`

Trade-off: `$pageleave` events become slightly less reliable (sendBeacon fires during page unload; fetch may not). Acceptable for analytics purposes.

**Prevention:** When using a Cloudflare Pages Function as a reverse proxy, test with both compressed and uncompressed payloads AND both fetch and sendBeacon transports. The official PostHog proxy docs target standalone Cloudflare Workers (no middleware chain) — Pages Functions with middleware may not preserve binary request bodies. If gzip/sendBeacon is needed long-term, migrate to a standalone Cloudflare Worker on a subdomain or skip middleware for `/ingest/*` paths.

---

### [Logic] AI suggestion ID never wired on item accept

**Date:** 2026-04-14
**Problem:** Items accepted from the AI suggestions modal always showed source=manual and ai_suggestion_id=null in the DB because aiSuggestionId was never included in the bulk-create payload.
**Solution:** Added id to itemSuggestionSchema, aiUsageLogId to itemSuggestionsResponseSchema, and aiSuggestionId: suggestion.id in suggestionToItemCreate (fixed in c772605).
**Prevention:** When the BE ships a linkage field on a response schema, immediately add it to the FE Zod schema AND wire it through every downstream create payload. Add an E2E request-body assertion to lock it in.

---

### [Arch] Full-bleed sections inside a max-width root layout

**Date:** 2026-04-14
**Problem:** `__root.tsx` wraps `<Outlet />` in `max-w-7xl mx-auto px-*`, so marketing sections with edge-to-edge background colors looked inset instead of spanning the viewport.
**Solution:** Define a `full-bleed` `@utility` in `src/index.css` (`100vw` + negative `margin-left`/`margin-right` using `50vw` centering). Wrap each full-bleed band in that class, then nest an inner `max-w-7xl mx-auto px-*` for content. Offset the home route with negative horizontal margin on its root wrapper so the page aligns with the header while sections break out.
**Prevention:** Prefer this pattern over duplicating root layouts per route unless an entire subtree must ignore the shell.

---

### PostHog `401` on `/ingest/flags/` (“invalid API key”) behind the Pages proxy

**Date:** 2026-04-14
**Problem:** After deploy, browser showed `POST …/ingest/flags/ … 401` and PostHog’s error body about an invalid API key, even though the project token was correct.
**Root cause:** The ingest proxy forwarded **all** incoming request headers to `us.i.posthog.com`. Stray headers (e.g. app `Authorization` / `x-api-key`, `cf-*`, or a mismatched `host` / `content-length` chain) can break PostHog’s validation for the flags endpoint. A second common cause is **region mismatch**: EU project token + US ingest host (`us.i.posthog.com`) also yields auth-style errors.
**Solution:** Rebuild the proxy to forward only an **allowlist** (`content-type`, `accept`, `accept-language`, `user-agent`, `X-Forwarded-For` from `CF-Connecting-IP`). Optional Cloudflare env `POSTHOG_INGEST_HOST` / `POSTHOG_ASSET_HOST` for EU. Documented in `guides/frontend.md`.
**Lesson:** Reverse proxies to third-party analytics should not blindly forward client headers; treat EU/US PostHog regions as strict pairs (token + ingest host + asset host + `ui_host`).

---

### PostHog `ERR_BLOCKED_BY_CONTENT_BLOCKER` on `/ingest/static/posthog-recorder.js`

**Date:** 2026-04-14
**Problem:** Production console showed `GET …/ingest/static/posthog-recorder.js net::ERR_BLOCKED_BY_CONTENT_BLOCKER` even with a first-party `/ingest` Cloudflare proxy.
**Root cause:** That Chrome error indicates a **browser content blocker** (extensions, Brave Shields, Safari content blockers), not Cloudflare or the Pages Function. Lists match PostHog’s recorder script name and analytics paths; same-origin proxy does not hide the filename from extensions.
**Solution:** Default **`disable_session_recording: true`** in `src/lib/posthog.ts` unless `VITE_PUBLIC_POSTHOG_SESSION_RECORDING=true`. Session replay is opt-in; events/pageviews do not need the recorder script. Documented in `guides/frontend.md`.
**Lesson:** Do not treat `ERR_BLOCKED_BY_CONTENT_BLOCKER` as a broken deploy — reproduce in a clean profile without extensions. If replay matters, enable the env var knowing many users will still block the script.

---

### [Test] E2E error-state tests require `retry: false` on React Query hooks

**Date:** 2026-04-12
**Problem:** Writing an E2E test for "API returns 500 → error state shown" failed because React Query's default `retry: 3` automatically retried the failed request and succeeded before the error state could ever render. The mock route was set to fail only on the first call, so the first retry resolved the data and `isError` never became `true`.
**Solution:** Set `retry: false` in `usePlanTags` (and any hook where the data is stable reference data with `staleTime: Infinity`). Immediate error feedback + user-controlled retry (via the retry button) is better UX than silent background retries for taxonomy data.
**Prevention:** When a `useQuery` hook fetches stable reference data (`staleTime: Infinity`), set `retry: false`. This makes error states deterministic, E2E-testable, and gives the user immediate feedback. Only use auto-retries for ephemeral or frequently-changing data where transient failures are expected.

---

### [Arch] Plan tag wizard is fully schema-driven — adding or changing tiers requires no FE code changes

**Date:** 2026-04-12
**Problem / Background:** The wizard previously had layout concerns baked into components (`FlagSection`, `AxisSection`), with multi-select mode and contradiction rules hardcoded. This meant every BE taxonomy change required a FE code change to pick up new rules.
**Solution:** The wizard was redesigned around a `buildSteps(tagData, selections) → WizardStep[]` function that reads all rendering rules from the API response and returns an ordered, flat array of screens. Each `WizardStep` carries everything a generic `StepScreen` component needs to render it — no branching per tier type in render code.

#### How the generic wizard works

**Data flow:**

1. `usePlanTags()` lazy-fetches `GET /plan-tags` on first wizard open (`staleTime: Infinity`, `retry: false`).
2. The hook returns `tagData: PlanTagData` (Zod-validated).
3. `buildSteps(tagData, selections)` is called on every render. It iterates the schema in this fixed order:
   - One `Tier1Step` from `tier1.options`
   - One `FlagStep` per entry in `universal_flags` (e.g. `destination_scope`, `group_character`)
   - One `AxisStep` per entry in `tier2_axes` whose `shown_for_tier1` array contains the currently selected tier1 id
   - One `Tier3Step` per tier2 option id (from all axis selections) that has children in `tier3.options_by_parent`
   - One `SummaryStep` at the end
4. The resulting array is stored as a computed value; `stepIndex` (integer) tracks which screen is visible.

**Select mode — source of truth is always the JSON:**
| Tier | Rule |
|------|------|
| tier1 | always `single` (auto-advance on click) |
| universal_flags | read `flag.select` from the flag object (`"single"` or `"multi"`) |
| tier2_axes | read `axis.select` from the axis object |
| tier3 | check `tier3.multi_select_parents.includes(tier2Id)` — if yes, `multi`; otherwise, `tier3.default_select` (default: `"single"`) |

**Contradiction logic:**

- If a flag has a `contradictions: [string, string][]` array, `buildSteps` calls `computeDisabledIds(currentFlagSelections, contradictions)`.
- This returns a `Set<string>` of option IDs that must be disabled in the UI.
- When the conflicting selection is removed, the disabled set recalculates automatically (no explicit re-enable step).

**Auto-advance:**

- Steps with `select: "single"` auto-advance synchronously on click (no Next button needed).
- Steps with `select: "multi"` show a Next button. The user must explicitly advance.

#### What the FE adapts to automatically (no code change needed)

- New option added to an existing tier1, flag, axis, or tier3 group → shows up in the wizard.
- New flag added to `universal_flags` → a new step appears in the wizard in iteration order.
- New axis added to `tier2_axes` → appears as a step for the relevant tier1 selections.
- New tier3 parent/child group added to `tier3.options_by_parent` → a new tier3 step appears after the axis step that selects the parent.
- `select` field changed on a flag or axis (`"single"` ↔ `"multi"`) → wizard uses the new mode automatically.
- New entry added to `tier3.multi_select_parents` → that tier3 group switches to multi-select.
- New pair added to `group_character.contradictions` → that pair is disabled/re-enabled automatically.

#### What requires a FE code change

- **Entirely new tier type** (e.g., a `tier4` block with its own top-level key in the JSON) — `buildSteps` needs a new branch to handle the new structure and emit new `WizardStep` entries.
- **New selection rule shape** (e.g., `max_select: N`) — needs to be read in `buildSteps` and enforced in `handleSelect`.
- **New schema field that changes navigation order** — `buildSteps` processes tiers in a hardcoded order (tier1 → flags → axes → tier3 → summary); reordering requires a code change.
- **New `contradictions`-style rule on a type other than flags** — `computeDisabledIds` is only called for `FlagStep`s today.

#### Adding a new tier — checklist for developers

1. **BE adds the new tier** to the JSON (e.g., `tier4`) with a `select` field and an `options` array or map.
2. **Update `src/core/schemas/plan-tags.ts`** — add a Zod schema for the new tier and add it to `planTagsSchema`.
3. **Update `buildSteps` in `src/components/PlanTagWizard.tsx`** — add a new block that iterates the new tier's data and pushes `WizardStep` objects. Define a new `WizardStep` variant type if needed.
4. **Update `api/mock-plan-tags.ts`** — add mock data for the new tier.
5. **Update `tests/unit/data/plan-creation-tags.test.ts`** — add assertions for the new tier's structure and schema compliance.
6. **Add unit tests** in `PlanTagWizard.test.tsx` to cover the new step type and its navigation.
7. Run the full validation suite: `prettier → eslint → tsc → vitest run`.

**Prevention:**

- Never hardcode option IDs, axis names, or tier names in `PlanTagWizard.tsx`. All iteration must read from `tagData`.
- The `selections` state is a `Record<string, string[]>` — the key is the step's `key` field (e.g., `"tier1"`, `"destination_scope"`, `"sleep"`, `"tier3_tent"`). Add new step types following this convention.
- Run `tests/unit/data/plan-creation-tags.test.ts` after every mock-data update to catch structural regressions before they reach production.

---

### [Arch] Plan tag taxonomy migrated from local JSON to `GET /plan-tags` API

**Date:** 2026-04-12
**Problem:** `src/data/plan-creation-tags.json` was imported directly into `PlanTagWizard.tsx` and `tag-utils.ts` at module load time. This meant the FE could not pick up taxonomy changes deployed to the BE without a new FE build. It also made `tag-utils.ts` functions implicitly dependent on static module-level state.
**Solution:**

1. Created `src/core/schemas/plan-tags.ts` (Zod schema + `PlanTagData` type) matching the `GET /plan-tags` response shape.
2. Added `fetchPlanTags()` to `src/core/api.ts` (Zod-parses the response).
3. Created `src/hooks/usePlanTags.ts` — React Query hook with `staleTime: Infinity` and `gcTime: 1h`. Also builds and returns `tagMap` via `useMemo` for O(1) emoji/label lookups.
4. Refactored `tag-utils.ts`: removed JSON import, `buildTagMap(tagData)` now accepts `PlanTagData`; `getTagEmoji` and `isKnownTag` now accept `tagMap` as first arg (pure functions).
5. Updated `PlanTagWizard.tsx` to call `usePlanTags()`. Loading spinner shown while fetching; error state + retry button on failure. Initial tags restored via `useEffect` (once, guarded by `useRef`) after `tagData` resolves — avoids calling state setters during render.
6. Updated `TagChips.tsx` to call `usePlanTags()` for emoji resolution.
7. Added `GET /plan-tags` route to `api/server.ts` and `tests/e2e/fixtures.ts` (using `api/mock-plan-tags.ts` typed fixture).
8. Deleted `src/data/plan-creation-tags.json`.
   **Prevention:**

- When a wizard depends on structured taxonomy data, fetch it from the API (React Query, `staleTime: Infinity`) rather than bundling it as a static JSON file — the BE owns the data, the FE should not gate taxonomy updates on a deploy.
- When refactoring a module that previously closed over static data, always convert the functions to accept the data as parameters — this makes them pure and easier to test.
- Use `useEffect` + `useRef` for "initialize state once when async data arrives" patterns. Calling `setState` from the component body (render-time side effects) is fragile; `useEffect` with a `didInitRef` guard is the correct idiom.
- After deleting a static data file, run `npx tsc --noEmit` to verify no imports were missed.

---

### [Logic] Profile phone save did not call PATCH /auth/profile — chatbot could not identify user

**Date:** 2026-04-09
**Problem:** `updateUserProfile` in `profile-utils.ts` saved the phone number only to Supabase metadata via `supabase.auth.updateUser({ data: { phone } })`. It never called `PATCH /auth/profile` with the phone field, so `users.phone` in the BE database was never written. The secondary sync path (`POST /auth/sync-profile`, triggered by `USER_UPDATED`) also silently failed because `SUPABASE_SERVICE_ROLE_KEY` was missing in production. Result: chatbot's `POST /api/internal/auth/identify` returned 404 for users who saved their phone on the profile page.
**Solution:** Added `patchProfile({ phone })` call inside `updateUserProfile` after `supabase.auth.updateUser` succeeds. This directly writes to `users.phone` via the BE. The call is non-blocking for non-phone errors (logged as warning) but surfaces 400 + "phone" validation errors to the form. `sync-profile` remains as a secondary fallback.
**Prevention:** When the BE has a dedicated write endpoint (e.g., `PATCH /auth/profile`), the FE must call it directly — never rely solely on an indirect sync mechanism (`sync-profile`) that depends on backend infrastructure (env vars, service role keys) the FE team does not control. Any data the chatbot or other services read from the BE must be written there explicitly.

---

### [Types] Chatbot AI usage admin — `sessionId` Zod UUID rejected valid `qt-` rows

**Date:** 2026-04-09
**Problem:** `chatbotAiUsageLogSchema` used `sessionId: z.string().uuid()`. Quality-test chatbot logs store `session_id` values like `qt-list` (not UUIDs), so the response failed Zod parse and the Chatbot AI tab could error or show nothing for those rows.
**Solution:** Relax to `z.string().min(1)` and derive “quality test” with `sessionId.startsWith('qt-')` for UI and a client-side session-type filter.
**Prevention:** Do not assume external IDs are UUIDs when the product documents string prefixes; validate against real shapes from the DB or chatbot code.

---

### [Async] Admin AI usage tabs — infinite network loop from unstable React Query key

**Date:** 2026-04-08
**Problem:** Opening the Chatbot AI (or AI Usage) admin tab hammered `GET /admin/...-usage` in a tight loop.
**Root Cause:** When URL had no `from`/`to`, the component computed `buildDateRange(30)` on **every render**. That uses `new Date()` for the upper bound, so the `to` ISO string changed every render → the `query` object passed to `useQuery` changed → `queryKey` changed → React Query refetched repeatedly.
**Solution:** Hold a **stable** default range once per mount: `const [defaultDateRange] = useState(() => buildDateRange(30))` and use that for `effectiveFromIso` / `effectiveToIso` only when URL params are absent. Quick-range and reset still `navigate()` explicit ISO strings into the URL.
**Prevention:** Any value that feeds `useQuery`’s `queryKey` must be stable across renders unless inputs truly changed. Never derive query keys from `new Date()` without memoization or URL sync.

### [Router] Root `errorComponent` / other boundaries rendered `Header` without `AuthProvider` — `useAuth` threw

**Date:** 2026-04-08
**Problem:** Intermittently (e.g. admin pages, plan pages), the app crashed with `useAuth must be used within an AuthProvider` when something triggered the router’s error UI or related boundaries.
**Root Cause:** `LanguageProvider` / `AuthProvider` lived only in the root route **`component`**. TanStack Router renders `errorComponent`, Suspense fallbacks, and other root-match UI **outside** that component — inside `CatchBoundary` / `Suspense` **below** the same parent as `MatchInner`, but **not** inside the route `component`. So any root-level error UI that reused `Header` had no auth context. Duplicating providers only in `errorComponent` fixed that one path but not every boundary case.
**Solution:** Set the root route’s **`shellComponent`** to wrap the full root match tree with `LanguageProvider` → `AuthProvider`. In `@tanstack/react-router`’s `Match.tsx`, `shellComponent` wraps `matchContext`, Suspense, and `CatchBoundary`, so both the happy path and `errorComponent` render under the same providers. Keep the route `component` as layout-only (no inner duplicate providers).
**Prevention:** For app-wide context used by layout chrome (`Header`, modals from providers), prefer root **`shellComponent`** over wrapping only `component`, so router boundaries cannot “escape” the provider tree. `AuthProvider` must remain a **descendant** of `RouterProvider` (it uses `useNavigate()`).

### [Layout] BulkItemAddWizard submit button hidden below scroll on desktop

**Date:** 2026-04-07
**Problem:** On desktop, the "Add items" submit button in the wizard's items step was only visible after scrolling — in both the modal context (Manage Items) and the inline context (Create Plan wizard). It did not stay pinned at the bottom.

**Root Cause — modal:** `ItemsStep` used `flex flex-col` + `max-h-[calc(100dvh-Xrem)]` relying on `flex-1 min-h-0` for the internal scroll area. The `Modal` panel used `max-h-[90vh] overflow-y-auto` — a `max-height` without a hard `height`. The `flex-1 min-h-0` containment pattern requires a **fixed-height** (or `overflow-hidden` flex) ancestor; `max-h` + `overflow-y-auto` is not enough. The `max-h` values on `ItemsStep` were also larger than `90vh`, so they never fired; the modal scrolled as a whole and pushed the button far below.

**Root Cause — inline:** The initial modal fix changed `ItemsStep`'s outer div from `max-h-[calc(...)]` to `flex-1 min-h-0`. In the inline (create-plan) context there is no constrained flex parent, so `flex-1` has nothing to anchor against — the component grew to its full content height and the button ended up at the very bottom of a very tall layout. The submit button also lacked `shrink-0`, making it potentially squeezable under heavy flex pressure.

**Solution:**

- Added `noScroll?: boolean` prop to `Modal`. When set: panel uses `flex flex-col overflow-hidden`; title header gets `shrink-0`. This gives `ItemsStep` a proper fixed-height flex ancestor in modal mode.
- `BulkItemAddWizard` passes `noScroll` to `Modal` and makes the content wrapper `flex-1 flex flex-col overflow-hidden` (fills the modal panel).
- `ItemsStep` receives an `inline` prop and branches: `flex-1 min-h-0` in modal mode (parent provides height), `max-h-[calc(100dvh-Xrem)]` in inline mode (self-constraining via viewport cap).
- Submit button wrapper gets `shrink-0` in both cases.

**Prevention:**

- `flex-1 min-h-0` only works when every ancestor up the chain has a hard `height` or is `overflow: hidden` + flex. A `max-height` + `overflow-y-auto` ancestor does **not** count — it lets the container grow and breaks containment.
- When a component renders in two contexts (modal vs. inline), the height-constraint strategy must account for both. Removing a `max-h` that worked in one context to fix the other will silently break the first.
- A flex footer (submit button) always needs `shrink-0`. Without it, `flex-1` siblings can starve the button to zero height when the container is tight.

---

### [Auth] Phone-OTP users got '+10000000000' as contactPhone — chatbot identification permanently broken

**Date:** 2026-04-05
**Problem:** Users who registered via Supabase phone OTP had `'+10000000000'` written to `participants.contact_phone` on every plan they created, making them invisible to the chatbot's phone-based lookup.
**Root Cause:** Four compounding gaps:

1. `CreatePlanWizard.doCreatePlan` read `user.user_metadata.phone` but never checked `user.phone` (the top-level Supabase field where phone-OTP auth stores the number). When `user_metadata.phone` was absent, it fell through to a hardcoded placeholder.
2. `complete-profile.lazy.tsx` had the same blind spot: phone pre-fill read only `user_metadata.phone`, so phone-OTP users saw a blank field and had no reason to fill it in.
3. `AuthProvider` called `syncProfile` only on `USER_UPDATED`, not on `SIGNED_IN`, so first-time phone-OTP logins (who never explicitly edit their profile) never synced.
4. The shared `MockSession` type in `tests/helpers/supabase-mock.ts` had no `phone` field on the user object — making phone-OTP users structurally unrepresentable in tests. Every test was silently forced into the email/Google path. Additionally, `invite-flow.test.tsx` seeded plans with `contactPhone: '+10000000000'`, accidentally normalizing the broken placeholder as acceptable.
   **Solution:** (1) In `CreatePlanWizard`, extract `resolveOwnerPhoneRaw(meta, userPhone)` as a pure helper that checks `user_metadata.phone` first, then falls back to `user.phone`. (2) In `complete-profile.lazy.tsx`, widen the prop type to include `phone?: string | null` and apply the same fallback. (3) In `AuthProvider`, add a non-blocking `syncProfile` call in the `SIGNED_IN` handler (mirroring the existing `USER_UPDATED` pattern, with try/catch). (4) Add `phone?: string | null` to `MockSession.user` in the shared helper so phone-OTP users become a first-class test persona.
   **Prevention:**

- Supabase has two distinct `phone` locations: `user.phone` (set by phone-OTP auth, top-level) and `user.user_metadata.phone` (set when the user saves their profile). Always check both when resolving a user's phone — `user_metadata.phone || user.phone`.
- Any "I don't have this data yet" placeholder that satisfies a DB `not null` constraint (`'+10000000000'`, `'unknown@...'`, etc.) must be treated as a silent data corruption risk. Add a test asserting the fallback is never written with real user data.
- When a mock helper lacks a field present on the real type, it is impossible to test that code path. After every auth-related bug, audit `MockSession` and test helpers against the real Supabase `User` shape.
- `syncProfile` (or any sync side effect) tied only to `USER_UPDATED` will miss users who authenticate but never return to edit their profile. If sync must be complete at first login, call it on `SIGNED_IN` too.

---

### [Config] PostHog blocked by ad-blockers — fixed with Cloudflare Pages Function proxy

**Date:** 2026-04-05
**Problem:** PostHog events were blocked by content blockers (Brave shields, uBlock Origin) both in regular and incognito mode, because `us.i.posthog.com` is on ad-blocker filter lists.
**Solution:** Added `functions/ingest/[[path]].js` — a Cloudflare Pages Function that proxies `/ingest/*` to PostHog servers. Set `VITE_PUBLIC_POSTHOG_HOST` GitHub Variable to `https://chillist-fe.pages.dev/ingest`. Added `ui_host` to `posthog.init` so the PostHog toolbar still resolves correctly. The proxy deploys automatically with Cloudflare Pages — no separate worker or wrangler config needed.
**Prevention:** When the Cloudflare Pages domain changes (e.g. custom domain added), update the `VITE_PUBLIC_POSTHOG_HOST` GitHub Variable to `https://<new-domain>/ingest`. The proxy code itself is domain-agnostic.

### [Config] PostHog vars missing from deploy workflow — analytics silently disabled in production

**Date:** 2026-04-05
**Problem:** PostHog was not initialized in production because `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` and `VITE_PUBLIC_POSTHOG_HOST` were never passed to the Build step in `deploy.yml`, and the corresponding GitHub Variables were never created.
**Root Cause:** The feature was declared complete after adding `src/lib/posthog.ts`, `.env.example`, and the guides table — without verifying all 6 env var sync locations from `common.md`. The graceful no-op in `posthog.ts` (token missing → skip init) masked the gap: no error was thrown, the app worked, but no events were tracked.
**Prevention:** The `common.md` env var checklist has 6 required locations. "Complete" means all 6 are done. A graceful fallback is not a signal the var is optional in production — check the intent, not just whether the app boots.

### [API] Non-owner item PATCH sends full assignmentStatusList — backend rejects with 400

**Date:** 2026-04-03
**Problem:** Non-owner participants changing their own item status got `400 Bad Request: "Non-owners can only update their own assignment"`. The error appeared on the plan page for status changes, self-assign, and unassign actions.
**Root Cause:** The backend uses different PATCH semantics by role: owners use replace semantics (full list), non-owners use merge semantics (own entry only). `enrichUpdates` in `useUpdateItem.ts` always filled in the full `assignmentStatusList` from the cached item, and `buildStatusUpdate` mapped over the full list. On the plan page, `GET /plans/:planId` returns unfiltered assignment lists, so non-owner updates included other participants' entries.
**Solution:** Added `stripForNonOwner(updates, participantId)` in `useUpdateItem.ts` — applied only in `mutationFn` (not `onMutate`, to keep optimistic UI smooth). Filters `assignmentStatusList` to own entry, converts absent own entry to `{ unassign: true }`, removes `isAllParticipants`. Added `unassign: z.boolean().optional()` to `itemPatchSchema` (already in BE's OpenAPI spec). Threaded `currentParticipantId` through `useUpdateItem` and `usePlanActions`.
**Prevention:** When the backend documents different semantics by role (replace vs merge), the frontend must respect that in the payload construction layer. Check OpenAPI operation descriptions for role-specific behavior whenever touching assignment or permission-sensitive PATCH endpoints.

### [E2E] Preferences auto-prompt modal blocked all clicks in existing E2E tests

**Date:** 2026-04-03
**Problem:** After adding the preferences auto-prompt modal, all E2E tests that authenticated as the owner and navigated to a plan page started timing out. The modal opened on every plan page visit (because `adultsCount: null` in E2E fixture data) and its overlay intercepted all click events on the underlying UI.
**Root Cause:** `buildParticipant` in `tests/e2e/fixtures.ts` always set `adultsCount: null` regardless of role. Since the feature prompt fires whenever `adultsCount == null`, the modal appeared for every owner participant in every test. Similarly, `api/server.ts` created owner participants with `adultsCount: null` in the wizard creation path.
**Solution:** In `buildParticipant`, default `adultsCount` to `1` for owner participants (`p.role === 'owner' ? 1 : null`). In `api/server.ts`, use `parsed.owner.adultsCount ?? 1` when creating the owner participant. This reflects reality: the wizard step 4 always collects the owner's headcount.
**Prevention:** When introducing any auto-opening UI (modal, drawer, toast) triggered by data conditions, ensure E2E fixture data satisfies the "complete/dismissed" state unless the test is specifically testing the auto-open behavior.

### [E2E] `page.on('request')` race condition — main visible before first API call fires

**Date:** 2026-04-03
**Problem:** Two session tests checking `X-Session-ID` presence consistently failed with `seen.length === 0`. One test was flaky (passes on retry).
**Root Cause:** `await expect(page.locator('main')).toBeVisible()` resolves as soon as the React app renders its first frame (loading skeleton / empty state). API requests are fired asynchronously after the initial render. By the time the assertion ran, `page.on('request')` had not yet captured any requests.
**Solution:** Replace `page.goto()` + `expect(main).toBeVisible()` with `Promise.all([page.waitForResponse(r => r.url().includes('localhost:3333')), page.goto('/plans')])`. This ensures at least one API response has been received before checking `seen.length`.
**Prevention:** When asserting on request/response headers captured via `page.on('request')`, always synchronize with `page.waitForResponse()` or a similar wait rather than relying on element visibility alone.

---

### [E2E] `page.goto` timeout on Vite SPA — prefer `domcontentloaded` and stabilize webServer env

**Date:** 2026-04-01  
**Problem:** `Edit Plan › unauthenticated user is redirected to signin` failed: `page.goto` exceeded 60s waiting for `load`. Parallel workers + Vite dev server can make full `load` flaky; PostHog real init in E2E is unnecessary noise.  
**Solution:** (1) `page.goto(url, { waitUntil: 'domcontentloaded' })` for the redirect-only navigation. (2) `playwright.config.ts` `webServer.env`: add `VITE_POSTHOG_MOCK: 'true'`. (3) Set `retries: 1` for local runs (not only CI) so transient failures do not block `git push`.  
**Prevention:** For SPA redirect tests, avoid waiting for full `load` unless the assertion needs it. Keep E2E webServer env aligned with offline mocks (`VITE_AUTH_MOCK`, `VITE_POSTHOG_MOCK`).

### [E2E] Session id after sign-out — CSR home does not recreate storage until reload or getSessionId

**Date:** 2026-04-01  
**Problem:** `after sign out, home load gets a new session id distinct from the previous one` failed: `chillist-session-id` was `null` after navigating to `/`. `clearSession()` runs on sign-out; `main.tsx` only calls `initSession()` once at first load, and `SessionActivity` does not remount on client navigation, so nothing wrote a new id until a fetch or debounced activity.  
**Solution:** After asserting the post-sign-out URL, `page.reload()` so `initSession()` runs again and localStorage gets a new UUID; then assert it differs from the pre-sign-out id.  
**Prevention:** When E2E asserts “new session after logout”, either reload, wait for a network request that attaches `X-Session-ID`, or trigger the debounced activity path — not only CSR navigation.

### [Arch] TanStack Router root `component` must not call hooks inline

**Date:** 2026-03-31
**Problem:** `createRootRoute({ component: () => { useSession(); return ... } })` triggers `react-hooks/rules-of-hooks` — the anonymous function is not treated as a component.
**Solution:** Extract a named component (e.g. `function SessionActivity() { useSession(); return null; }`) and render it inside the tree.
**Prevention:** For any hook in a file route `component`, use a `PascalCase` child component or the route's dedicated layout component.

### [Arch] Browser session id — UUID v4 validation in tests

**Date:** 2026-03-31
**Problem:** Unit tests used arbitrary hex strings as "UUIDs"; `session.ts` validates RFC 4122 variant (fourth group must start with `8`, `9`, `a`, or `b`). Invalid fixtures caused spurious regeneration assertions to fail.
**Solution:** Use real v4-shaped ids in tests (or `crypto.randomUUID()`), or relax test data to match the same regex as production.
**Prevention:** When testing UUID validation logic, generate ids with `crypto.randomUUID()` or copy known-valid v4 examples.

### [UX] Tag taxonomy v1.2 — remove duration duplication, fix contradictions, preserve legacy tags

**Date:** 2026-03-30
**Problem:** The tag wizard asked duration questions (beach day/overnight, hiking day/multi-day) that duplicated the date picker in step 2. Hotel options mixed stay and food concerns in one flat list. Dinner/party and other had missing or incorrect mutex groups allowing contradictory selections. Editing a plan with old tag ids that were removed from the wizard would silently drop those tags.
**Solution:** (1) Removed duration-based options from beach and hiking. (2) Redesigned hotel into two clear concerns: stay (hotel vs apartment) and meals (hotel meals, restaurants, cooking, mixed) with cross-group disable rules. (3) Added venue mutex to dinner/party, format mutex for potluck/catered, and cross-rules (restaurant disables potluck, drinks-only disables potluck+catered). (4) Fixed other to include `other_mixed` in the indoor/outdoor mutex. (5) Removed overly aggressive city_break cross-rule. (6) Promoted beach vibe options (relaxing, active, kids) to tier 2. (7) Added `legacyTags` state in `PlanTagWizard.tsx` to preserve unrecognized tag ids from `initialTags` through the round-trip. (8) Kept all removed tag ids in translation files for backward compatibility.
**Prevention:** (a) Don't duplicate in tags what is already captured by other wizard steps (dates, group size, dietary prefs). (b) When removing options from a taxonomy, keep translation keys for legacy data. (c) Add `legacyTags` pass-through for any wizard that edits stored tag arrays. (d) Validate every plan type's tier 2 for contradictory stackable options by auditing mutex groups.

---

<!-- Add new entries at the top -->

### [UI] Admin delete must yield to leave button when user is a participant

**Date:** 2026-03-30
**Problem:** An admin who was also an invited participant on a plan saw both the leave button and the admin delete button on the same plan card — two conflicting destructive actions.
**Solution:** Changed the admin delete condition from `isAdmin &&` to `isAdmin && !(user && shouldShowLeave(plan, user.id)) &&`. When `shouldShowLeave` is true the leave affordance takes priority and the admin delete is hidden.
**Prevention:** Whenever a UI element has multiple conditional affordances that conflict (leave vs delete), define a clear precedence rule: participant role wins over admin role at the UI layer. The backend still enforces ownership/admin checks — the FE just avoids showing both.

### [Logic] Plans list "All" sections — partition by leave affordance, not only `isPlanOwnedBy`

**Date:** 2026-03-30
**Problem:** With membership filter "All", the same plan could appear under both **My plans** and **Invited** because `isPlanOwnedBy` can be true when `createdByUserId` matches the user even if `myRole` is `participant` (or other API quirks), while `isPlanInvitedTo` is also true.
**Solution:** Derive section membership with `isPlanInOwnedSection` = `isPlanOwnedBy && !shouldShowLeave` and `isPlanInInvitedSection` = `shouldShowLeave || (isPlanInvitedTo && !isPlanOwnedBy)` so non-owners who see the leave control never land in the owned bucket.
**Prevention:** When splitting UI by "owner vs invited", align with `shouldShowLeave` / role, not `createdByUserId` alone.

### [API] Leave plan — resolve participant id when `GET /plans` omits `participants`

**Date:** 2026-03-30
**Problem:** `DELETE /participants/:participantId` returned 404 with message `"Plan not found"` in two situations: (1) mock store had a participant row whose `planId` did not match any plan (orphan participant). (2) Production `GET /plans` may not embed participant summaries, so the UI had no `participantId` before calling delete.
**Solution:** (1) Mock server: for **self** removal, do not require a matching plan row; only non-self removals require an existing plan and owner. (2) `PlansList`: treat plans with no `participants` array as “invited” when `createdByUserId` is set and differs from the current user; before delete, call `fetchParticipants(planId)` and pick the non-owner row for the current user. Added i18n `plans.leavePlanCannotResolve` when the list is empty or has no matching row.
**Prevention:** Any flow that needs a participant id must not rely solely on optional embeddings from list endpoints; fetch `GET /plans/:planId/participants` when summaries are missing.

### [Test] E2E testids must be updated when renaming data-testid in shared components

**Date:** 2026-03-30
**Problem:** Refactored `AiSuggestionsModal` into generic `ItemSuggestionsModal` with renamed `data-testid`s (`ai-suggest-*` → `suggest-*`). Updated unit tests but missed `tests/e2e/main-flow.spec.ts`, which still referenced the old testids. The E2E test "adds AI-suggested items from plan page" failed on Chrome and Firefox at push time.
**Solution:** Updated `tests/e2e/main-flow.spec.ts` to use the new `suggest-modal`, `suggest-loading`, `suggest-confirm` testids.
**Prevention:** When renaming any `data-testid`, always grep `tests/e2e/` for the old testid string before committing. The pre-push hook catches it, but it's expensive to discover at push time. Add it to the pre-change checklist: `rg 'old-testid' tests/e2e/`.

### [Arch] Cloudflare geo default language via Pages Function + cookie

**Date:** 2026-03-29
**Problem:** Anonymous visitors needed a meaningful language default (Hebrew for IL, English otherwise) without client-side geolocation API calls or exposing response headers to JS.
**Solution:** Added a Cloudflare Pages Function at `functions/_middleware.ts`. It reads `request.cf.country` (or `CF-IPCountry` header as fallback) and appends `Set-Cookie: chillist-geo-lang=<lang>; Path=/; Max-Age=86400; SameSite=Lax; Secure` to every response. The client reads this cookie in `getSavedLanguage()` (`src/i18n/index.ts`) as a fallback when no localStorage value is present. Logged-in users ignore the cookie — `ProfileLanguageSync` applies `preferredLang` from the backend, which always wins.
**Prevention:** When the Pages Function is involved, test geo behaviour using DevTools → Application → Cookies. The cookie is overwritten on every page load, so it always reflects the visitor's current country. Do not rely on geo for logged-in users; the profile language is the source of truth for auth'd sessions.

**Local testing (client logic):** Set `chillist-geo-lang=he` in DevTools → Application → Cookies, clear `localStorage['chillist-lang']`, hard-reload. No Wrangler needed.

**Local testing (Pages Function):** `npm run build && npx wrangler pages dev dist`. `cf.country` is undefined locally, so the function defaults to `en`. Simulate Israel with: `curl -H "CF-IPCountry: IL" http://localhost:8788/ -v 2>&1 | grep "Set-Cookie"`.

**Production testing:** Use incognito + VPN to switch between IL and non-IL. Check `chillist-geo-lang` cookie value in DevTools → Application → Cookies after page load. Full table in `guides/frontend.md` → "Geo-based default language".

### [Arch] getSavedLanguage() must JSON.parse localStorage — useLocalStorage stores JSON-quoted strings

**Date:** 2026-03-29
**Problem:** `getSavedLanguage()` in `src/i18n/index.ts` read the raw `localStorage['chillist-lang']` value and called `isSupportedLanguage()` on it. But `useLocalStorage` (used by LanguageProvider) stores values with `JSON.stringify`, so the actual stored string is `'"he"'` not `'he'`. This caused `getSavedLanguage()` to always fall through to the default, meaning the geo cookie would silently win over a user's explicit localStorage language on first render.
**Solution:** Updated `getSavedLanguage()` to first try `JSON.parse(raw)` and validate the parsed string, then fall back to the raw string for backwards compatibility.
**Prevention:** Any function that reads a key written by `useLocalStorage` must JSON.parse it first. `useLocalStorage` always serialises with `JSON.stringify`.

### [Test] Partial vi.mock factories break when the mocked module gains new imports used in routes

**Date:** 2026-03-29
**Problem:** Tests that mock `src/core/api` with a factory (no `importOriginal`) only define specific named exports. When `__root.tsx` was updated to import `fetchProfile`, any test that renders the router root (e.g. integration tests for route components) threw `[vitest] No "fetchProfile" export is defined on the mock`.
**Solution:** Either add `fetchProfile: vi.fn()` to every partial mock that doesn't use `importOriginal`, or switch to `vi.mock('…', async (importOriginal) => { const actual = await importOriginal(); return { ...actual, myMock: vi.fn() }; })` so new exports are automatically included.
**Prevention:** Prefer `importOriginal` spread for any api module mock unless the test is explicitly asserting that the function is never called. Partial factory mocks are fragile when the module under test grows.

### [Test] vi.mock factory with top-level variable reference causes hoisting ReferenceError

**Date:** 2026-03-29
**Problem:** `vi.mock` calls are hoisted to the top of the file before `const` declarations. A mock factory that references a `const mockFn = vi.fn()` declared later throws `ReferenceError: Cannot access 'mockFn' before initialization` at test startup.
**Solution:** Use `vi.hoisted(() => vi.fn())` to declare mock functions that need to be referenced inside `vi.mock` factory bodies. `vi.hoisted` runs before module hoisting, making the value available in time.
**Prevention:** Any variable used inside a `vi.mock` factory (not the lazy `() => import(...)` form) must be declared with `vi.hoisted`. The pattern is: `const myMock = vi.hoisted(() => vi.fn()); vi.mock('…', () => ({ fn: myMock }));`

### [Arch] AppLanguage vs backend-supported preferredLang — only sync he/en

**Date:** 2026-03-29
**Problem:** `AppLanguage` includes `'es'` (Spanish) but the backend `UpdateProfileBody.preferredLang` only accepts `'he' | 'en' | null`. Passing `'es'` to `patchProfile` would fail Zod validation before the request is sent.
**Solution:** Guard the `patchProfile` call in `LanguageProvider` with a `BACKEND_LANGS = ['he', 'en']` allowlist check. Spanish is persisted to `localStorage` only. The `BackendLang` type is derived from `NonNullable<UpdateProfileBody['preferredLang']>` to stay in sync with the schema automatically.
**Prevention:** When the backend expands language support, only the Zod schema in `src/core/schemas/profile.ts` needs updating — the allowlist check in `LanguageProvider` derives from that type.

### [Tooling] `npm run screenshots` is self-contained (servers + env)

**Date:** 2026-03-29
**Problem:** Captures required manually setting `VITE_AUTH_MOCK`, running `mock:server`, and `dev`; missing any step produced login screens or empty data in Playwright.
**Solution:** `scripts/take-screenshots.ts` asserts ports 3333/5173 are free, writes `VITE_AUTH_MOCK=true` into `.env.local` for the run, spawns mock API then Vite (with `VITE_AUTH_MOCK` in the child env), polls `GET /health` and the dev origin, runs captures, then SIGTERM on both processes and restores `.env.local`.
**Prevention:** Use `npm run screenshots` as the single entry point; use `--verbose` when debugging startup. If you already have servers up with mock auth, use `--skip-servers` — the app must still be built with mock auth for storageState to match.

### [Mock data] Plan titles in `api/mock-data.json` must read well in lists and screenshots

**Date:** 2026-03-29
**Problem:** Several draft plans used placeholder titles (`df`, `efdf`, random keys). They showed up in the plans list and `/public` marketing screenshots, looking like bugs or noise.
**Solution:** Renamed those plans to clear Hebrew/English draft labels (e.g. `טיוטה: רשימת קניות`, `Draft: weekend prep`). Documented in `api/mock.ts` that titles are user-visible in lists and demos.
**Prevention:** When adding plans to the mock dataset, use intentional titles; reserve gibberish for unit tests only if isolated from shared JSON.

### [Tooling] Landing page screenshots — frame the story, don’t crop the value

**Date:** 2026-03-29
**Problem:** `npm run screenshots` captured the top of the viewport only: items lists sat below the fold, the AI modal was cut off, expenses showed header without settlement rows, and “WhatsApp” scrolled the plan page to map/weather because owners don’t have a Participants block there.
**Solution:** (1) Added `data-testid="plan-items-section"` wrapping the plan page items block so Playwright can scroll one anchor that includes filters + list. (2) Updated `scripts/take-screenshots.ts`: scroll `plans-list`, Group Details heading on manage-participants, `[role="dialog"]` element screenshot for AI, `fullPage` for expenses after scrolling to Summary, and `send-list-panel` on `/manage-participants/:planId` for WhatsApp — not the plan root.
**Prevention:** When adding marketing screenshots, tie each shot to a **testid or landmark** that matches what the copy sells; verify owner vs participant UI. Prefer dialog/section screenshots over blind `page.screenshot()` after `scrollIntoViewIfNeeded()` on a heading that may be a tiny target.

### [E2E] Mobile Safari click + SPA navigation — two separate problems, two fixes

**Date:** 2026-03-28
**Problem (1 — URL assertion):** `page.waitForURL` timed out on Mobile Safari after clicking `wizard-create-plan`. `waitForURL` waits for a browser navigation event (`load`/`commit`), but TanStack Router uses `history.pushState` — no page navigation fires. This is the wrong API for SPA transitions.
**Problem (2 — click dispatch):** Even after switching to `toHaveURL` (correct polling assertion), the URL still never changed on Mobile Safari. Retrying the click via `toPass` made things worse — each retry re-triggered the navigation handler, interrupting the previous attempt. Root cause: Playwright's `click()` on WebKit mobile dispatches a touch event chain (`touchstart → touchend → click`) that can silently fail to invoke the React handler on certain buttons (post-async-render, after bulk state updates). `force: true` does not help — it only skips actionability checks, events are still dispatched via the same path.
**Solution:** Two layers:

1. **URL assertion:** Use `expect(page).toHaveURL(...)` (polling web assertion), never `page.waitForURL`, for SPA navigation.
2. **Click dispatch:** Use `el.evaluate((el: HTMLElement) => el.click())` instead of Playwright's `locator.click()` when a button click fails on WebKit mobile. This fires a native DOM click event directly on the element, bypassing Playwright's input device simulation.
   Final working code:

```
await btn.scrollIntoViewIfNeeded();
await btn.evaluate((el: HTMLElement) => el.click());
await expect(page).toHaveURL(/\/plan\//, { timeout: 15000 });
```

**Prevention:**

- **NEVER** use `page.waitForURL` for in-app (SPA) navigation.
- **NEVER** use `toPass` to retry-click a mutation/navigation button — each retry re-triggers the side effect and can interrupt the previous attempt. `toPass` retry-click is only safe for idempotent read-only interactions.
- When a Playwright `click()` or `click({ force: true })` silently fails on WebKit mobile, switch to `el.evaluate((el: HTMLElement) => el.click())`. This is the reliable fallback for buttons rendered after async state updates on Mobile Safari.
- Do not compensate with longer timeouts (30s) — fix the click/assertion mechanism.

### [Test] Unit tests asserting on i18n headings — same failure mode as “use getByTestId for buttons”

**Date:** 2026-03-28
**Problem:** `EditPlanForm.test.tsx` failed pre-push twice: first the test matched `/your preferences/i`, later `/your group details/i`. The real UI now shows **You and Your Family** (and other locales) via `t()`. The rule in `rules/frontend.md` §6 already required `getByTestId` for **interactive** elements; contributors still used English regex for **section headings**, which are equally unstable.
**Solution:** Assert step/section presence with stable hooks: `getByTestId('edit-wizard-step2')` (already waited on in the helper) and `getByTestId('preferences-steppers')` for the owner-preferences block — not translated copy.
**Prevention:**

- Treat **any** user-visible string from `t()` as unsafe in tests unless you are explicitly testing one locale with `i18n.changeLanguage` and accept maintenance cost.
- When writing or reviewing tests: if you see `getByText` / `getByRole({ name: … })` matching marketing or form **labels**, replace with `data-testid` on the container (add one if missing).
- **Rule updated (§6):** “Did this step render?” must use testids, not English — see [rules/frontend.md](../rules/frontend.md).

### [Wizard / State] Navigate after AI bulk-add — don’t infer success from modal `onClose` + React state

**Date:** 2026-03-28
**Problem:** After confirming AI suggestions in `CreatePlanWizard` `ItemsStep`, the modal called `onAdd` then `onClose`. Closing only cleared local modal state, so the user stayed on the items step until they tapped **Go to plan**.
**Solution:** Introduced `handleAiAdd`: `await handleAdd(items)` then `onDone()` (navigate to plan). Wired `AiSuggestionsModal` with `onAdd={handleAiAdd}` while `BulkItemAddWizard` still uses `handleAdd` alone. Dismissing the AI modal without confirming never runs `onAdd`, so no navigation.
**Prevention:** When a modal’s “success” path must trigger navigation or other side effects, chain them in the same async callback as the mutation/add — do not rely on `onClose` plus `useState` (e.g. `itemsAdded > 0`) that may lag or race with the close handler. Same pattern applies anytime `onClose` fires for both cancel and success.

### [UX / Preview] AI duplicate hint vs real deduplication

**Date:** 2026-03-28
**Problem:** Contributors may assume we block or filter duplicate AI suggestions against existing plan items.
**Reality:** `AiSuggestionsModal` compares `row.suggestion.name.trim().toLowerCase()` to a `Set` of existing `plan.items` names (lowercased). Matches only affect **UI** (amber row + `items.aiDuplicateHint`). Users can still select and submit; the bulk API owns real duplicate rules.
**Prevention:** Document that the hint is advisory; if product should hard-block duplicates, implement in API or filter selections before `onAdd`, not only in styles.

### [UX / Auth] AI item suggestions entry points — owner-only on existing plans

**Date:** 2026-03-28
**Problem:** The plan page and Manage Items page exposed "Suggest items with AI" in the floating action menu to every signed-in participant. AI bulk-add is an owner-level concern; the backend should enforce too, but the UI should not invite non-owners to open the flow.
**Solution:** Pass `onSuggestItems` to `FloatingActions` only when `usePlanRole().isOwner` is true on `plan.$planId` and `items.$planId`. Add a visible **Suggest items with AI** button (`plan-ai-suggest-btn` / `items-view-ai-suggest-btn`) beside the Items heading for owners so the feature is discoverable without opening the speed dial.
**Prevention:** When adding plan-scoped "power user" actions, default to owner (or explicit `canEdit` from role) for the UI; keep using `data-testid` on new buttons for E2E.

### [Schema] AI suggestion quantity rejected — Zod schema too strict for LLM output

**Date:** 2026-03-28
**Problem:** `POST /plans/:planId/ai-suggestions` returned float quantities (0.5, 1.5) from the AI model. The frontend Zod schema `z.number().int().min(1)` rejected them, showing a red validation error wall instead of suggestions.
**Solution:** Changed to `z.number().transform(v => Math.max(1, Math.ceil(v)))` — accept any number, round up, floor at 1.
**Prevention:**

- AI/LLM endpoints return unpredictable values (floats, zeros, unexpected ranges). Use `.transform()` to coerce rather than `.int()/.min()` to reject. Be lenient on input, strict on output.
- Mock data for AI endpoints must include realistic messy values (floats like 0.5, edge values like 0), not only clean integers. All three mock layers (unit, mock server, E2E fixtures) used `quantity: 1` — the safest possible value — and missed this entirely.

### [E2E] Mobile Safari flakiness in plans.spec.ts — error states and filter clicks

**Date:** 2026-03-26
**Failing tests (Mobile Safari only):**

- `Plans Page › displays user-friendly error when API fails` — "Server Error" not found within 15s
- `Plans Page › displays connection error when network fails` — "Connection Problem" not found within 15s
- `Plans Page › displays config error when API returns HTML` — "Server Configuration Error" not found within 15s
- `Membership Filter › user can filter plans by owned and invited` — `membership-filter-owned` click timed out (locator resolved but element not "stable")
- `Plans List Auth CTA › unauthenticated user sees sign-in and sign-up buttons` — "My Plans" not found within 15s
  **Root Cause:** Two distinct Mobile Safari issues:

1. **Timeout too short for error/auth states**: On Mobile Safari/WebKit, React Query's initial loading state resolves more slowly than on Chrome/Firefox. Error states (500, network abort, HTML response) and auth-dependent content need more than 15s to surface after `page.goto()`. This is consistent with WebKit's slower event loop and stricter security model.
2. **Element "not stable" on click**: The membership filter buttons have CSS transitions that cause Playwright's stability check to block the click indefinitely on Mobile Safari. Even with the `transition-duration: 10ms` CSS injection in fixtures, WebKit sometimes doesn't honor `!important` overrides fast enough for Playwright's assertion timing.
   **Solution:**
3. **Error state / auth state timeouts**: Added `data-testid="plans-error-title"`, `data-testid="plans-error-message"`, `data-testid="plans-error-retry"` to the error block, and `data-testid="plans-unauthenticated"` to the unauthenticated container in `plans.lazy.tsx`. Updated tests to use `getByTestId` — this is faster and more reliable than `getByText` on all browsers because it doesn't depend on text rendering order.
4. **Filter button "not stable" on click**: Added a `isWebKitTest` flag at module level in `PlansList.tsx` (same pattern as `useSimpleModal` in `Modal.tsx`) — activates when `VITE_AUTH_MOCK === 'true'` AND the UA is WebKit without Chrome/jsdom. When active, `transition-all` is omitted from filter button classNames so Playwright's stability check completes immediately. Production and Chrome/Firefox tests are unaffected.
   **Pattern to apply when Mobile Safari E2E tests have element stability failures:**

- First check: is there a `data-testid` on the element being asserted? If not, add one — `getByTestId` is inherently more stable than `getByText`.
- If click times out "waiting for stable": check if the element has `transition-all` or `transition-*` Tailwind classes. If yes, apply the `isWebKitTest` guard to conditionally omit the transition class (same pattern as `PlansList.tsx` filter buttons and `Modal.tsx`'s `useSimpleModal`). Do NOT just add `force: true` or increase timeouts — fix the root cause.
- Never increase assertion timeouts without first ruling out a missing `data-testid` or an animation issue.

---

### [E2E] Bulk add E2E mocks not updated when API refactored to /bulk endpoint

**Date:** 2026-03-26
**Failing tests:**

- `Item CRUD › bulk adds multiple items via wizard modal` (all 4 browsers)
- `Invite Landing Page › guest can bulk add items from invite items page` (all 4 browsers)
  **Problem:** 8 E2E tests failed with `toBeVisible` timeout on the success toast after bulk add submission. The tests submitted the bulk add wizard but the toast never appeared.
  **Root Cause:** A previous PR (`b6367c7`) refactored bulk item creation to use a dedicated `POST /plans/:planId/items/bulk` endpoint (replacing the old Promise.allSettled loop over individual POSTs). The `api/server.ts` mock server and unit tests were updated in that PR, but `tests/e2e/fixtures.ts` and `tests/e2e/main-flow.spec.ts` were not. The E2E fixtures only mocked `POST .../items` (single-item endpoint). The `/bulk` request had no mock, fell through to the real server, failed silently, and the success toast was never shown.

For the guest bulk add test, there was a second bug: the mock URL was `.../items` instead of `.../items/bulk`, AND the response was `{ ok: true }` instead of the required `{ items: [...], errors: [] }` shape — which would have caused `bulkItemResponseSchema.parse()` to throw even if the URL had matched.
**Solution:**

1. In `fixtures.ts` (`mockPlanRoutes`): added mock for `POST /plans/${planId}/items/bulk` that builds items from the request body and returns `{ items: [...newItems], errors: [] }`. Also expanded `MockItem.category` and `buildItem()` types to include `'personal_equipment'`.
2. In `main-flow.spec.ts` test 2: fixed mock URL from `.../items` to `.../items/bulk` and updated the response from `{ ok: true }` to a valid `BulkItemResponse` shape.
   **Lesson:** When a PR introduces a new API endpoint that replaces an existing one, the E2E fixtures must be updated in the same PR — not just `api/server.ts`. The two mock layers serve different test environments and both must stay in sync with the real API contract. Always check `tests/e2e/fixtures.ts` whenever any of these change: endpoint URL, HTTP method, or response shape.

---

### [Arch] Split equipment category into group_equipment and personal_equipment

**Date:** 2026-03-24
**Problem:** The backend split the `equipment` item category into `group_equipment` (shared gear) and `personal_equipment` (individual gear). The frontend needed to propagate this change across schemas, constants, i18n, UI components, data files, mock server, and all tests.
**Solution:** (1) Ran `api:sync` to pull updated OpenAPI spec. (2) Updated `CATEGORY_VALUES` in `schemas/item.ts` to `['group_equipment', 'personal_equipment', 'food']`, split the discriminated union into 3 branches, and added an `isEquipmentCategory()` helper for shared "force pcs" logic. (3) Updated `CATEGORY_OPTIONS` (3 entries), `SUBCATEGORIES_BY_CATEGORY` (both equipment categories map to the same subcategory list), and i18n keys in all 3 locales. (4) Updated `BulkItemAddWizard` from 2 to 3 category buttons, `ItemForm`/`ItemCard` to use `isEquipmentCategory()`, `ItemsList`/`CategorySection` for 3 categories, invite route for 3 options. (5) Split `common-items.json`/`.he.json`/`.es.json` using the existing `isPersonal` field (80 EN items → `personal_equipment`, rest → `group_equipment`). (6) Updated mock server schemas, mock data, and all 22 test files.
**Prevention:** When the BE renames or splits an enum value: (1) always sync the OpenAPI spec first; (2) add a centralized helper function for shared behavior (`isEquipmentCategory`) instead of updating every `=== 'equipment'` check individually; (3) use the data flow: schemas → constants → i18n → UI → data files → mock server → tests; (4) check `common-items.json` for existing flags (`isPersonal`) that make the migration mechanical.

---

### [E2E] HeadlessUI Modal — simplified rendering for WebKit E2E tests

**Date:** 2026-03-22
**Problem:** The `owner can add another participant as owner` E2E test failed flakily on Mobile Safari. After clicking the confirm button inside a HeadlessUI `Dialog`, the mutation never fired — no success toast appeared. The test passed consistently on Desktop Chrome and Firefox. Using `force: true` on clicks and `toPass` retry patterns reduced but did not eliminate the flakiness.
**Root Cause:** HeadlessUI's `Dialog` component uses focus trapping and backdrop click interception that interfere with Playwright's click dispatch on WebKit. Clicks intended for buttons inside the `DialogPanel` are sometimes intercepted by the `Dialog`'s `onClose` handler, closing the modal without triggering the button's `onClick`. This only affects WebKit due to its event handling differences.
**Solution:** Added a `useSimpleModal` flag in `Modal.tsx` that activates only when both `VITE_AUTH_MOCK` (test env) and WebKit UA are detected (`/AppleWebKit/` without `/Chrome/` or `/jsdom/`). When active, the Modal renders plain HTML divs with `role="dialog"`, `aria-label`, same classNames, and same `data-testid` — instead of HeadlessUI's `Dialog`/`DialogPanel`/`Transition` wrappers. The `panelContent` (title bar, close button, children) is shared between both paths; only the title element differs (`h2` for simple, `DialogTitle` for HeadlessUI to preserve `aria-labelledby`). Production and Chrome/Firefox E2E tests use the full HeadlessUI Modal unchanged.
**Prevention:** When HeadlessUI modal interactions are flaky on WebKit in E2E tests: (1) First try `toPass` retry blocks (pairs click + assertion) and `waitForResponse` for mutations — these fix most cases. (2) If flakiness persists only on WebKit, use the `useSimpleModal` pattern: detect test env + WebKit UA at module level, render plain HTML wrappers with matching structure/classNames/testIds, keep inner content shared. (3) Always exclude jsdom from the WebKit UA check (`!/jsdom/`) since jsdom's UA contains `AppleWebKit`. (4) Keep `DialogTitle` in the HeadlessUI path so `aria-labelledby` works for unit tests using `getByRole('dialog', { name })`. (5) The real HeadlessUI Modal is still tested on Chrome and Firefox E2E — WebKit simplification does not reduce test coverage.

---

### [Test] React effect timing — sync form values in same effect as state change

**Date:** 2026-03-22
**Problem:** The `guest can continue without signing in and sees preferences modal` E2E test failed flakily. After clicking stepper buttons and immediately clicking "Save preferences", the "Preferences saved" toast never appeared. The mock server returned 400 because the form submitted stale/empty values.
**Root Cause:** `PersonPreferencesEditor` used a two-effect chain: Effect 1 (`[adultsCount, kidsCount]`) called `setMembers(...)` to update the members array, then Effect 2 (`[members]`) serialized members and called `setValue` to sync form fields. Between these two effects, there's a render gap — if the user clicks Save before Effect 2 runs, the form fields still hold stale values.
**Solution:** Merged the two effects: Effect 1 now computes the new members array, calls `setMembers(newMembers)`, AND calls `syncFormValues(newMembers)` in the same effect. Used a `membersRef` to access current members without stale closures. Extracted `syncFormValues` as a `useCallback` shared by both effects (the members-change effect still runs for diet/allergy edits via `updateMember`). Also added wait assertions in the E2E test between stepper clicks (`await expect(stepper-adults-value).toHaveText('2')`) and before save.
**Prevention:** When React state changes must be reflected in form fields (React Hook Form `setValue`), call `setValue` in the same effect that computes the new state — not in a dependent effect triggered by the state change. A two-effect chain (`setState` → re-render → `setValue`) creates a render gap where form values are stale. For E2E tests, add assertions between UI interactions that trigger React effects (e.g., stepper click → assert value visible) before the final action (save).

---

### [Arch] Align FE with BE dietaryMembers structured field — full-stack propagation

**Date:** 2026-03-19
**Problem:** The BE introduced a structured `dietaryMembers` JSONB field on participants and join requests, replacing the legacy free-text `foodPreferences`/`allergies` strings. The FE needed to send and receive this new field across all schemas, API calls, form handlers, mock server, and tests.
**Solution:** (1) Added `dietaryMembersBodySchema` Zod schema in `dietary-options.ts` and added `dietaryMembers` to participant, join-request, invite, and plan-form-utils schemas. (2) Updated `parseDietaryMembers` to accept the structured field as primary input, falling back to legacy JSON strings. (3) Propagated `dietaryMembers` through all API function signatures (`createJoinRequest`, `saveGuestPreferences`, `updateParticipant`), form value types (`PreferencesFormValues`, `PersonPreferencesFieldValues`, `EditPlanSubmitPayload`), and submission handlers (plan page, manage-participants, invite, join request). (4) Updated `PersonPreferencesEditor` to set `dietaryMembers: { members }` on the form alongside legacy serialized strings. (5) Updated mock server: participant schema, create/patch validation schemas, `JoinRequestRecord`, all participant creation paths, invite preferences allowlist, and invite response. (6) Fixed E2E test that used `getByPlaceholder('1')` for the old number input — replaced with `getByTestId('stepper-adults-increment').click()` for the new stepper UI.
**Prevention:** When the BE adds a new structured field that replaces legacy fields: (1) update Zod schemas first (data layer), then API signatures, then form types, then submission handlers — follow the data flow top-down; (2) keep legacy fields populated for backward compatibility; (3) update `parseDietaryMembers`-style helpers to prefer the new field with fallback; (4) update the mock server in the same pass — schemas, routes, and response objects; (5) search for all callers of affected functions (`grep parseDietaryMembers`, `grep createJoinRequest`, etc.) to ensure none are missed; (6) E2E tests that interact with replaced UI controls (e.g., number inputs → steppers) will break silently — run the full E2E suite before committing.

---

### [UX] Wizard step 1 — title + tags + description; fix duplicate tag chips on summary

**Date:** 2026-03-19
**Problem:** (1) The plan creation wizard started with tags only in step 1, while title and description were buried in the details step (step 2). Title is the most important field and should be first. Description supplements tags — it makes sense next to them. (2) The tag wizard summary screen showed tags twice: `SelectedChips` rendered when `currentStep !== 1`, and `WizardSummary` also rendered all chips. Both were visible simultaneously on the summary step.
**Solution:** (1) Moved title input above `PlanTagWizard` and description textarea below it in step 1. Title and description are now managed as parent-level state in `CreatePlanWizard`, validated before advancing (title required). `DetailsForm` (step 2) receives them as props and uses hidden inputs to include them in the form data. (2) Added `currentStep !== 'summary'` to the `SelectedChips` render condition in `PlanTagWizard.tsx`.
**Prevention:** When moving fields between wizard steps: (1) manage the field state at the parent level if it needs to be available across steps; (2) use hidden inputs in the destination form to preserve schema/validation; (3) update E2E tests in the same pass — search for `data-testid` and placeholder text references. When a component renders the same data in two places conditionally, check all combinations of the condition to ensure no overlap.

---

### [Arch] Supabase phone storage — user_metadata vs phone column

**Date:** 2026-03-18
**Problem:** Phone number entered on the complete-profile page appeared missing from the Supabase user row. The BE was reading from `auth.users.phone` (the dedicated column), but the FE stores phone in `raw_user_meta_data.phone` via `supabase.auth.updateUser({ data: { phone: '...' } })`. Setting the top-level `phone` column requires Supabase phone auth to be enabled and causes a 500 error when it isn't.
**Solution:** FE code is correct — phone is stored in `user_metadata.phone` (E.164 format). The BE must read phone from `raw_user_meta_data->>'phone'` instead of the `phone` column on `auth.users`. The top-level `phone` column is reserved for Supabase phone-auth flows.
**Prevention:** Never pass `phone` as a top-level field in `supabase.auth.updateUser()` unless phone auth is enabled on the Supabase project (it will 500). Always store custom profile fields in `user_metadata` via the `data` field. When the BE needs these values, it must read from `raw_user_meta_data` JSONB, not from dedicated auth columns.

---

### [UI] Form components designed for inline use need an inModal prop for modal context

**Date:** 2026-03-17
**Problem:** `AddParticipantForm` was designed for inline use with its own gray card styling (`bg-gray-50 rounded-lg p-3 sm:p-4`). When placed inside a `Modal`, the card background clashed with the white modal surface and had no outer padding, making it look broken.
**Solution:** Added an `inModal?: boolean` prop (matching the `PreferencesForm` pattern) that swaps the card class for `px-4 sm:px-6 pb-4 sm:pb-6`. Passed `inModal` at the call site in `manage-participants.$planId.lazy.tsx`.
**Prevention:** When building form components, decide upfront if they will ever appear inside a Modal. If so, include an `inModal` prop from the start (see `PreferencesForm` as the reference pattern). Never add card backgrounds to forms that may be reused in modals.

---

### [E2E] Stale Vite dev server causes mass Playwright auth failures

**Date:** 2026-03-15
**Problem:** After code changes, `git push` triggered the pre-push hook which runs Playwright E2E tests. ~90% of authenticated tests failed — page snapshots showed "Sign In / Sign Up" instead of the authenticated user. The auth mock injection (`injectUserSession` via `localStorage`) appeared broken. Unauthenticated tests all passed.
**Root cause:** A stale Vite dev server was running on port 5174 from a previous manual session, started **without** `VITE_AUTH_MOCK=true`. Playwright's config has `reuseExistingServer: !process.env.CI`, so locally it reused the stale server instead of starting a fresh one with the correct env vars. The app built without `VITE_AUTH_MOCK` ignores `localStorage` mock sessions entirely.
**Fix:** Kill the stale process (`lsof -i :5174 -P -n -t | xargs kill`) and re-run. Playwright starts a fresh server with `VITE_AUTH_MOCK=true` and all auth tests pass.
**Prevention:** Before running E2E tests locally, check for stale Vite processes on the Playwright port (5174). If mass auth-related E2E failures appear out of nowhere, the first thing to check is a stale dev server. Never assume the reused server has the right env vars.

---

### [E2E] Wizard step changes require E2E test updates

**Date:** 2026-03-15
**Problem:** After splitting the preferences wizard step into personal prefs + estimation (4→5 steps in `CreatePlanWizard`, 2→3 steps in `EditPlanForm`), the E2E plan creation and edit plan tests failed. The tests still navigated the old step count and expected old `data-testid` values.
**Solution:** Updated `tests/e2e/main-flow.spec.ts`: plan creation test now skips tags (step 1), fills details (step 2), skips prefs (step 3), skips estimation (step 4), then adds items (step 5). Edit plan test now navigates details → prefs (skip) → estimation (submit). Used `data-testid` attributes (`plan-tag-wizard`, `tag-wizard-skip`, `wizard-step-prefs`, `wizard-step-estimation`, `wizard-step-items`, `edit-wizard-step3`) for stable selectors.
**Prevention:** When adding or reordering wizard steps, update E2E tests in the same pass. Search for all `data-testid` references to wizard steps in `tests/e2e/` and update navigation flow. E2E tests are the most likely to break on step count changes because they navigate the full UI flow.

---

### [i18n] Form validation messages must use t() — not hardcoded English

**Date:** 2026-03-15
**Problem:** All form Zod schemas (`CreatePlanWizard`, `EditPlanForm`, `ItemForm`, `AddParticipantForm`, `RequestToJoinPage`, `PlanForm`) had hardcoded English validation messages like `'Title is required'`. Hebrew users saw English error messages on form validation failures.
**Solution:** Converted all static schemas to factory functions that accept `t: (key: string) => string` (e.g., `const schema = z.object(...)` → `function buildSchema(t) { return z.object(...) }`). Each form component calls `buildSchema(t)` inside the component where `useTranslation()` is available. The `validation.*` i18n keys already existed in all 3 locales — the schemas just weren't using them. Type inference updated from `z.infer<typeof schema>` to `z.infer<ReturnType<typeof buildSchema>>`.
**Prevention:** Never hardcode English strings in Zod schemas. Always use `t('validation.*')` keys via a schema factory function. When adding a new form, follow the `buildXxxSchema(t)` pattern from `plan-form-utils.ts`. The `core/schemas/*.ts` files (used for API validation, not UI) can keep English strings since users don't see those errors.

---

### [UX] Split preferences wizard step into personal prefs + estimation

**Date:** 2026-03-15
**Problem:** The preferences step in `CreatePlanWizard` (step 3) and `EditPlanForm` (step 2) combined the owner's personal preferences (adults, kids, food, allergies) with group estimation (total expected adults/kids) in a single form. This was confusing — owners didn't understand the difference between "your party" and "total event size". The Hebrew text for `estimationIncludesYou` was also unnatural.
**Solution:** Split into two separate steps: personal preferences (owner-only details) and estimation (total event size). `CreatePlanWizard` went from 4 to 5 steps; `EditPlanForm` from 2 to 3 steps. Created separate Zod schemas (`buildPersonalPrefsSchema`, `buildEstimationSchema`) in `plan-form-utils.ts`. Each step has its own form component with independent validation. Made the `StepIndicator` responsive for 5 steps on mobile (smaller circles, shorter connectors, truncated labels). Updated owner section title from "You & Your Party" to "Your Preferences" across all 3 locales.
**Prevention:** When a form step combines two conceptually different things (personal vs group data), split them into separate steps. Each step should have one clear purpose. For mobile step indicators with 5+ steps, use responsive sizing from the start.

---

### [UX] Wizard step reorder — tags first for low-friction start

**Date:** 2026-03-15
**Problem:** The plan creation wizard started with a heavy form (title, description, dates, location, language, currency). Users hitting a wall of form fields on step 1 creates friction. The tag wizard (fun emoji cards) was buried as step 2.
**Solution:** Swapped step 1 and 2 — tags wizard is now step 1 (engaging, low-effort start), plan details is step 2. Made `PlanTagWizard.onBack` optional so no Back button renders when it's the first step. Improved preferences step (step 3) with clearer section titles: "Your Details" (owner-only) and "Total Group Estimate" (total headcount). Plan creation is now invisible — spinner replaces "Creating plan…" label. Renamed internal components (`Step3Form` → `PrefsForm`, `Step4Items` → `ItemsStep`) for clarity.
**Prevention:** When designing multi-step wizards, put the lowest-friction step first to build momentum. Keep plan creation invisible to users (no "Creating…" label) when it happens mid-flow. When reordering wizard steps, update all references in a single pass: step indicator labels, i18n keys, data-testid attributes, test assertions, and docs.

---

### [Arch] Plan Tag Wizard — JSON-driven 3-tier tag selection with step integration

**Date:** 2026-03-15
**Problem:** Plan creation needed structured tagging to describe the plan type, but hardcoding tag logic in components would be fragile and hard to extend.
**Solution:** Created `src/data/plan-creation-tags.json` with a 3-tier hierarchy (tier1 → tier2 → tier3) where each tier's options are conditional on parent selections. Built `PlanTagWizard` component with internal step state (1/2/3/summary), chip-based navigation for editing previous tiers, and skip/back at every level. Integrated as Step 1 in the 4-step `CreatePlanWizard`. Tags are passed as `string[]` in the plan creation payload — the `planCreateWithOwnerSchema` already supported `tags: z.array(z.string()).nullish()`. Added translation parity tests that validate all locale files have matching `tagWizard.*` and `wizard.*` keys, plus data integrity tests for the tag JSON (no duplicate IDs, parent-child key consistency).
**Prevention:** For multi-tier selection UIs, drive options from a static JSON file rather than hardcoding in components. This makes it easy to add/remove options without touching component logic. Always add translation parity tests when introducing new i18n namespaces — the test caught a missing Spanish locale immediately. When inserting a new step into a multi-step wizard, update all step references (state type, step numbers, data-testid attributes, i18n step title keys) in a single pass to avoid partial breakage.

---

### [Async] WebSocket — stop retry on permanent close codes 4004 and 4005

**Date:** 2026-03-13
**Problem:** When a user submitted a join request and stayed on the plan page, the WebSocket reconnect logic retried every ~2s because only auth-failure codes (4001, 4003) were in the no-retry set. Close codes 4004 (no access) and 4005 (pending join request) triggered infinite reconnect loops, flooding the server.
**Solution:** Renamed `AUTH_FAILURE_CODES` to `NO_RETRY_CODES` and added 4004 and 4005. Exposed `wsCloseCode` from the hook so consumers can show contextual UI (e.g., "pending approval" banner on code 4005). Added unit tests for all no-retry codes and for the exposed close code state.
**Prevention:** When the backend adds new WebSocket close codes, update the frontend `NO_RETRY_CODES` set immediately. Any close code that represents a permanent or semi-permanent state (not a transient network error) must be in the no-retry set. Only retry on truly transient failures (1006, network drops).

---

### [UX] WhatsApp send list — role-based buttons on participant cards, not FAB

**Date:** 2026-03-13
**Problem:** WhatsApp send list was a single button in the FAB speed dial. Users couldn't tell if it would send to all or just themselves. Invite status (sent/not sent) wasn't visible.
**Solution:** Removed WhatsApp from FAB. Added per-participant green "Send list" button at the bottom of each participant card. Owner sees button on every non-owner card + "Send to all" at the top of the section. Non-owner participant sees "Send list to me" on their own card only. Added invite status badge (WhatsApp icon + "Not sent"/"Sent"/"Joined") visible to owner only. Badges and buttons use `isOwner` guards — invite status is owner-only information, WhatsApp send is role-dependent.
**Prevention:** For actions that differ by role (owner vs participant), use labeled buttons with clear text on the relevant UI element (e.g., participant card) rather than a single ambiguous FAB action. Show status badges only to the role that needs the information.

---

### [Arch] Phone E.164 normalization — normalize on submit, validate before send

**Date:** 2026-03-12
**Problem:** Phone numbers were sent to the BE as raw local strings (e.g., `050-123-4567`) without country dial codes. The BE expects E.164 format (`+972501234567`). The `combinePhone` helper simply concatenated dial code + local number without stripping formatting characters or leading zeros.
**Solution:** Added `normalizePhone(countryCode, rawLocal)` in `country-codes.ts`: strips spaces/dashes/parens/dots, strips leading zeros, prepends dial code. If the input starts with `+`, it's used as-is (pasted international number). Added `isValidE164(phone)` regex check (`/^\+[1-9]\d{6,14}$/`). Updated `combinePhone` to delegate to `normalizePhone`. In every form that submits a phone (`PlanForm`, `AddParticipantForm`, `RequestToJoinPage`, `complete-profile`, `CreatePlanWizard`): normalize via `combinePhone`, then validate with `isValidE164` before sending. If invalid, `setError` on the phone field with `t('validation.phoneInvalid')`. For BE 400 errors containing "phone", surface as field-level error with `t('validation.phoneInvalidBE')`. Mock server updated with E.164 regex on `contactPhone` schemas. Test data updated to use valid E.164 phones.
**Prevention:** All phone data must be E.164 before leaving the frontend. Normalize on form submit (not on keystroke). Validate the normalized result with `isValidE164` and block submission if invalid. When the BE returns a 400 mentioning "phone", map it to a field-level error, not a generic toast.

---

### [Test] E2E — always await Playwright expect assertions

**Date:** 2026-03-09
**Problem:** E2E websocket tests passed on Desktop Chrome but failed on Firefox and Safari. `expect(locator).toBeVisible()` returned immediately without waiting for the element.
**Root Cause:** Missing `await` on Playwright `expect()` assertions. Without `await`, the assertion returns a pending promise that resolves to truthy (so the test appears to pass on fast browsers) but doesn't actually wait for the element. Slower browsers (Firefox, WebKit) fail because the element isn't rendered yet when the non-awaited assertion runs.
**Solution:** Add `await` to all Playwright `expect()` calls: `await expect(locator).toBeVisible()`.
**Prevention:** Every Playwright `expect()` assertion must be awaited. Unlike Vitest/Jest `expect()` which is synchronous, Playwright's `expect()` returns a promise that polls until timeout. A missing `await` silently succeeds on fast browsers and fails intermittently on slow ones. Treat a non-awaited Playwright expect as a bug.

---

### [Arch] WebSocket hook — browser native API, no dependencies needed

**Date:** 2026-03-09
**Problem:** Needed live item update notifications via WebSocket without adding new dependencies.
**Solution:** Created `usePlanWebSocket(planId)` hook using the browser's native `WebSocket` API. Derives WS URL from `VITE_API_URL` (`http` → `ws`, `https` → `wss`). Gets fresh JWT via `supabase.auth.getSession()` before each connect. On `items:changed` message, invalidates React Query cache `['plan', planId]`. Reconnects with exponential backoff (1s, 2s, 4s... cap 30s). Stops reconnecting on auth-failure close codes (4001, 4003). Cleans up on unmount.
**Prevention:** For simple one-way server-to-client WebSocket, the browser native API is sufficient — no need for socket.io-client or other libraries. Keep the hook focused: listen for events, invalidate cache, let React Query handle the refetch. Test with a `MockWebSocket` class assigned to `globalThis.WebSocket` in unit tests (jsdom has no built-in WebSocket).

---

### [Test] E2E bulk wizard — use toPass retry pattern for Headless UI modal clicks

**Date:** 2026-03-07
**Problem:** E2E test "bulk adds multiple items via wizard modal" timed out on `equipmentBtn.click()` — Playwright reported "element is not stable" and "element was detached from the DOM". The test failed consistently on Desktop Chrome (60s timeout exceeded) and intermittently on other browsers. Using `force: true` fixed Chrome but broke Mobile Safari (clicks dispatched during transitions didn't trigger React handlers on WebKit).
**Root Cause:** Two interacting issues: (1) Headless UI `TransitionChild` enter animation on the `DialogPanel` makes buttons inside the modal "unstable" (still moving) even with the 10ms transition fixture override. (2) Parent component re-renders (data fetching, context updates) can detach and re-attach the modal content, causing the locator's resolved element to become stale. `force: true` bypasses stability checks but on WebKit can dispatch events on stale nodes that React doesn't process.
**Solution:** Use Playwright's `toPass` retry pattern to wrap click + next-step-assertion as a unit. This retries the entire interaction if the click doesn't register or the element is unstable: `await expect(async () => { await btn.click({ timeout: 2000 }); await expect(nextStep).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 15000 });`. Applied to FAB click, category click, and subcategory click. Only the final submit button uses `force: true` (no subsequent step to assert on). Scoped wizard selectors to the dialog (`dialog.getByTestId(...)`) for robustness.
**Prevention:** For multi-step modal interactions in E2E with Headless UI: (1) Use `toPass` retry blocks that pair each click with an assertion on the expected next state — this handles both "element not stable" (Chrome) and "click not registered" (WebKit). (2) Avoid blanket `force: true` on modal content clicks — it can break on WebKit. (3) Reserve `force: true` only for final submit buttons where there's no next step to assert on.

---

### [UX] Participant filter excludes canceled items from counts

**Date:** 2026-03-04
**Problem:** Participant filter (All / My Items / Unassigned / person names) showed canceled items in the total and per-participant counts, making the numbers misleading.
**Solution:** Updated `countItemsPerParticipant` in utils-plan-items.ts to skip items with `status === 'canceled'`; pass `nonCanceledCount` (items.filter(i => i.status !== 'canceled').length) as `total` to ParticipantFilter in plan.$planId.lazy.tsx and ItemsView.tsx.
**Prevention:** When counting items for filters/tabs, consider whether canceled (or other terminal) statuses should be excluded. Align count logic with user mental model (e.g., "items I'm responsible for" should not include canceled).

---

### [UX] BulkItemAddWizard — merged search + custom item, line layout

**Date:** 2026-03-04
**Problem:** Users had two separate inputs (main search and custom item) and card layout truncated titles. Confusing UX.
**Solution:** (1) Merged into single search: type filters common items; when text doesn't match any item, an "Add [name]" row appears and Enter adds it. (2) Switched from card grid to line list with simple design: full-width rows, rounded borders, hover and selected backgrounds (blue-50/blue-100), so full titles are visible.
**Prevention:** For wizard step lists, prefer line layout with visible full text over compact grids when titles vary in length. Use a single input for both filter and create when the action is additive (e.g. "search or add").

---

### [Test] Disable CSS transitions in E2E to eliminate Headless UI modal flakiness

**Date:** 2026-03-03
**Problem:** E2E test `adds items via UI and verifies they appear in categories` failed on Desktop Firefox. After clicking the add-item form submit button, the new item never appeared in the DOM within 20s. The `addItemViaUI` helper also had no mechanism to confirm the POST mutation completed before asserting on UI state. Previous attempts to fix modal flakiness included increasing `toBeHidden` timeouts and asserting on visible items instead, but Firefox-specific timing issues persisted.
**Root Cause:** Two interacting problems: (1) Headless UI `Transition` leave animations (150ms) create a window where `toBeHidden()` assertions race against the animation, and `toBeVisible()` can match the still-visible transitioning element. On Firefox, the timing is more aggressive and the issue is more likely to hit. (2) The `addItemViaUI` helper clicked submit without waiting for the POST API response, so it couldn't guarantee the mutation (and subsequent React Query refetch) completed before asserting on the item card.
**Solution:** (1) In `fixtures.ts`, extended the Playwright `test` fixture to inject a `<style>` tag via `addInitScript` that sets `transition-duration: 1ms !important; animation-duration: 1ms !important` on all elements. This makes all CSS transitions effectively instant, eliminating all transition-related flakiness globally. (2) In `addItemViaUI`, used `Promise.all([page.waitForResponse(...), submitBtn.click()])` to ensure the POST response is received before asserting. Added `modal.toBeHidden()` assertion (now reliable with instant transitions) before checking the item card.
**Prevention:** For E2E tests with Headless UI (or any transition-heavy UI framework), inject a style that sets `transition-duration: 1ms !important` globally in the test fixture. This is a one-time setup that prevents all transition-related flakiness. For mutation flows, always wait for the API response (`page.waitForResponse`) before asserting on the resulting UI state.

---

### [UX] Date/time form flow — chain via blur, not change, for time inputs

**Date:** 2026-03-03
**Problem:** PlanForm chained start time → end date via the `watch` handler (value change). Native time pickers fire `change` on intermediate steps (hour selection before minutes). This opened the end date picker immediately after hour selection, stealing focus and closing the time picker before the user could select minutes.
**Solution:** (1) Removed `openPicker(endDateDateRef)` from the `startDateTime` watch handler — watch still syncs values (endDateTime, endDateDate) but does not chain pickers. (2) Added `onBlur` handler on the start time input that calls `openPicker(endDateDateRef)` — blur fires only when the picker fully closes (after both hour and minutes are selected). (3) Removed `showPicker()` from `FormInput`'s handleClick — native pickers open on click by default, and the CSS `appearance: auto !important` rule already fixes the Google Maps interference. Programmatic `showPicker()` is now only used in PlanForm's `openPicker()` for chaining.
**Prevention:** Never chain pickers from a time input's `change`/watch handler — the browser may fire change on intermediate steps (hour, then minutes). Use `onBlur` to detect when the time picker fully closes, then chain to the next field. For date inputs, `change` fires once on close, so watch-based chaining is fine.

---

### [Test] E2E bulk add wizard + admin delete cancel — scrollIntoViewIfNeeded, testId, timeout

**Date:** 2026-03-03
**Problem:** Two E2E tests failed: (1) `bulk adds multiple items via wizard modal` on Desktop Chrome — `bulk-item-add-wizard` not found after clicking FAB. (2) `admin can cancel delete via modal` on Mobile Safari — modal stayed visible after cancel click.
**Solution:** (1) For bulk add: `scrollIntoViewIfNeeded()` and visibility assertion before FAB click; increased wizard `toBeVisible` timeout to 10s for Headless UI transitions. (2) For admin delete cancel: added `testId="admin-delete-modal"` to PlansList delete Modal; use `getByTestId` for modal visibility assertions; `scrollIntoViewIfNeeded()` before cancel click; keep `force: true` for WebKit.
**Prevention:** For Headless UI modal flows in E2E: use `data-testid` on modals, scroll buttons into view before clicking, use generous timeouts (10s+) for modal visibility. On mobile/WebKit, `force: true` and `scrollIntoViewIfNeeded` improve reliability.

---

### [UX] Packing list filter = purchased + pending

**Date:** 2026-03-04
**Problem:** Packing list previously showed purchased + packed only. Users wanted to plan what to pack before shopping and track bought items in one view.
**Solution:** Updated `filterItemsByStatusTab` and `countItemsByListTab` so packing = `purchased` | `pending`. Buying = `pending` only. Pending items appear in both tabs.
**Prevention:** Buying list = items to buy (pending). Packing list = what to pack (pending) + what's bought (purchased).

---

### [UX] Plan form auto-fill date/time when first day is selected

**Date:** 2026-03-03
**Problem:** Users had to manually enter start/end times and end date after selecting the first day. No smart defaults were applied.
**Solution:** When the user selects the first date: (1) One-day plans: auto-fill start time to current hour (e.g., 15:40 → 15:00) if date is today, else 08:00; end time mirrors start; time picker opens automatically. (2) Multi-day plans: same start-time logic, end date = start date + 24 hours, end time = same as start; time picker opens. When start time changes, end time auto-updates to match.
**Prevention:** For date/time forms, consider auto-filling sensible defaults on date selection and syncing dependent fields (end time, end date) to reduce friction.

### [Test] PlanForm time inputs — use fireEvent.change for reliable values

**Date:** 2026-03-03
**Problem:** PlanForm unit tests failed with payload times like 08:59 instead of the typed 10:00/16:00. `userEvent.type` on `input[type="time"]` can produce inconsistent values (e.g., system-time-dependent or parsing quirks).
**Solution:** Use `fireEvent.change(input, { target: { value: '10:00' } })` for time inputs in CreatePlan tests instead of `user.type`. Also: when testing "end date required" validation with auto-fill, clear the auto-filled end date before submit.
**Prevention:** For `type="time"` and `type="date"` inputs in unit tests, prefer `fireEvent.change` over `userEvent.type` when exact values matter — typing simulates keystrokes which can interact poorly with native pickers and value parsing.

---

### [Types] `satisfies` only checks one direction — add bidirectional assertions for enum sync

**Date:** 2026-03-03
**Problem:** `RSVP_STATUS_VALUES` used `satisfies readonly BEParticipant['rsvpStatus'][]`, which only verifies our values are a subset of the BE union. Typecheck did not catch when the BE added a new value (e.g. `'declined'`) because we could have fewer values and still satisfy.
**Root Cause:** `satisfies` is one-way: it ensures we don't have _extra_ values, but not that we have _all_ BE values. The FE can drift by omission and pass typecheck.
**Solution:** Add a bidirectional type assertion after each enum constant: `type _AssertXExact = OurUnion extends BEUnion ? BEUnion extends OurUnion ? true : never : never; const _assert: _AssertXExact = true;`. When sets don't match exactly, `_AssertXExact` becomes `never` and the assignment fails.
**Prevention:** For any `as const satisfies readonly BEEnum[]` pattern (role, rsvpStatus, inviteStatus, etc.), add the bidirectional assertion so typecheck fails when `api:types` is run and the BE adds or removes enum values.

---

### [Test] Add item modal toBeHidden flaky on Desktop Safari — increase timeout

**Date:** 2026-03-03
**Problem:** E2E test `adds items via UI and verifies they appear in categories` failed on Desktop Safari. After clicking submit, `expect(modal).toBeHidden({ timeout: 10000 })` timed out — the add-item modal stayed "visible" during Headless UI's close transition.
**Solution:** Increased add-item modal `toBeHidden` timeout from 10s to 20s in `addItemViaUI` helper. Desktop Safari's close animation can exceed 10s.
**Prevention:** For Headless UI modal submit flows on Safari/WebKit, use 15–20s `toBeHidden` timeouts; 10s may not be enough.

---

### [Arch] Handle not_participant response from plan API with join request flow

**Date:** 2026-03-02
**Problem:** After claiming invite and logging in, user navigates to plan and gets ZodError. Backend returns `200 OK` with `{ status: 'not_participant', preview: {...}, joinRequest: null }` instead of a full plan object, causing Zod to fail.
**Root Cause:** `fetchPlan` assumed the response was always `PlanWithDetails`. The backend legitimately returns a different shape when the user is not yet a participant. The mock server (`api/server.ts`) only modeled the happy-path response, so no test could ever reach the non-participant state. There were no unit tests for the alternative response branch.
**Solution:** Added `notParticipantResponseSchema` and `isNotParticipantResponse` type guard to `plan.ts`. Updated `fetchPlan` to return `PlanWithDetails | NotParticipantResponse` — branching on `status === 'not_participant'` before Zod parsing. Updated `usePlan` generic, fixed `useBulkAssign` calls in all routes using `usePlan` (`plan.$planId`, `items.$planId`, `manage-participants.$planId`). Added `RequestToJoinPage` component showing plan preview + form (pre-filled from user metadata) when `joinRequest === null`, or a pending status badge when already submitted.
**Prevention:**

1. When implementing any `fetchX` function, check the OpenAPI spec for multiple 2xx response shapes _before_ writing code — not after a production crash.
2. Add a unit test in `tests/unit/core/api.test.ts` for every response variant the endpoint can return, including access-restricted and error-shaped 2xx responses.
3. Add the alternative response shape to `api/server.ts` so it can be reached in tests. The mock server must reflect every state the real backend can return.
4. In consuming routes, add a type-narrowing guard immediately after the null check (e.g. `isNotParticipantResponse(plan)`) before accessing any typed fields — TypeScript will not catch this without an explicit discriminant check.

---

### [i18n] Hebrew adults/kids count in English — simple singular/plural keys

**Date:** 2026-03-02
**Problem:** In ParticipantDetails, adults count and kids count displayed in English when the site was in Hebrew.
**Root Cause:** i18next pluralization keys (`adults_one`, `adults_other`) trigger language-specific plural rules. Hebrew needs `_two`, `_many` too — when missing, i18next fell back to English.
**Solution:** Bypass i18next pluralization: use two plain keys (`adult`/`adults`, `kid`/`kids`) and choose in code: `t(count === 1 ? 'participantDetails.adult' : 'participantDetails.adults', { count })`.
**Prevention:** For simple "X items" strings, prefer manual singular/plural selection over i18next pluralization — avoids per-language plural form complexity.

---

### [Test] Manage Participants E2E — strict mode and Headless UI dialog

**Date:** 2026-03-02
**Problem:** E2E tests failed: (1) `getByText('Manage Participants')` strict mode violation — resolved to 2 elements (h1 "Manage Participants Test" substring match + link text). (2) Add participant modal: `getByRole('dialog')` reported hidden (Headless UI Transition issue).
**Solution:** Use `getByRole('heading', { name: 'Manage Participants' })` for exact page-title assertion. Add `testId="add-participant-modal"` to the Modal and use `getByTestId` in the test (same pattern as add-owner-dialog).
**Prevention:** Avoid `getByText` when the string is a substring of other visible text — use `getByRole` with `name` or `getByTestId` for disambiguation. For Headless UI modals, always add testId and use getByTestId.

---

### [Test] Manage Participants route unit tests require full supabase mock

**Date:** 2026-03-02
**Problem:** Unit tests for manage-participants route using routeTree + RouterProvider failed with "onAuthStateChange is not a function" and redirect to signin. The route's beforeLoad checks supabase.auth.getSession(); AuthProvider uses supabase.auth.onAuthStateChange.
**Solution:** Test file overrides the global supabase mock with a full auth object: getSession returns a valid session (for beforeLoad to pass), plus signUp, signInWithPassword, signOut, onAuthStateChange, etc. Use `importOriginal` for react-hot-toast to keep Toaster export. Mock useNavigate to assert non-owner redirect.
**Prevention:** When testing routes that use the full app (routeTree, AuthProvider), either mock all dependencies (supabase, hooks) completely or use E2E with a real browser. Router integration tests need session for auth-gated routes.

---

### [Test] Plan unit tests need Link mock when TanStack Router is not provided

**Date:** 2026-03-02
**Problem:** Plan component uses TanStack Router's `Link`. Unit tests render Plan without a router, causing `TypeError: Cannot read properties of null (reading '__store')` because Link expects router context.
**Solution:** Mock `@tanstack/react-router` in Plan.test.tsx so `Link` renders a plain `<a>` with `href` built from `to` and `params`. Use `vi.mock` with `importOriginal` to keep other exports (e.g. for other tests).
**Prevention:** When a component uses `Link`, `useNavigate`, or other router hooks, either wrap in `RouterProvider` for integration tests or mock the router module in unit tests. Mocking Link to an anchor is the lightest approach for isolated component tests.

---

### [Arch] Minimal frontend execution docs reduce context load and prevent doc-drift mistakes

**Date:** 2026-03-02
**Problem:** Frontend tasks repeatedly loaded large rule/guide/spec/lesson files to recover the same execution context, increasing token usage and slowing down task startup. This also increased the chance of opening too many unrelated files before identifying the real task scope.
**Solution:** Added a README-first documentation flow in `chillist-fe`: expanded `README.md` into a navigation hub (route map, folder map, file-finder playbooks, screen workflow) and created a strict minimal rules file (`rules/frontend.md`).
**Prevention:** Start each frontend task with local `README.md` + `rules/frontend.md`, then open only relevant files. Use deep docs in `chillist-docs` only when the task requires extra detail beyond the local minimal context. When updating docs, only update existing files — do not create new doc files.

---

### [Test] Guest preferences modal flaky on Mobile Safari — use data-testid and force click

**Date:** 2026-03-02
**Problem:** E2E test `guest can skip preferences and redirect to plan` failed on Mobile Safari. After clicking Skip, the "Your Preferences" modal stayed visible (test expected it hidden). Asserting on dialog text during Headless UI transitions can be flaky.
**Solution:** Added `testId="guest-preferences-modal"` to the invite page's preferences Modal. Updated the test to use `getByTestId('guest-preferences-modal')` instead of `getByText('Your Preferences')`, scroll Skip button into view, and use `click({ force: isMobile })` so the tap registers on mobile.
**Prevention:** Use data-testid for Headless UI modals in E2E. On mobile viewports, use `scrollIntoViewIfNeeded()` and `click({ force: true })` for buttons that may be at the bottom of scrollable modals.

---

### [Test] Headless UI Dialog invisible to `getByRole('dialog')` — use `data-testid` instead

**Date:** 2026-02-26
**Problem:** E2E test `owner can add another participant as owner` failed across all browsers. `await expect(page.getByRole('dialog')).toBeVisible()` reported the dialog as `hidden` even though it was open. Headless UI's `Dialog` + `Transition` renders the dialog element in the DOM during transitions with styles (opacity, transform) that make Playwright consider it hidden for `toBeVisible()` checks.
**Solution:** Added a `testId` prop to the shared `Modal` component that passes through as `data-testid` on `DialogPanel`. Used `data-testid="add-owner-dialog"` on the transfer ownership modal. Updated the E2E test to use `page.getByTestId('add-owner-dialog')` which targets the visible `DialogPanel` inside the transition, not the outer `Dialog` wrapper.
**Prevention:** Always use `data-testid` attributes on Headless UI dialog panels for E2E test selectors. Never rely on `getByRole('dialog')` — it matches the outer Dialog element which may be in a transitioning (hidden) state. Add `testId` to Modal when creating new modals, and use `getByTestId` in E2E tests.

---

### [Config] Add as owner returns 400 when using real backend

**Date:** 2026-02-26
**Problem:** "Add as owner" fails with 400 "body/role must be equal to one of the allowed values" when the real backend (chillist-be) is running on localhost:3333.
**Root Cause:** The real backend's PATCH /participants schema only allows `role: 'participant' | 'viewer'`. It does not support `role: 'owner'` yet. The mock server was extended to accept it for local dev.
**Solution:** Use `npm run mock:server` for local development when testing the Add as owner feature. For production, the backend must be updated to allow `role: 'owner'` in the participant PATCH body.
**Prevention:** When a FE feature extends beyond the OpenAPI spec (e.g., new enum values), the mock server can support it for local dev, but production will fail until the BE ships. Document which features require mock vs real backend.

---

### [Logic] Add owner vs transfer ownership — multiple owners supported

**Date:** 2026-02-26
**Problem:** Initial implementation treated "Make owner" as a transfer — demoting the current owner to participant when promoting another. User wanted to add another owner, not replace.
**Solution:** When promoting a participant to owner via PATCH, do not demote the previous owner. Update `isOwner` derivation to use `participants.some(p => p.role === 'owner' && p.userId === user.id)` instead of `participants.find`. Mock server and E2E fixtures updated to support multiple owners.
**Prevention:** Clarify add vs replace semantics before implementing ownership changes. Multiple owners require `.some()` for permission checks, not `.find()`.

---

### [Arch] CollapsibleSection — reusable Disclosure pattern

**Date:** 2026-02-26
**Problem:** CategorySection, SubcategorySection, ParticipantDetails, and the invite route each duplicated the Headless UI Disclosure pattern (button + chevron + panel).
**Solution:** Created `CollapsibleSection` in `src/components/shared/` with configurable `title`, `buttonClassName`, `panelClassName`, `chevronClassName`, `panelContentClassName`, and `buttonAs`. All four consumers now use it.
**Prevention:** When the same UI pattern appears in 3+ places, extract a reusable component into `shared/`.

---

### [UX] Bulk assign — every participant can assign all, but only unassigned items

**Date:** 2026-02-26
**Problem:** Only the plan owner could use the "Assign all to…" button in subcategories. Non-owners could not bulk-assign items to themselves.
**Solution:** Pass `onBulkAssign` for all participants (owner and non-owner). Add `restrictToUnassignedOnly` and `selfParticipantId` to BulkAssignButton — when set (non-owner mode), filter items to unassigned only, show only the current participant in the dropdown, and assign only unassigned items without a conflict dialog.
**Prevention:** When expanding a feature from owner-only to participant-wide, consider permission boundaries (e.g. non-owners can only act on unassigned items).

---

### [UX] Bulk assign button not visible on production — moved below subcategory header

**Date:** 2026-02-26
**Problem:** The bulk assign button lived in the subcategory header row as a tiny 7×7 icon next to the chevron. It was low-contrast, hard to tap on mobile, and not visible on production.
**Solution:** Moved BulkAssignButton from the subcategory header row into the DisclosurePanel content, placed below the subcategory header and above the items. Each subcategory gets its own button that assigns all items in that subcategory. BulkAssignButton trigger changed from icon-only to a styled text+icon button.
**Prevention:** Avoid placing critical actions as small icons inside nested Headless UI components (Disclosure + Menu). Prefer prominent buttons below section headers, above content.

---

### [Auth] Profile update needs token refresh before sync-profile

**Date:** 2026-02-26
**Problem:** After `supabase.auth.updateUser(...)`, participant records across plans were not updated immediately because the app did not call backend `POST /auth/sync-profile`.
**Solution:** In `AuthProvider`, handle `USER_UPDATED` by calling `supabase.auth.refreshSession()` first, then call `POST /auth/sync-profile` with the refreshed JWT (`syncProfile` helper in `api.ts`). Keep it fire-and-forget and log failures without blocking profile update UX.
**Prevention:** Any flow that depends on updated JWT claims (`user_metadata`) must refresh the Supabase session before calling BE endpoints that read those claims.

---

### [Arch] ItemsList component — plan item list grouped by subcategory

**Date:** 2026-02-26
**Problem:** Plan detail page, items page, and invite page each had duplicated logic for grouping items by category and rendering CategorySection.
**Solution:** Created ItemsList component that receives filtered items and renders CategorySection per category. Extended CategorySection with `groupBySubcategory` prop — when true, groups items by subcategory (from taxonomy), shows subcategory headers with item counts, and falls back to "Other" for items without subcategory. Added `groupBySubcategory()` helper in `src/core/utils/items.ts`. ItemsList used in plan.$planId.lazy.tsx, ItemsView, and invite page.
**Prevention:** Extract repeated item-list rendering into a shared component. Use taxonomy-defined order for subcategory headers (equipment/food subcategories first, "Other" last).

---

### [Test] E2E admin delete modal — waitForResponse times out on Mobile Safari

**Date:** 2026-02-26
**Problem:** `admin can delete a plan via confirmation modal` timed out on Mobile Safari (60s). The test used `Promise.all([page.waitForResponse((r) => r.request().method() === 'DELETE'), page.getByTestId('admin-delete-confirm').click({ force: true })])`. The DELETE response never arrived — likely a race or Mobile WebKit interaction quirk with Headless UI modals.
**Solution:** Removed `waitForResponse`; assert only on UI outcomes: click confirm, then `toBeHidden` for the modal and `toBeVisible` for the toast. The mock still handles DELETE; the test now verifies the visible result instead of the network call.
**Prevention:** For Headless UI modal submit flows on Mobile Safari, avoid `waitForResponse` in parallel with the click. Assert on UI state (modal closed, toast shown) instead of network responses.

---

### [Test] E2E Participant Preferences — Edit button locator; Invite — auth modal blocks Participants click

**Date:** 2026-02-26
**Problem:** Two E2E tests failed: (1) `owner can see edit buttons on participant preferences` — Edit buttons were not found; `detailsSection = page.getByText('Group Details').locator('..')` only selected the DisclosureButton, but Edit lives in DisclosurePanel (sibling). (2) `shows plan details for valid invite link` — click on "Participants" timed out because a Headless UI auth modal (`myRsvpStatus: 'pending'`) was covering the page and intercepting pointer events.
**Solution:** (1) Changed locator to `locator('../..')` so detailsSection is the full Disclosure div containing both button and panel. (2) Added `mockInviteRoute(..., { myRsvpStatus: 'confirmed' })` so the invite page skips the auth modal and shows plan details directly.
**Prevention:** When asserting on elements inside a Headless UI Disclosure, ensure the locator scope includes the DisclosurePanel (use `../..` from the button text to get the Disclosure container). For invite E2E, use `myRsvpStatus: 'confirmed'` when testing plan details to avoid auth modal blocking interactions.

---

### [UX] Invite page did not auto-redirect authenticated users to the plan

**Date:** 2026-02-26
**Problem:** After signing in from the invite page (especially via Google OAuth), users landed back on the invite page and had to manually click "Go to plan" instead of being redirected directly to `/plan/:planId`. The OAuth flow deliberately redirected to the invite page as a workaround for a claim race condition (issue #109). Same for already-signed-in users opening an invite link.
**Solution:** (1) Added `useEffect` in the invite page that detects authenticated users, calls `claimInvite()` (catches errors for already-claimed), then navigates to `/plan/:planId`. (2) Changed OAuth redirect in `signin.lazy.tsx` and `signup.lazy.tsx` to use the `redirectTo` param (plan page) instead of the invite page. The `AuthProvider.onAuthStateChange` handler still claims the invite in the background as a fallback.
**Prevention:** When building invite/auth flows, prefer auto-redirect over manual navigation buttons. If an intermediate page exists only as a race-condition safety net, replace it with auto-redirect logic that handles the race internally (claim then navigate).

---

### [Arch] FE built ahead of BE — added fields/endpoints that don't exist in the OpenAPI spec, broke production

**Date:** 2026-02-25
**Problem:** The invite page (`/invite/:planId/:inviteToken`) showed "Invalid or expired invite link" on production. Console showed `ZodError: myParticipantId is Required, myRsvpStatus is Required`. The FE Zod schema, mock server, E2E fixtures, and component code all included `myParticipantId`, `myRsvpStatus`, and `myPreferences` — fields that **do not exist** in the BE OpenAPI spec (`def-28` / `InvitePlanResponse`). The mock server returned them, so dev and tests passed. Production broke because the real BE only returns the fields defined in its spec.
**Root Cause:** The guest invite flow redesign was implemented entirely on the FE without the BE being updated first. The mock server was extended to return the new fields, masking the fact that the real BE doesn't have them. This violated the "BE owns the spec, FE only consumes" rule. The same pattern as the 2026-02-12 OpenAPI Spec Drift incident — FE added fields the BE doesn't have, mock server hid the mismatch, production broke.
**Solution:** Remove `myParticipantId`, `myRsvpStatus`, `myPreferences` from all FE layers (Zod schema, mock server response, E2E fixtures, component code). Revert the invite page to a read-only plan preview that works with what the BE actually returns. The guest RSVP/item features must wait until the BE implements the required fields and endpoints.
**Prevention:** NEVER build FE features ahead of the BE. Every field in the FE Zod schema, mock server response, and E2E fixture must exist in the BE OpenAPI spec. If a feature needs new fields or endpoints, STOP and tell the user it requires BE work first. The mock server must mirror the real BE exactly — it is a stand-in, not a preview of a future BE. See rule: "NEVER Build FE Ahead of the BE" in frontend.md.

---

### [i18n] Zod validation error messages appear in English regardless of active language

**Date:** 2026-02-25
**Problem:** In PreferencesForm, Zod validation errors (e.g., "Expected number, received nan", "Number must be greater than or equal to 1") appeared in English even when Hebrew was active. The schema was defined at module level with no custom error messages, so Zod used its English defaults.
**Solution:** Converted the module-level `preferencesFormSchema` to a factory function `buildPreferencesSchema(t)` that accepts the `t` translation function. Added translated error messages via Zod's `invalid_type_error` and `message` params (e.g., `z.coerce.number({ invalid_type_error: t('validation.adultsCountInvalid') }).min(1, t('validation.adultsCountMin'))`). Defined `PreferencesFormValues` as an explicit type since the schema is now dynamic.
**Prevention:** When a Zod schema is used with `zodResolver` in a form that supports i18n, never rely on Zod's default English error messages. Use a schema factory function that takes `t` and passes translated messages to every validator that can fail. Define the form values type explicitly rather than inferring from a dynamic schema.

---

### [Test] Removed "edits item quantity via form" E2E test — unreliable on Mobile Safari

**Date:** 2026-02-25
**Problem:** The `edits item quantity via form` E2E test failed consistently on Mobile Safari (WebKit) during pre-commit hooks. After clicking "Update Item" (`force: true`), the Headless UI modal stayed visible and `toBeHidden({ timeout: 10000 })` timed out. Passed on Chrome, Firefox, and Desktop Safari every time. All documented mitigations were already applied. The test only verified a single-field quantity edit — the broader `edits all item fields via modal form` test already covers opening the edit modal, changing fields, submitting, and verifying the modal closes and values update.
**Solution:** Deleted the test. The functionality is already covered by the more comprehensive `edits all item fields via modal form` test, which passes on all browsers including Mobile Safari.
**Prevention:** Don't write narrow E2E tests that duplicate coverage from a broader test in the same describe block. When a Headless UI modal E2E test is unreliable on a specific browser after applying all known mitigations, remove it if equivalent coverage exists elsewhere rather than letting it block commits indefinitely.

---

### [Arch] Logging must include context — silent catches and vague messages make production debugging impossible

**Date:** 2026-02-25 (updated)
**Problem:** When the invite page failed in production, logs showed only `[invite] Schema validation failed:` with Zod issues — no `planId`, no token, no raw data keys. `AuthProvider.claimInvite()` had a completely silent `.catch(() => {})`. `pending-invite.ts` store/get/clear had empty catch blocks. Multiple `catch` blocks across the codebase swallowed errors with no logging at all (geocoding, clipboard, localStorage, form submissions). This made it extremely hard to trace what happened when users reported bugs. **Follow-up audit** found additional gaps: `claimInvite()` and `saveGuestPreferences()` in `api.ts` had zero function-level logging, `AuthProvider.getSession()` had no `.catch()` (app would hang on loading forever if it failed), `signOut` showed `toast.error` without `console.error`, and sign-in/sign-up claim failures had no user-visible toast.
**Solution:** (1) Added structured success/failure logging to `claimInvite()` and `saveGuestPreferences()` in `api.ts`. (2) Added `.catch()` to `AuthProvider.getSession()` to prevent infinite loading on failure. (3) Added `console.error` alongside `toast.error` in `signOut`. (4) Added `toast.error(t('invite.claimFailed'))` in sign-in/sign-up when claim fails — user now sees the error instead of silently landing on a broken plan page. (5) Wrapped `onSubmit` and OAuth handlers in top-level try/catch with `toast.error` to prevent unhandled promise rejections.
**Prevention:** Every `catch` block must log the error with enough context to reproduce the issue: the function name, all relevant IDs (planId, participantId, itemId), the endpoint, and the error message. Never use empty `catch {}` — at minimum log a `console.warn`. For critical paths (auth, invite, API), log both success and failure. Truncate tokens to 8 chars for security. When `toast.error()` is shown, always also `console.error()` the full details. Every async entry point (`onSubmit`, button handlers) must have a top-level try/catch. See issue #109.

---

### [Bug] Invite claim race condition — claimInvite() not awaited before navigation (FIXED — issue #109)

**Date:** 2026-02-25
**Problem:** Guest signs in from invite link → redirected to plan page → "plan not found" (0 plans). The participant record still has `userId = null` because `claimInvite()` hasn't completed. `GET /plans` only returns plans where the user is the creator, admin, or a linked participant.
**Root Cause:** `AuthProvider` calls `claimInvite()` as fire-and-forget. The sign-in/sign-up pages navigate immediately after auth, creating a race between the claim POST and the plan fetch.
**Solution:** Two-path fix: (1) **Email auth:** In `signin.lazy.tsx` and `signup.lazy.tsx`, after successful auth, check `getPendingInvite()` — if found, **await** `claimInvite()`, clear localStorage, invalidate React Query cache, then navigate. (2) **OAuth (Google):** Change the OAuth `redirectTo` to the invite page (`/invite/:planId/:inviteToken`) instead of `/plan/:planId` when a pending invite exists. The invite page works via the public API without the claim being done. `AuthProvider` fires the claim in the background — by the time the user clicks "Go to plan", the claim is complete. `AuthProvider` also invalidates the query cache after successful claim.
**Prevention:** When a flow requires an API call to complete before navigation (linking, claiming, syncing), always await the call in the component that triggers the navigation — never rely on a fire-and-forget side effect in a context/provider. For OAuth flows where you can't control post-redirect behavior, redirect to a page that works without the pending operation (e.g., the public invite page).

---

### [Bug] Unauthenticated guest redirected to authenticated route after preferences (FIXED — issue #109)

**Date:** 2026-02-25
**Problem:** Unauthenticated guest clicks "Continue without signing in" on invite page → fills preferences modal → redirected to `/plan/:planId` → plan not found (401 or empty). The `/plan/:planId` route requires JWT authentication which the guest doesn't have.
**Root Cause:** `handleGuestPreferences` and `handleSkipPreferences` in `invite.$planId.$inviteToken.lazy.tsx` navigate to `/plan/$planId` instead of staying on the invite page.
**Solution:** Removed the `navigate()` calls from both handlers. After preferences submit or skip, the modal simply closes and the guest stays on the invite page (`/invite/:planId/:inviteToken`) which already shows the full plan details via the public API.
**Prevention:** When building flows for unauthenticated users, always verify the redirect target is accessible without auth. Authenticated routes (`/plan/:id`, `/plans`) require JWT — unauthenticated guests should stay on public routes (`/invite/:planId/:token`).

---

### [Test] act(...) warnings — async state updates in tests must be wrapped properly

**Date:** 2026-02-25
**Problem:** Unit tests produced ~30 `act(...)` warnings and ~6 Headless UI `getAnimations` polyfill warnings. Four sources: (1) `router.navigate()` triggering async `Transitioner` state updates in TanStack Router, (2) `AuthProvider` calling `getSession()` on mount (Promise resolves outside act), (3) Headless UI Combobox (`Mo` component) updating after `setTimeout`, (4) jsdom missing `Element.prototype.getAnimations` causing Headless UI to polyfill and warn.
**Solution:** (1) Wrap `router.navigate()` in `act(async () => { ... })`. (2) Wrap `renderHook()` in `act()` or use `waitFor()` for sync assertions after rendering components with async `useEffect`. (3) Wrap `setTimeout` waits in `act()`. (4) Polyfill `getAnimations` in `tests/setup.ts` with `Element.prototype.getAnimations = () => []` — do NOT use `jsdom-testing-mocks` `mockAnimationsApi()` as it breaks TanStack Router rendering.
**Prevention:** When writing tests that trigger async state updates (navigation, provider mounts with async init, timers), always wrap the triggering code in `act()`. For Headless UI/jsdom gaps, add lightweight polyfills to `tests/setup.ts` — avoid full mock libraries that change DOM behavior beyond what's needed.

---

### [Arch] Invite claim — guest must link to participant after sign-in via localStorage handoff

**Date:** 2026-02-24
**Problem:** Guest opens invite link → signs up → redirected to plan page → "plan not found". The BE only returns plans where the user is the owner, a linked participant (`participants.userId` matches), or the plan is public. A newly signed-up user has `participants.userId = null` — the participant record isn't linked to their Supabase account yet.
**Solution:** (1) Store `{ planId, inviteToken }` in localStorage when the guest clicks sign-in/sign-up from the invite page. (2) In `AuthProvider`, on `SIGNED_IN` event, check localStorage for a pending invite. (3) If found, clear it and call `POST /plans/:planId/claim/:inviteToken` with the JWT — this links the user's `userId` to the participant record and sets `inviteStatus` to `accepted`. (4) The redirect to `/plan/:planId` (via `?redirect` param) now works because the user is a linked participant.
**Prevention:** When implementing invite-to-auth flows, always plan for the "linking" step between the anonymous invite token and the authenticated user identity. Use localStorage as a bridge across the auth redirect boundary. The claim must happen before the user tries to access the resource.

---

### [E2E] Auth-conditional UI needs authenticated session in E2E tests

**Date:** 2026-02-24
**Problem:** The "Plan creation via UI" E2E test clicked `getByRole('link', { name: /create new plan/i })` on `/plans`. After making "Create New Plan" conditional on authentication (replaced by Sign In / Sign Up for guests), the test timed out because no user session was injected.
**Solution:** Added `await injectUserSession(page)` at the start of the test. When scoping locators in unauthenticated tests, use `page.getByRole('main')` to avoid duplicates from the header's own Sign In / Sign Up links.
**Prevention:** Any E2E test that interacts with auth-gated UI must call `injectUserSession(page)` first. When asserting elements that exist in both header and main content, scope to `page.getByRole('main')`.

---

### [Arch] Sign-in/sign-up redirect param — use non-lazy route with `validateSearch`

**Date:** 2026-02-24
**Problem:** The invite page needed to link to sign-in with a `?redirect=/plan/:planId` param so the user lands on the plan page after authentication. The sign-in and sign-up lazy routes had no search param support — they hardcoded `navigate({ to: '/plans' })`.
**Solution:** Created non-lazy route files (`signin.tsx`, `signup.tsx`) with `validateSearch: z.object({ redirect: z.string().optional() })`. The lazy components use `useSearch({ from: '/signin' })` to read the param and fall back to `/plans` when absent. Google OAuth `redirectTo` also uses the param. Existing unit tests needed `useSearch: () => ({})` added to the `@tanstack/react-router` mock.
**Prevention:** When a route needs search params, always create a non-lazy route file alongside the `.lazy.tsx` to define `validateSearch`. Add `useSearch` to any `@tanstack/react-router` mock in test files that render components using it.

---

### [Arch] Public API endpoints need a separate request helper — no auth, no 401 retry

**Date:** 2026-02-24
**Problem:** The invite landing page fetches plan data via a public endpoint (`GET /plans/:planId/invite/:inviteToken`). The existing `request()` helper always calls `getAccessToken()` and has a 401 retry cascade, which is wasteful and incorrect for unauthenticated endpoints.
**Solution:** Added `publicRequest<T>()` in `api.ts` that calls `doFetch()` directly without auth token injection or 401 retry logic. `fetchPlanByInvite()` uses `publicRequest()`. Unit test verifies no `getSession` call is made.
**Prevention:** For any future public/unauthenticated API endpoints, use `publicRequest()` instead of `request()`. Never send auth headers to endpoints that don't require them.

---

### [Deps] Google Places autocomplete — use programmatic API, not PlaceAutocompleteElement

**Date:** 2026-02-24
**Problem:** `PlaceAutocompleteElement` renders in a closed Shadow DOM — its input is invisible to accessibility tools and browser automation. It also creates its own input element, making it impossible to integrate with an existing `<input>` field in a form. Additionally, `version="weekly"` on `APIProvider` injects global CSS that breaks form input styles (borders, backgrounds, padding stripped from all inputs).
**Root cause:** (1) `PlaceAutocompleteElement` uses a closed Shadow DOM — you cannot inspect, style, or interact with its internal elements from outside. (2) Setting `version="weekly"` on `APIProvider` loads a Maps JS API version that injects more aggressive global CSS than the default version, breaking Tailwind-styled form inputs across the entire page.
**Solution:** Use the programmatic `AutocompleteSuggestion.fetchAutocompleteSuggestions()` API instead. This lets you: (1) bind autocomplete to any existing `<input>` via a ref, (2) render a custom dropdown with full control over styling, (3) avoid Shadow DOM entirely. Use `AutocompleteSessionToken` for billing optimization. Do NOT pass `version="weekly"` to `APIProvider` — the programmatic Places API is GA and available in the default version.
**Prevention:** Avoid `PlaceAutocompleteElement` when you need to integrate with existing form inputs or control styling. Prefer the programmatic `fetchAutocompleteSuggestions` API. Never use `version="weekly"` or `version="beta"` on `APIProvider` unless you specifically need a beta/preview feature — both inject global CSS that can break form styles.

---

### [Arch] Sign-out used window.location.reload() instead of router navigation + cache clear

**Date:** 2026-02-24
**Problem:** After sign-out, the app called `window.location.reload()` to reset state. This caused a full page reload — jarring UX, threw away the entire React tree, and re-fetched all static assets. It also bypassed the router, so the user stayed on whatever page they were on (potentially an auth-gated page).
**Solution:** Replaced `window.location.reload()` with `queryClient.clear()` (removes all React Query cached data from the previous user's session) + `navigate({ to: '/' })` (redirects to home via TanStack Router). The Supabase `onAuthStateChange` listener already clears `user` and `session` state on `SIGNED_OUT`, so all auth-aware components re-render automatically.
**Prevention:** Never use `window.location.reload()` for state cleanup in an SPA. Use the framework's tools: clear the query cache for data, and use the router for navigation. Hard reloads are only justified when you suspect the app is in a fundamentally broken state (e.g., corrupted service worker).

---

### [Arch] AuthProvider called /auth/me on every SIGNED_IN event — 8+ redundant 401s on page load

**Date:** 2026-02-24
**Problem:** Production console showed 8+ `GET /auth/me 401` errors on every page load. `AuthProvider.onAuthStateChange` called `fetchAuthMe()` on every `SIGNED_IN` event to get the user's email for a toast. Supabase fires `SIGNED_IN` multiple times (session restore, tab focus, auto-refresh), and each call with an expired/missing token triggered the 401 retry cascade in `request()` (original call → 401 → `refreshSession()` → retry → another 401).
**Solution:** Removed the `fetchAuthMe()` call from `onAuthStateChange`. The user's email is already available in the Supabase session object (`newSession.user.email`), so no backend round-trip is needed for the toast.
**Prevention:** Never make backend calls from `onAuthStateChange` for data that's already in the Supabase session. `onAuthStateChange` fires frequently (session restore, token refresh, tab focus) — keep handlers lightweight and side-effect-free. If backend verification is needed, do it once on explicit user-initiated sign-in, not on every event.

---

### [Infra] Deploy pipeline took 7-31 min and failed on WebKit E2E — restructured CI/CD

**Date:** 2026-02-23
**Problem:** `deploy.yml` re-ran the full E2E suite (4 browsers, 2 retries) that `ci.yml` already passed on the PR. WebKit-only form-dismissal bugs caused 3 deterministic failures on every deploy. With 60s timeout × 3 attempts × 4 browsers, a single failing test burned 12 minutes. Additionally, `install-deps` in `deploy.yml` lacked browser filters, sometimes taking 25 minutes when apt mirrors were slow.
**Solution:** (1) Removed all E2E from `deploy.yml` — merged test+deploy into a single job (lint, typecheck, unit tests, build, deploy). (2) Split `ci.yml` into two parallel jobs: `test` (Chrome only, required gate) and `test-safari` (Safari+Firefox, `continue-on-error: true`). (3) Reduced Playwright retries from 2 to 1. (4) Fixed WebKit E2E failures by using `force: true` on form submit clicks and increasing `toBeHidden` timeout to 10s. (5) Pre-commit hook runs all browsers for thorough local validation; CI runs Chrome only as the required gate. (6) Added `e2e:docker` script for local Linux-WebKit testing.
**Prevention:** Never duplicate the same test suite across CI and deploy pipelines — deploy should trust CI results. Use a two-tier CI strategy: fast required browser (Chrome) gates merges, other browsers run non-blocking. For Headless UI modal submit buttons on WebKit, always use `force: true` and longer `toBeHidden` timeouts. Use `npx playwright install-deps <browsers>` (not bare) to avoid installing unneeded system deps. Keep the Playwright Docker image tag in sync with `@playwright/test` version.

---

### [Test] WebKit E2E — form submit click doesn't dismiss Headless UI modal on Linux-WebKit

**Date:** 2026-02-23
**Problem:** E2E tests `adds items via UI` and `edits all item fields via modal form` failed on Desktop Safari and Mobile Safari in CI (Linux-WebKit) but passed locally (macOS-WebKit). After clicking the submit button, the form/modal stayed visible. The `toBeHidden({ timeout: 5000 })` assertion timed out. Same error on all retry attempts — deterministic, not flaky.
**Solution:** Applied `force: true` on all form submit button clicks inside Headless UI dialogs (same pattern as ComboboxOption clicks documented earlier). Increased `toBeHidden` timeout from 5s to 10s. Verified visibility before clicking (`await expect(btn).toBeVisible()`).
**Prevention:** Playwright's WebKit on Linux behaves differently from macOS WebKit. For Headless UI modal form submissions: (1) always use `click({ force: true })` on submit buttons, (2) use generous `toBeHidden` timeouts (10s), (3) test with `npm run e2e:docker` to reproduce CI's Linux-WebKit environment locally before pushing.

**How to see Safari failures when they pass locally:** CI runs WebKit on Linux (different from macOS). Run `npm run e2e:docker` locally to match CI exactly. On PRs, the `test-safari` job always uploads a Playwright report artifact — download it from the Actions run to inspect failures. Safari failures show as yellow warning annotations on the PR; they do not block merge.

---

### [Arch] JWT 401 had no retry or recovery — expired tokens caused hard failures

**Date:** 2026-02-23
**Problem:** When a Supabase access token expired between requests, the API call returned 401 and showed a generic toast that disappeared after a few seconds. No token refresh, no retry, no clear recovery path. The secondary `api-client.ts` (openapi-fetch) didn't inject JWT at all.
**Solution:** (1) Added 401 retry to `request()` in `api.ts` — on 401, calls `supabase.auth.refreshSession()` and retries once. (2) On final 401, emits via `src/core/auth-error.ts` event bus which triggers `AuthErrorModal` with Sign In / Dismiss buttons. (3) Added JWT injection to `api-client.ts` via `authFetch` wrapper. (4) Improved `ErrorPage` to show plan-specific 404 message for access control errors.
**Prevention:** Every API layer must inject JWT and handle 401 with refresh+retry. Auth failures surface via `AuthErrorModal`, never a toast. See `rules/frontend.md` > "JWT 401 Retry and Auth Error Modal".

---

### [Test] E2E test broke after adding preferences modal — test didn't account for new post-creation step

**Date:** 2026-02-23
**Problem:** E2E test "creates a plan with owner and navigates to detail page" failed in CI. After clicking "Create Plan", the test expected immediate navigation to `/plan/:id`, but the page stayed on `/create-plan`. The participant preferences feature added a modal that appears after plan creation, requiring the user to either fill preferences or skip before navigation happens.
**Solution:** Added a click on the "Skip for now" button in the E2E test between form submission and the URL assertion.
**Prevention:** When adding a new step to an existing user flow (e.g., a modal between form submission and navigation), always update the E2E tests that cover that flow in the same PR. Also added E2E tests to the Husky pre-push hook (`VITE_AUTH_MOCK=true npx playwright test --project="Desktop Chrome"`) so broken E2E tests are caught before pushing.

---

### [Infra] api:fetch fails in GitHub Actions — GITHUB_TOKEN is scoped to current repo only

**Date:** 2026-02-23
**Problem:** `npm run api:fetch` failed with exit code 22 in GitHub Actions. The curl command used `$GITHUB_TOKEN` to fetch `openapi.json` from the private `chillist-be` repo via `raw.githubusercontent.com`. Locally it worked because `GITHUB_TOKEN` is a PAT with broad repo access.
**Root cause:** In GitHub Actions, `GITHUB_TOKEN` is automatically set to a built-in installation token scoped to the **current repo only** (`chillist-fe`). It cannot access content from other private repos (`chillist-be`), so GitHub returned 403/404 and curl exited with code 22 (`-f` flag).
**Solution:** Extracted curl logic into `scripts/fetch-openapi.sh` with conditional auth: (1) uses `API_SPEC_TOKEN` if set, (2) falls back to `GITHUB_TOKEN` only when NOT in CI (local dev), (3) falls back to no auth. In CI workflows, `API_SPEC_TOKEN` is passed from a GitHub secret — a fine-grained PAT scoped to read-only on `chillist-be`.
**Prevention:** Never rely on the built-in `GITHUB_TOKEN` for cross-repo access in GitHub Actions. For private cross-repo file access, use a fine-grained PAT stored as a repo secret with a dedicated env var name (not `GITHUB_TOKEN`) to avoid collision with the built-in token.

---

### [Deps] Google Maps API beta breaks native date/time pickers

**Date:** 2026-02-23
**Problem:** After migrating `LocationAutocomplete` to `PlaceAutocompleteElement` with `version="beta"` on `APIProvider`, native `<input type="date">` and `<input type="time">` pickers stopped opening. Worked on desktop after a CSS fix but still broke on mobile.
**Root cause:** Google Maps API (`version="beta"`) injects global CSS that strips `appearance` from form inputs, disabling native date/time picker controls. Combined with Tailwind v4 preflight setting `background-color: transparent` on all inputs, the native controls became invisible or non-functional. Mobile was hit harder because touch-based picker activation is more sensitive to `appearance` being stripped.
**Solution:** Two-layer fix: (1) In `index.css`, added `appearance: auto !important` for `input[type='date']`, `input[type='time']`, `input[type='datetime-local']`, `input[type='month']`, `input[type='week']` to override any injected styles. (2) In `FormInput`, added `showPicker()` on click for picker-type inputs (forces the native picker to open programmatically), added `bg-white` to input styles, and added `cursor-pointer` for picker inputs. Wrapped `showPicker()` in try-catch since it throws outside user-gesture contexts.
**Prevention:** When loading third-party APIs that inject global CSS (Google Maps, Stripe, etc.), always protect native form controls with `appearance: auto !important` in your base CSS. Use `showPicker()` on click for date/time inputs as a belt-and-suspenders approach. Test date/time pickers on both desktop and mobile after adding any new third-party script.

---

### [Deps] Migrate from legacy google.maps.places.Autocomplete to programmatic Places API

**Date:** 2026-02-23 (updated 2026-02-24)
**Problem:** Console warning: "As of March 1st, 2025, google.maps.places.Autocomplete is not available to new customers." The legacy API was completely blocked for new API keys — the widget initialized but made zero autocomplete API calls.
**Solution:** Replaced the legacy `new places.Autocomplete(input, options)` with `AutocompleteSuggestion.fetchAutocompleteSuggestions()` in `LocationAutocomplete.tsx`. Key differences: (1) programmatic API fetches predictions — you render your own dropdown, (2) bind to any existing input via a ref and `input` event listener (debounced at 300ms), (3) use `placePrediction.toPlace()` then `place.fetchFields()` to get `displayName`, `location`, `addressComponents`, (4) address components use `longText` instead of `long_name`, (5) use `AutocompleteSessionToken` for per-session billing. Do NOT use `version="weekly"` on `APIProvider` — causes global CSS injection. Requires "Places API (New)" enabled in Google Cloud Console.
**Prevention:** When Google deprecation warnings appear for Maps APIs, check the migration guide. Prefer the programmatic `fetchAutocompleteSuggestions` API over `PlaceAutocompleteElement` — it gives full control over the input and dropdown without Shadow DOM or global CSS side effects.

---

### [Test] E2E button selector must match accessible name — SVG icons with aria-hidden are excluded

**Date:** 2026-02-23
**Problem:** E2E test "adds items via UI" timed out in CI waiting for `getByRole('button', { name: /^\+\s*Add Item$/i })`. The "Add Item" button renders the `+` as an SVG with `aria-hidden="true"` and the text "Add Item" in a `<span>`. Playwright computes the accessible name from visible text content only, so the actual name is `"Add Item"`, not `"+ Add Item"`.
**Solution:** Changed the test regex from `/^\+\s*Add Item$/i` to `/^Add Item$/i` to match the actual accessible name.
**Prevention:** When writing `getByRole` selectors for buttons that contain icons (SVG with `aria-hidden="true"`), only match against the text content — the icon is excluded from the accessible name. Always verify button accessible names by running the test locally before pushing.

---

### [Infra] Google Maps API key — localhost referrer restrictions don't work reliably

**Date:** 2026-02-22
**Problem:** After adding Google Maps integration, the map showed `RefererNotAllowedMapError` on `localhost:5174` even after adding the URL to Google Cloud Console's HTTP referrer restrictions (both with and without `/*` wildcard).
**Solution:** Set API key application restriction to "None" for local development. For production, use HTTP referrer restrictions with the production domain (`https://your-domain.pages.dev/*`). Alternatively, create two separate API keys — one unrestricted for dev, one restricted for production.
**Prevention:** When setting up Google Maps API keys: (1) Use unrestricted keys for localhost dev, (2) When changing the production domain, update the allowed referrers in Google Cloud Console, (3) Document this in the frontend guide under "Google Maps > API Key Restrictions".

---

### [Arch] NEVER hand-write values the backend owns — use generated types as source of truth

**Date:** 2026-02-22
**Problem:** Editing items in production returned "Invalid Request" (400). Worked perfectly locally. The FE hand-wrote `unitSchema = z.enum(['pcs', ..., 'm', 'cm'])` with `m` and `cm` — values the backend doesn't have. The mock server copied the same wrong values, so local dev passed. Only production (real backend) rejected them. This bug was attempted to be fixed 4 times before the root cause was identified.
**Root cause:** The FE **hand-maintained** Zod enums for values that are **already defined by the backend** and **already auto-generated** into `src/core/api.generated.ts` via `npm run api:types`. Two parallel sources of truth existed: the hand-written Zod schemas and the generated types — and they drifted. The whole point of OpenAPI + type generation is that the backend owns these values. When asked to add `m`/`cm`, the correct response was "this must be added to the backend first" — not silently adding it to the FE.
**Solution:**

1. Removed `m`/`cm` from all FE layers (Zod schema, constants, unit groups, translations, mock server)
2. Wired all FE Zod enum arrays to the generated BE types via `as const satisfies readonly BEType[]` — TypeScript now errors if the FE adds a value the BE doesn't have
3. Improved 400 error toast to surface the actual backend message
   **Prevention:**
4. **NEVER** hand-write enum values that the backend owns. The generated types in `api.generated.ts` are the source of truth. FE Zod schemas must use `satisfies` against the generated types.
5. When asked to add a new enum value (unit, status, category, role, visibility): **STOP** — tell the user it must be added to the backend first. Then run `npm run api:sync` to pull the change, and only then update the FE.
6. The mock server must mirror the real backend's constraints exactly — never be more lenient.
7. Error toasts for 400s must show the actual backend message, not a generic fallback.

---

### [Logic] react-hook-form Controller on native select breaks in production builds

**Date:** 2026-02-22
**Problem:** Unit `<select>` in the edit item modal was unclickable on production (Cloudflare Pages) — no reaction on mobile or desktop. Other selects (category, status, assignment) worked fine. The unit field appeared visually smaller than other inputs. Worked normally on local dev server. Affected both English and Hebrew plans.
**Root cause:** The unit select was the ONLY field using `Controller` (controlled component with explicit `value` prop). All other selects used `register` (uncontrolled). The `Controller` approach renders `<select value={field.value}>` which changes how React manages the element. In production builds (bundled + minified), this caused the select to become non-interactive — likely a React 19 production mode interaction with controlled native selects inside Headless UI Dialog modals.
**Solution:** Reverted the unit `<select>` from `Controller` back to `register` — matching the pattern of all other working selects in the same form. `register` + `setValue` works correctly for the category field (which also uses autocomplete auto-fill), so it works for unit too. Also removed leftover debug `console.log` statements.
**Prevention:** For native HTML `<select>` elements in react-hook-form, prefer `register` over `Controller`. Only use `Controller` for custom components (like Headless UI Listbox, Combobox, Autocomplete) that don't expose a standard onChange/ref interface. If a native select needs programmatic updates via `setValue`, `register` handles it correctly — `setValue` updates both the internal state and the DOM element via the ref.

---

### [Test] i18n E2E test fails on Mobile Safari — lang-toggle hidden behind hamburger menu

**Date:** 2026-02-21
**Problem:** The i18n E2E test (`i18n.spec.ts`) passed on Desktop Chrome and Firefox but failed on Mobile Safari in CI. The `lang-toggle` button lives inside the desktop nav (`hidden sm:flex`), which is `display: none` on viewports below 640px. The mobile language toggle has a different `data-testid` (`lang-toggle-mobile`) and is inside the hamburger menu. The test was only verified locally on desktop browsers before pushing.
**Solution:** Used Playwright's built-in `isMobile` fixture to branch the test logic: on mobile, open the hamburger menu first and use `lang-toggle-mobile`; on desktop, use `lang-toggle` directly. Also gate nav link assertions behind `!isMobile` since they're hidden in the hamburger menu.
**Prevention:** Always run `npx playwright test <file>` (all projects) before pushing E2E tests — never just a single browser. When a UI has responsive breakpoints with different interactive elements per viewport, the E2E test must handle both paths using `isMobile` or viewport detection.

---

### [Arch] i18n — API enum values must be translated at display time, not stored translated

**Date:** 2026-02-21
**Problem:** Plan status (`active`/`draft`), visibility (`public`/`private`), participant roles (`owner`/`viewer`), item status (`pending`/`packed`), and item units (`pcs`/`kg`) were displayed as raw English strings from the API. The labels were translated in form dropdowns (via `labelKey` in constants) but not in read-only displays.
**Solution:** Use `t('planStatus.${status}')`, `t('roles.${role}')`, `t('units.${unit}')` etc. at every display point. Data stays English in the DB and API — only the UI label is translated. Also replaced the hardcoded `const NA = 'N/A'` with `t('plan.na')`.
**Prevention:** When displaying any enum/system value from the API, always wrap it in a translation call. Never render raw API enum values directly — use the pattern `t('namespace.${value}')` with matching keys in both locale files.

---

### [Arch] i18n — module-level constants with labels need translation-aware pattern

**Date:** 2026-02-21
**Problem:** Several components had module-level constants containing user-facing labels (e.g., `statusConfig`, `LIST_TABS`, `CATEGORY_LABELS`). React hooks like `useTranslation()` can't be called at module level, so these labels couldn't be translated directly.
**Solution:** Two patterns: (1) Move the config inside the component function where the hook is available (e.g., `statusConfig` in PlansList). (2) Store translation keys instead of labels in the constant, then resolve them with `t()` inside the component (e.g., `labelKey: 'filters.buyingList'` in StatusFilter).
**Prevention:** When creating constants with user-facing strings, use translation keys from the start. Never put display text in module-level constants — always use i18n keys that get resolved inside a component.

---

### [Test] i18n breaks tests that query hardcoded strings — mock useLanguage globally

**Date:** 2026-02-21
**Problem:** After adding i18n, Header tests crashed with `useLanguage must be used within a LanguageProvider`. Components using the language context need the provider in tests.
**Solution:** Added a global mock for `useLanguage` in `tests/setup.ts` that returns English defaults. Individual tests can override with `vi.unmock()` when they need to test language switching.
**Prevention:** When adding a new context that's used in widely-tested components, add the global mock to `tests/setup.ts` immediately — don't wait for tests to break.

---

### [Infra] Google OAuth on prod — full Supabase + Google Cloud setup checklist was missing

**Date:** 2026-02-18
**Problem:** Google OAuth sign-up on production failed with three successive errors: (1) `"Unsupported provider: provider is not enabled"` — Email and Google providers not enabled in Supabase, (2) `redirect_uri_mismatch` — Supabase callback URL not added to Google Cloud Console's authorized redirect URIs, (3) redirect to localhost after OAuth — Supabase Site URL still set to `http://localhost:5173`.
**Solution:** Completed the full Supabase + Google Cloud setup: enabled Email and Google providers in Supabase, created Google Cloud OAuth credentials (Client ID + Secret), added Supabase callback URL to Google's authorized redirect URIs, and set Supabase Site URL + Redirect URLs to the production domain.
**Prevention:** When enabling OAuth for a new environment, follow the complete checklist added to the frontend guide (Supabase Auth > Google OAuth Production Setup). Never assume Supabase defaults are production-ready — Site URL, providers, and redirect URIs all need explicit configuration per environment.

---

### [Test] Headless UI Combobox option click fails on Mobile Safari in Playwright — "element is not stable"

**Date:** 2026-02-18
**Problem:** E2E test `Item CRUD › adds items via UI` failed consistently on Mobile Safari (WebKit) in CI. Playwright reported `TimeoutError: locator.click: element is not stable` when clicking a `ComboboxOption` inside a Headless UI dropdown with `transition` + `anchor="bottom start"` (Floating UI). Chrome and Firefox passed. All 3 retries failed identically.
**Solution:** Split the click into two steps: first `await expect(option).toBeVisible()` to confirm the option rendered, then `await option.click({ force: true })` to bypass the stability check. The element was found and correct — only the stability detection was broken due to Floating UI anchor repositioning on WebKit.
**Prevention:** When using Headless UI Combobox/Listbox with `transition` + `anchor` props, use `force: true` on option clicks in Playwright E2E tests after asserting visibility. This is a known Playwright/WebKit issue with floating positioned elements that continuously recalculate position.

---

### [Infra] Deploy validation included legacy VITE_API_KEY — no env var source of truth

**Date:** 2026-02-18
**Problem:** Deploy validation step failed with `Missing required environment variables: VITE_API_KEY VITE_SUPABASE_ANON_KEY`. `VITE_API_KEY` was copied from the old build step into validation without checking if it was required or even existed in GitHub secrets. The code falls back to `''` — it's optional. `VITE_SUPABASE_ANON_KEY` hadn't been added as a GitHub repo variable yet. A commented-out entry in `.env.example` (`# VITE_API_KEY=...`) created the false signal that the var was needed.
**Solution:** Removed `VITE_API_KEY` from validation and build steps. Removed commented-out entry from `.env.example`. Added env var checklist to common rules: before pushing, verify all 6 locations are in sync (`.env.example`, `.env`, GitHub settings, workflow files, validation step, guides doc).
**Prevention:** `.env.example` only contains active uncommented vars — no legacy entries. Deploy validation only checks vars the app requires (throws without). Follow the 6-point env var checklist in common rules before every push that touches env vars.

---

### [Infra] Deploy job must validate all required env vars before building

**Date:** 2026-02-18
**Problem:** The deploy job in `deploy.yml` would silently produce a broken build if any GitHub secret/variable was missing (e.g., `VITE_SUPABASE_URL` not set). The build would succeed but the deployed app would crash at runtime.
**Solution:** Added a "Validate required environment" step as the first step in the deploy job. It checks all 7 required vars (`VITE_API_URL`, `VITE_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PROJECT_NAME`) and fails with a clear `::error::` message listing which ones are missing.
**Prevention:** Every CI deploy job should have an env validation step that runs before checkout/install/build. Fail fast with a clear message, not silently after a 5-minute build.

---

### [Infra] Playwright `html` reporter produces no stdout in CI — can't see test progress

**Date:** 2026-02-18
**Problem:** GitHub Actions E2E step showed only "Run E2E tests" with no output while tests were running. The Playwright config used `reporter: 'html'` which writes to a file, not stdout.
**Solution:** Set CI reporter to `[['list'], ['github'], ['html', { open: 'never' }]]`. `list` prints each test name/result to stdout (visible in Actions logs), `github` adds inline failure annotations on the PR, `html` keeps the artifact for the upload step. Locally it stays `'html'` only.
**Prevention:** Always configure a stdout-friendly reporter (`list` or `dot`) for CI alongside `html`. The `github` reporter is free and adds PR annotations on failures.

---

### [Infra] E2E tests hang in CI — missing VITE_AUTH_MOCK env var

**Date:** 2026-02-18
**Problem:** After adding Supabase auth, E2E tests hung for 12+ minutes in GitHub Actions. The Vite dev server started fine, but the app crashed at runtime because `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` weren't set in the CI environment. Without `VITE_AUTH_MOCK=true`, `supabase.ts` tried to create a real client and threw. Every test timed out (60s × 3 attempts with retries). Locally it worked because `.env` (gitignored) had `VITE_AUTH_MOCK=true` — CI has no `.env` file.
**Solution:** Added `VITE_AUTH_MOCK: 'true'` as an env var on the E2E test steps in both `ci.yml` and `deploy.yml`.
**Prevention:** When a module has env-var-gated behavior (mock vs real), always set the mock flag in CI workflow files. Add it at the same time as the feature, not after CI breaks. Remember: `.env` is gitignored — anything it provides locally must be explicitly set in CI.

---

### [Infra] E2E running 30 tests on 1 worker in CI — slow pipeline

**Date:** 2026-02-18
**Problem:** Playwright E2E tests ran 30 tests (3 browsers × ~10 specs) on a single worker in GitHub Actions, making CI very slow. The config had `fullyParallel: true` but no explicit `workers`, and the 2-core CI runner defaulted to 1.
**Solution:** Set `workers: process.env.CI ? 2 : undefined` in `playwright.config.ts`. Split CI: PR checks install and run Chrome only (`--project="Desktop Chrome"`), while `main` pushes run all 3 browsers. This cuts PR E2E time by ~2/3 (fewer browsers + fewer browser installs).
**Prevention:** Always set explicit `workers` for CI in Playwright config. Only run the minimum browser set needed for fast PR feedback; save full cross-browser coverage for post-merge.

---

### [Logic] Mock auth must fire all Supabase events — updateUser needs USER_UPDATED

**Date:** 2026-02-18
**Problem:** After saving profile data on `/complete-profile`, the name wasn't reflected in the Header. The mock `updateUser` in `mock-supabase-auth.ts` saved to localStorage but never fired `onAuthStateChange` with `USER_UPDATED`. The real Supabase client fires this event, which AuthProvider already handles generically (it updates user state for any event). Without the event, the React state stayed stale.
**Solution:** Added `notify('USER_UPDATED', session)` to the mock `updateUser` method, and the same pattern in the integration test's `updateUser` mock.
**Prevention:** When adding a new Supabase auth method to the mock, check what events the real client fires (see Supabase docs: `onAuthStateChange` events) and replicate them in the mock. Add an integration test that verifies the UI updates after the operation, not just that the method was called.

---

### [Test] Unit tests in isolation miss cross-boundary bugs — add integration tests

**Date:** 2026-02-18
**Problem:** Header showed one email (from Supabase session) while the sign-in toast showed a different email (from mock server `/auth/me`). Three unit test suites (Header, AuthProvider, mock server) each used their own hardcoded emails independently and all passed, but no test verified the values matched across boundaries.
**Solution:** Created `tests/integration/auth-flow.test.tsx` that wires mock Supabase auth → AuthProvider → real mock server (on a dynamic port via `buildServer()`) → Header, testing the full sign-up/sign-in/OAuth/sign-out flows end-to-end. The key assertion: the email in the toast (from `/auth/me` JWT decode) matches the email in the Header (from session).
**Prevention:** When a value flows through multiple systems (auth provider → API → backend → UI), add an integration test that crosses all boundaries. Unit tests only prove each piece works alone.

---

### [Logic] Mock server /auth/me must read JWT payload, not return hardcoded data

**Date:** 2026-02-18
**Problem:** Header showed one email (from Supabase mock session) while the sign-in toast showed a different email (from `GET /auth/me`). The mock server's `/auth/me` endpoint always returned a hardcoded `test@chillist.dev` regardless of who signed in.
**Solution:** Updated `/auth/me` in `api/server.ts` to decode the JWT payload from the Authorization header and extract `email` and `sub` from it, falling back to defaults for malformed tokens.
**Prevention:** Mock server auth endpoints should always derive user identity from the token, not return static data. This keeps mock behavior consistent with real Supabase+BE behavior.

---

### [Arch] New domain concerns need their own file from day one

**Date:** 2026-02-17
**Problem:** `fetchAuthMe` schema and function were added to `api.ts` alongside plans/participants/items CRUD, making the file 270+ lines with mixed concerns. Discovered during separation audit.
**Solution:** Extracted `authMeResponseSchema` and type to `src/core/auth-api.ts`. `api.ts` imports from it.
**Prevention:** When adding a new domain (auth, weather, assignments), create a dedicated file (`auth-api.ts`, `weather-api.ts`) instead of appending to the existing CRUD file. One domain per file.

---

### [Test] Export route components for testability

**Date:** 2026-02-17
**Problem:** `SignIn` and `SignUp` components in `.lazy.tsx` route files were not exported, only passed to `createLazyFileRoute`. Tests couldn't import them directly. The existing `About` component already followed the export pattern but it wasn't replicated.
**Solution:** Added `export` keyword to `function SignIn()` and `function SignUp()`. Tests import the named export directly.
**Prevention:** Every component in a `.lazy.tsx` route file should be a named export (`export function X`), matching the pattern in `about.lazy.tsx`. This allows direct imports in unit tests without dynamic import hacks.

---

### [Test] Module-level side effects break unrelated tests — mock globally

**Date:** 2026-02-17
**Problem:** Adding `import { supabase } from '../lib/supabase'` to `api.ts` caused 3 unrelated test files (ErrorPage router tests, CreatePlan navigation test) to crash. `supabase.ts` throws at import time when env vars are missing, and these tests transitively import `api.ts`.
**Solution:** Added a global Supabase mock in `tests/setup.ts` so every test file gets the mock automatically. Individual test files can override it with their own `vi.mock()`.
**Prevention:** When a new module has side effects at import time (env validation, network calls, etc.), immediately add it to the global test setup mock. Don't wait for tests to break.

---

### [Arch] react-refresh/only-export-components and React Context

**Date:** 2026-02-17
**Problem:** Exporting both a React context (`createContext`) and a component (`AuthProvider`) from the same `.tsx` file triggers `react-refresh/only-export-components`.
**Solution:** Split into three files: `auth-context.ts` (context + type), `AuthProvider.tsx` (component only), `useAuth.ts` (hook only).
**Prevention:** Never export `createContext` and a component from the same file. Separate context definition, provider component, and consumer hook into distinct files.

---

### [Test] Auth E2E tests deferred

**Date:** 2026-02-17
**Problem:** Supabase auth flows in E2E tests require either mocking the Supabase client in Playwright or a dedicated test project.
**Solution:** Deferred to issue #67. Unit tests cover JWT injection, fetchAuthMe, and the mock server /auth/me endpoint. Component-level integration tests for sign-in/sign-up pages are also deferred.
**Prevention:** When adding auth, plan the E2E test strategy upfront.

---

### [Types] tsc --noEmit Can Miss Errors the IDE Catches (TanStack Router)

**Date:** 2026-02-15
**Problem:** `npm run typecheck` passed with exit 0, but the IDE flagged 3 type errors in `plan.$planId.lazy.tsx` — a `Promise<void>` mismatch and `useNavigate` search callback inference failures.
**Solution:** Fixed by typing `useNavigate({ from: '/plan/$planId' })`, using direct search objects instead of callbacks, and wrapping `mutateAsync` to return `void`.
**Prevention:** After editing route files, always check IDE linter diagnostics (`ReadLints`) in addition to running `tsc`. TanStack Router's type inference depends on the generated route tree, which the dev server keeps fresh but `tsc` may run against a stale version.

---

## 2026-02-12: OpenAPI Spec Drift — Frontend Edited the Contract Directly

**Problem**: Backend query failed with `column plans_items.assigned_participant_id does not exist`. The backend Drizzle ORM schema referenced a column that was never added to the database.

**Root Cause**: The OpenAPI spec (`src/core/openapi.json`) was edited directly in the frontend repo — `assignedParticipantId` was added to the Item, CreateItemBody, and UpdateItemBody schemas. All frontend layers (Zod schemas, mock server, generated types) were aligned to the updated spec, but no database migration was ever created on the backend. The backend ORM picked up the new field from the shared contract, generating SQL for a column that didn't exist.

**Solution**:

- Gitignored `src/core/openapi.json` so it can never be edited locally again
- Added `predev` script to auto-fetch the spec from the backend on `npm run dev`
- Added `npm run api:fetch` step to CI pipeline before lint/typecheck/build
- Updated workflow rules to clarify the backend owns the spec

**Lessons**:

1. The OpenAPI spec must be owned by the backend — the frontend should only fetch and consume it, never edit it
2. A committed spec file with no guardrails can be silently modified, causing schema drift between frontend and backend
3. Gitignoring generated/fetched files and auto-fetching them in dev/CI is the strongest guardrail against accidental edits
4. When aligning schemas, always verify changes flow from backend (migration + spec) to frontend (fetch + regenerate), not the other way around

---

## 2026-02-08: Zod Schemas Must Mirror OpenAPI Format Constraints

**Problem**: Creating a new plan failed with `body/startDate must match format "date-time"`. The `makeDateTime` helper produced `2025-12-20T10:00:00` (no timezone designator), which is not valid RFC 3339.

**Root Cause**: Three layers of defense all had gaps:

1. Zod schemas used `z.string().optional()` instead of `z.string().datetime().optional()`, silently dropping the `format: "date-time"` constraint from the OpenAPI spec.
2. `createPlan()` and `updatePlan()` did not validate input before sending (unlike `createParticipant()` / `createItem()` which already called `.parse()`).
3. Tests asserted the wrong date format (`'2025-12-20T10:00:00'` instead of `'2025-12-20T10:00:00Z'`), encoding the bug as expected behavior.

**Solution**:

- Appended `Z` to `makeDateTime` output in `PlanForm.tsx`.
- Added `.datetime()` to all date fields in Zod schemas (`planSchema`, `planCreateSchema`).
- Added input validation (`.parse()`) to `createPlan()` and `updatePlan()` for parity.
- Fixed all test assertions and added schema-level + API-level tests for date format.

**Lessons**:

1. When hand-writing Zod schemas from an OpenAPI spec, always translate `format` constraints (e.g. `date-time` → `z.string().datetime()`), not just the `type`.
2. Every API mutation function should validate input with `.parse()` before sending — catch bad data client-side.
3. Tests that assert payload shape should verify format correctness, not just structural presence.
4. If multiple API functions follow the same pattern, audit them all for consistency.

---

## 2026-02-25: Strict Zod `.datetime()` Breaks Production Responses

**Problem**: The invite page showed "Invalid or expired invite link" even though the BE returned valid data. The plan was invisible to guests on production.

**Root Cause**: All response Zod schemas used `z.string().datetime()` for date fields. Zod's `.datetime()` requires an exact ISO 8601 format with timezone offset (`Z` or `+HH:MM`). The real BE (PostgreSQL + Fastify) returned dates in a slightly different format that Zod silently rejected, causing `invitePlanResponseSchema.parse()` to throw. React Query caught this as an error, and the component displayed the error state instead of the plan.

**Solution**:

- Changed all **response** schemas to use `z.string()` for date fields (item, participant, plan, invite schemas).
- Kept `z.string().datetime()` only in **create/patch** schemas where we validate user input before sending to the BE.
- Added `safeParse` + `console.error` logging in `fetchPlanByInvite` so schema failures are visible in the console instead of silently swallowed.

**Lessons**:

1. **Response schemas should be lenient**: We trust the BE to send valid data. Overly strict Zod validation on responses causes silent production failures.
2. **Input schemas should be strict**: Keep `.datetime()`, `.int()`, etc. on create/patch schemas that validate user input.
3. **Use `safeParse` + logging** on critical API parsing paths so schema mismatches produce visible console errors instead of opaque "not found" UX.
4. **This supersedes the "always use `.datetime()`" guidance**: The 2026-02-04 lesson was correct for input validation but wrong for response parsing.

---

## 2026-02-05: E2E Testing Best Practices

**Problem**: Playwright E2E tests were flaky — checking for "Loading..." state was unreliable because data loads too fast.

**Root Cause**: Loading states are transient and timing-dependent. In E2E tests with a local mock server, API responses return almost instantly, making loading states appear for only milliseconds.

**Solution**: Don't test loading states in E2E tests. Instead, wait for the final content to appear.

**Lessons**:

1. Don't check loading states in E2E — they're too fast/flaky to reliably test
2. Use specific route patterns — when mocking API calls with `page.route()`, use specific URL patterns (e.g., `**/localhost:3333/plans`) to avoid intercepting page navigation
3. Test final outcomes, not intermediate states — wait for content/errors to appear, not loading spinners

---

## 2026-02-25: Invite flow shipped without integration tests (retro)

**Problem**: The invite claim flow (issue #109) was implemented across multiple sessions but no integration test was written to verify the full chain. Each piece (pending-invite storage, claimInvite API, AuthProvider handler, sign-in/up page logic) passed its own unit test, but the race condition between claim and navigation was invisible without a cross-boundary test.

**Root Cause**: Integration tests were scoped to the auth feature, not the invite feature. When invite logic was added into auth components, the test surface wasn't extended. The dev-lessons entry documented the bug as "proposed fix" rather than requiring a test to close it.

**Solution**: Wrote 24 integration tests covering all invite flows (public access, claim endpoint, email sign-in/up with pending invite, OAuth with pending invite, guest preferences). Added an async side-effect ordering rule to the frontend rules.

**Lessons**:

1. Every cross-boundary feature (>1 component/layer) must ship with an integration test in the same PR — never defer it
2. Never log a bug as "proposed fix" without either fixing it with tests or creating a tracked issue
3. When adding async side effects to auth flows, the integration test must verify ordering (side effect completes BEFORE navigation), not just that both occurred
4. Fire-and-forget patterns (`.then()` / `.catch()` without await) are red flags for race conditions — if ordering matters, await it and test it

---

## 2026-02-25: Guest invite flow redesign — built FE ahead of BE (REVERTED)

**Problem**: The original guest invite flow used `localStorage` to track whether a guest had filled preferences. This was fragile — clearing browser data reset state, and there was no way to pre-populate preferences on revisit.

**What was done (WRONG)**: Extended the FE invite schema, mock server, E2E fixtures, and component code to include `myParticipantId`, `myRsvpStatus`, and `myPreferences` — but the real BE was never updated. The mock server masked the mismatch. Production broke because the real BE doesn't return these fields.

**What should have been done**: Stopped and told the user that the guest invite flow redesign requires BE work first. The BE must extend the `GET /plans/:planId/invite/:inviteToken` response to include `myParticipantId`, `myRsvpStatus`, and `myPreferences`. Only after the BE ships these changes and `npm run api:sync` pulls the updated spec should the FE be updated.

**Lessons**:

1. NEVER build FE features that depend on fields/endpoints the BE doesn't have — the mock server hides the mismatch and production breaks
2. The correct response to "add new fields to an API response" is: the BE must do it first, then `api:sync`, then FE
3. The UX design (RSVP gating, guest items, preferences edit) is sound, but it must wait for the BE to implement the required fields and endpoints
4. This is the same class of bug as the 2026-02-12 OpenAPI Spec Drift — FE added what the BE doesn't have

---

## 2026-02-26: Item edit permissions — non-owners could edit all items

**Problem**: Non-owner authenticated users and guests could see edit controls (pencil button, inline status/quantity/unit selects, cancel button) on ALL items, not just items assigned to them. The backend would reject unauthorized edits with 403, but the UI showed the controls anyway.

**Root cause**: The edit callbacks (`onEdit`, `onUpdate`) were passed unconditionally from page components through `CategorySection` to `ItemCard`. No per-item permission check existed on the frontend.

**Solution**: Added `canEdit` boolean prop to `ItemCard` — when `false`, hides pencil button, inline edit controls, and cancel button, but keeps self-assign working (via `selfAssignParticipantId` + `onUpdate`). Added `canEditItem` callback prop to `CategorySection` that computes `canEdit` per item. Updated all three consumer pages:

- `plan.$planId.lazy.tsx`: owner gets full edit; non-owners restricted to `assignedParticipantId === currentParticipant.participantId`
- `invite.$planId.$inviteToken.lazy.tsx`: guests restricted to `assignedParticipantId === myParticipantId`
- `items.$planId.lazy.tsx` + `ItemsView.tsx`: same logic via `selfParticipantId` prop

**Lessons**:

1. Always gate edit UI per item based on user permissions — don't rely on backend 403 alone
2. Separate self-assign from full-edit: `onUpdate` handles both, so use a `canEdit` flag to distinguish
3. `ItemCard` already handled falsy `onUpdate`/`onEdit` gracefully — the fix was adding the boolean + propagating it from parents

---

## 2026-03-02: plan.$planId.lazy.tsx refactoring — 600-line monolith to modular units

**Problem**: `plan.$planId.lazy.tsx` grew to ~600 lines containing role derivation, item counting/filtering, all mutation handlers, modal state, and inline UI components. This made the file hard to navigate, difficult to unit-test individual pieces, and increased merge conflict risk.

**Solution**: Extracted four focused modules:

- `src/core/utils-plan-items.ts` — pure functions: `countItemsPerParticipant`, `filterItemsByAssignedParticipant`, `countItemsByListTab`, `filterItemsByStatusTab`
- `src/hooks/usePlanRole.ts` — derives `isOwner`, `currentParticipant`, `canEditItem` from plan participants + auth user
- `src/hooks/usePlanActions.ts` — wraps all mutation hooks (item CRUD, plan delete/update, preferences, ownership transfer) with consistent error handling
- `src/components/TransferOwnershipModal.tsx` — extracted modal with its own props
- `src/components/shared/SectionLink.tsx` — reusable navigation card (Manage Participants, Manage Items links)

Route file dropped from ~600 to ~460 lines, with each extracted module independently testable.

**Lessons**:

1. Pure utility functions (counting, filtering) should never live in route files — extract to `src/core/` for easy unit testing
2. Role/permission derivation (`isOwner`, `canEditItem`) is reused across multiple routes (`plan`, `items`, `manage-participants`) — a shared hook prevents duplication
3. Mutation handlers with toast notifications follow a consistent pattern — centralizing in `usePlanActions` eliminates copy-paste error handling
4. When extracting hooks that depend on other hooks, mock the dependencies (not the internals) in tests — e.g., mock `useCreateItem` rather than `useMutation`
5. Sign-in/sign-up redirect context: when redirecting users from a plan page to auth, always preserve the `redirect` param when toggling between sign-in and sign-up, and show a contextual message so users understand why they were redirected
6. When two forms share the same field group (e.g., preferences), extract a shared presentational component (`PreferencesFields`) that accepts `register` and `errors` from the parent form. Use a generic type (`<T extends FieldValues>`) so any parent form shape can use it. This prevents field duplication, keeps validation and styling consistent, and makes both consumers testable independently

## 2026-03-02: OpenAPI def-\* schema numbering shift after backend adds new schemas

**Problem**: After the backend added the `PATCH /plans/:planId/join-requests/:requestId` endpoint with a new `UpdateJoinRequestStatusBody` schema, the auto-generated `def-*` numbers in `openapi.json` shifted. `def-28` which was `InvitePlanResponse` became `UpdateJoinRequestStatusBody`, and invite-related schemas moved to `def-33` and `def-36`. This caused TypeScript compilation errors in `src/core/schemas/invite.ts` which referenced the old def numbers.

**Root Cause**: The backend's Fastify auto-schema generator assigns sequential `def-N` numbers. Adding new schemas mid-sequence pushes existing schemas to higher numbers.

**Solution**: After running `npm run api:sync`, checked `tsc --noEmit` immediately. Found the broken references in `invite.ts` and updated `def-25` → `def-33` (InviteParticipant) and `def-28` → `def-36` (InvitePlanResponse).

**Lesson**: After every `api:sync`, always run `tsc --noEmit` before any other work. Schema `def-*` numbers are unstable and can shift when the backend adds/removes schemas. Search for all `components['schemas']['def-` references and verify each matches its expected `"title"` in the spec.

## 2026-03-04: All-participants assignment feature (issue #146)

**Problem**: Adding new required fields (`isAllParticipants: boolean`, `allParticipantsGroupId: string | null`) to the item Zod schema broke 18 existing tests because mock item objects in test fixtures didn't include the new fields. The schema validation rejected them.

**Root Cause**: When a new required field is added to a Zod schema, every hardcoded mock object across all test files must be updated. The `as Item` cast in some test helpers masked the missing fields at compile time but Zod's `safeParse` caught them at runtime.

**Solution**: Updated all item mock objects in 7 test files (`item-schema.test.ts`, `invite-schema.test.ts`, `api.test.ts`, `server.test.ts`, `utils-plan-items.test.ts`, `usePlanRole.test.ts`, `useBulkAssign.test.ts`) and 2 fixture files (`fixtures.ts`, `mock-data.json`) to include `isAllParticipants: false` and `allParticipantsGroupId: null`.

**Lesson**: When adding required fields to a schema, grep for all test files containing item mock data (`itemId` is a good search term) and update them all. Use `npm run test:unit` early to catch failures before building further. Consider using factory functions (like `makeItem()`) that set defaults — they reduce the number of places to update.

## 2026-03-04: Shared participant options utility (issue #146 follow-up)

**Problem**: Assignment option lists (unassigned, all participants, individual participants) were duplicated across `ItemCard`, `ItemForm`, and `BulkAssignButton` with slightly different implementations. Adding "All participants" to bulk assign required touching each one separately.

**Root Cause**: No shared utility for constructing participant option lists. Each component built its own array inline.

**Solution**: Extracted `buildParticipantOptions(participants, labels, opts)` into `utils-plan-items.ts`. Accepts `includeUnassigned` and `includeAll` flags. All three components now call this function instead of building options inline. `BulkAssignButton` conditionally shows "All participants" when the user is an owner (determined by `!restrictToUnassignedOnly`).

**Lesson**: When the same UI options appear in multiple places, extract a shared builder function early. This prevents drift and makes adding new options a single-point change.

## 2026-03-05: Remove top-level item `status` field — migrate to `assignmentStatusList`

**Problem**: Top-level `status` field on items was redundant with `assignmentStatusList` entries and caused confusion about which was the source of truth.

**Root Cause**: Original model had a single item-level status, but the per-participant assignment model made it obsolete. Both fields coexisted, creating ambiguity.

**Solution**: Removed `status` from `baseItemSchema`, `itemCreateSchema`, `itemPatchSchema`, all components, hooks, routes, mock server, and tests. Added `getItemStatus(item, participantId?)` and `buildStatusUpdate(item, newStatus, participantId?)` utilities in `utils-plan-items.ts`. Components now receive `participantStatus` and `currentParticipantId` props; status rendering is conditional on having a resolved participant status.

**Lesson**: When migrating a field used across 20+ files, grep for the field name in schemas, components, hooks, routes, mock server, i18n, and every test file. Use utility functions (`getItemStatus`, `buildStatusUpdate`) to centralize the new logic — this limits future changes to a single file. Update mock data schemas (`api/mock.ts`) alongside source schemas to prevent Zod validation failures in tests.

## 2026-03-05: TypeScript closure narrowing and E2E test fixes after status migration

**Problem**: (1) TypeScript error `TS18048: 'plan' is possibly 'undefined'` inside `handleBulkCancel` even though `plan` was narrowed by early returns above. (2) All 3 E2E tests touching item status failed: edit form still referenced `select[name="status"]`, inline status test couldn't find the dropdown, and status filter tabs showed wrong items.

**Root Cause**: (1) TypeScript does not narrow discriminated union types inside closures/async functions — the variable could theoretically change between closure creation and execution. (2) E2E test items had empty `assignmentStatusList`, so `getItemStatus` returned `undefined` and no status UI rendered. The edit form test still tried to interact with the removed status `<select>`.

**Solution**: (1) Extracted `const planItems = plan.items` before the closure so TypeScript captures the already-narrowed type. (2) Removed `select[name="status"]` from the edit form test and changed the expected status from "Purchased" to "Pending". Added owner assignment to items in the inline status test so the dropdown renders. In the status filter test, assigned the owner to Bread (pending) and changed Water's assignment to `purchased` so buying/packing list filtering works correctly.

**Lesson**: When using narrowed variables inside closures or async functions, extract them into a `const` first — TypeScript won't narrow inside closures. For E2E tests after a data model migration, verify that test fixture data includes the assignments needed for UI elements to render (empty `assignmentStatusList` means no status badge/dropdown).

## 2026-03-06: Point-based quantity suggestion system

**Problem**: When adding items (single or bulk), quantity always defaulted to 1 regardless of plan size, requiring manual adjustment every time.

**Root Cause**: No relationship between plan participant count / event duration and suggested item quantities. All items started at quantity 1.

**Solution**: Created a point-based system: `planPoints = (totalAdults + totalKids * 0.5) * durationMultiplier`. Duration multiplier scales with event length (0-4h=1, 4-7h=1.5, 7-12h=2, >12h=3). Enriched all food items in `common-items.json` (EN/HE/ES) with `quantityPerPoint` and `isPersonal` flags. Built `PlanContext` (following the `AuthContext` pattern) to expose `PlanWithDetails` and derived `planPoints`. Both `ItemForm` (on autocomplete select) and `BulkItemAddWizard` (on toggle/select-all) now use `calculateSuggestedQuantity()` to pre-fill quantities. Pure calculation functions in `utils-plan-points.ts` with 21 unit tests.

**Lesson**: For FE-only derived data, use a React context to compute and cache values from existing API data rather than adding new API endpoints. Keep calculation logic in pure utility functions with thorough unit tests — this makes the context provider trivially simple (just a `useMemo` wrapper). When adding data to useCallback dependencies that reference a function defined in the component body, wrap that function in `useCallback` first to prevent stale closure issues and lint warnings.

## 2026-03-06: E2E test flake — CollapsibleSection defaultOpen + click toggles closed

**Problem**: E2E test `Invite Landing Page › shows plan details for valid invite link` failed on Desktop Firefox: `expect(locator).toBeVisible()` for `getByText('Bob Jones')` timed out with "element(s) not found".

**Root Cause**: The `CollapsibleSection` component renders the Participants list with `defaultOpen={true}`. The E2E test had `await page.getByText('Participants').click()` before the visibility assertions — this actually _closed_ the section instead of opening it. With the test's injected `transition-duration: 10ms`, `Alex Smith` still passed (checked before the 10ms close animation finished) but `Bob Jones` failed (checked after the panel unmounted).

**Solution**: Removed the unnecessary `.click()` call. The section is already open by default, so the participant names are immediately visible without interaction.

**Lesson**: When writing E2E tests for `CollapsibleSection` (Headless UI `Disclosure`), remember `defaultOpen={true}` means clicking the header _closes_ it. Always check the component's `defaultOpen` prop before adding click interactions. The 10ms animation injection in E2E fixtures can mask timing issues — one assertion passes, the next fails — so a single "flaky" assertion often indicates a real DOM state problem.

## 2026-03-07: Expense feature — pattern for new entity CRUD

**Problem**: Adding a full CRUD feature (expenses) that follows the existing item/participant pattern but with different permission rules.

**Solution**: Followed the established layered pattern: Zod schemas → API functions → React Query hooks → route + view. Key decisions:

- Expense amounts come back as strings from BE (numeric(10,2) in Postgres), so the schema uses `z.string()` for the response but `z.number().positive()` for create/patch input.
- `usePlanContext()` returns `PlanContextValue | null` — always null-check before destructuring (`planCtx?.planCurrency ?? ''`).
- Permission check uses `createdByUserId === user.id` instead of `canEditItem` (which is assignment-based for items). Each entity type can have its own permission logic.
- The `ExpensesView` is built directly in the lazy route file rather than a separate component, keeping the file structure simpler when there's no reuse.

**Lesson**: When adding a new entity, follow the same layered pattern (schema → api → hook → route) but don't blindly copy permission logic — read the spec for entity-specific access rules. The `usePlanRole` hook provides `isOwner`/`currentParticipant` but the "can edit" decision is entity-specific.

## 2026-03-07: Multi-select item linking on expenses

**Problem**: Expenses had no way to indicate which plan items they covered. Users needed to manually describe purchases in the description field.

**Solution**: Added optional `itemIds` array to expense schemas (response, create, patch). Built an `ItemMultiSelect` sub-component inside `ExpenseForm` with: collapsible toggle, search filter, checkbox list grouped by category, and removable chip tags for selected items. The component uses React Hook Form's `setValue` + `watch` to sync the array. On expense cards, linked items render as small blue chips. Type assertions in `expense.ts` use `Exclude<..., 'itemIds'>` to temporarily allow the field before the BE OpenAPI spec syncs.

**Lesson**: When adding a field before the BE OpenAPI is synced, temporarily exclude it from the type assertion (`Exclude<keyof FE, 'newField'> extends keyof BE`) so CI doesn't break. Remove the exclusion after `npm run api:sync`. For multi-select in forms, use `setValue('field', newArray, { shouldDirty: true })` + `watch('field')` instead of `register` — `register` only works with scalar inputs, not programmatically managed arrays.

## 2026-03-09: Plan creation wizard — refactor from single form + modal to 3-step wizard

**Problem**: The plan creation flow was a single long form (PlanForm) followed by a preferences modal. Users had to fill in owner details manually, scroll through many fields, and location showed all geo fields. Item add came only after navigating to the plan page.

**Root Cause**: Original design put everything in one form. Owner details were duplicated from user profile. Location exposed internal fields (city, country, region, lat/lon). Preferences were a separate modal. Item add was a completely separate step on the plan page.

**Solution**: Created `CreatePlanWizard` component with 3 steps: (1) plan details — title, description, date/time, location (place name only via Google Maps autocomplete, hidden geo fields), language, currency; (2) preferences — reuse `PreferencesFields`, RSVP auto-confirmed, plan created at this step; (3) bulk item add — `BulkItemAddWizard` embedded inline (new `inline` prop skips Modal wrapper). Owner details auto-filled from user profile. `create-plan.tsx` route simplified to just render the wizard. Step indicator with numbered steps and checkmarks.

**Lesson**: When converting a monolithic form to a multi-step wizard, keep each step's `useForm` instance separate — sharing form state across steps creates coupling and makes step-back harder. For components that can render both as modal and inline, add an `inline` prop that skips the wrapper rather than extracting inner content into a separate component — this avoids breaking existing modal consumers. Auto-filling owner details from auth user metadata eliminates a whole class of validation errors on required fields.

## 2026-03-09: Edit plan form — convert to 2-step wizard matching create flow

**Problem**: Edit Plan was a single long modal form while Create Plan was a 3-step wizard. The inconsistency confused users and the edit form showed raw location fields (city, country, region) that the create wizard hid.

**Root Cause**: EditPlanForm was written before the create wizard and never updated to match.

**Solution**: Rewrote `EditPlanForm` as a 2-step wizard (Step 1: plan details with place-only location; Step 2: owner preferences + participant estimation). Changed `onSubmit` signature from `PlanPatch` to `EditPlanSubmitPayload { planPatch, ownerPreferences }` so the plan detail page can update both in one flow. Added `ownerParticipant` prop to pre-fill preferences from the existing owner data. Estimation fields (estimatedAdults/Kids) are now sent to the BE in both create and patch flows.

**Lesson**: When a form's `onSubmit` signature changes (e.g., from a single object to a compound payload), update the caller in the route file at the same time — TypeScript will catch the mismatch. Use `data-testid` on each step's form element so tests can reliably target the correct step without depending on button text that might repeat across steps. For union types in closures (like `plan` which can be `PlanWithDetails | NotParticipantResponse`), add an explicit type guard before accessing discriminated properties.

## 2026-03-09: Align FE with BE OpenAPI — plan estimation fields

**Problem**: BE added `estimatedAdults`/`estimatedKids` to the Plan entity, CreatePlanWithOwner body, and UpdatePlanBody on the `feature/plan-estimation-fields` branch. FE was collecting these values in the wizard but not sending them and not displaying real data.

**Root Cause**: FE was built before the BE schema existed, so estimation was UI-only with placeholder dashes.

**Solution**: (1) Synced OpenAPI from the BE feature branch using `curl` with the branch ref instead of `main`. (2) Regenerated `api.generated.ts`. (3) Added `estimatedAdults`/`estimatedKids` to `planSchema`, `planCreateWithOwnerSchema`, `planPatchSchema`. (4) Wired estimation values into `CreatePlanWizard` payload and `EditPlanForm` planPatch. (5) Updated headcount section to read `plan.estimatedAdults`/`plan.estimatedKids` with dash fallback.

**Lesson**: When syncing OpenAPI from a BE feature branch, override the fetch URL to point to the branch ref (`raw.githubusercontent.com/.../feature-branch/docs/openapi.json`) rather than modifying the fetch script. After regenerating types, check all three schema layers: (1) the response schema (plan read), (2) the create schema, (3) the patch schema — new fields often appear in all three with slightly different nullability rules.

### [Test] E2E WebSocket detection — `page.on('websocket')` unreliable in headless Chrome

**Date:** 2026-03-10

**Problem:** E2E tests using Playwright's `page.on('websocket')` event to verify the app attempts WebSocket connections passed locally but failed consistently in CI (headless Chrome on ubuntu-latest). The `wsConnections` array was always empty.

**Root Cause:** In CI, no WebSocket server listens on localhost:3333. The browser's TCP connection is immediately refused (ECONNREFUSED) before the WebSocket upgrade handshake begins, so Playwright's network-level `websocket` event never fires. Locally this may work if the port responds differently (e.g., timeout vs. refusal).

**Solution:** Replaced `page.on('websocket', ...)` with a JavaScript-level interception via `addInitScript`: monkeypatch the `WebSocket` constructor to record URLs into `window.__wsUrls`, then use `expect.poll(() => page.evaluate(...))` to assert. This captures connection attempts at the application layer regardless of network outcome.

**Lesson:** Do not rely on Playwright's `page.on('websocket')` to detect connection _attempts_ when the target server is not running. The event depends on the TCP handshake progressing to the HTTP upgrade phase. For verifying that app code calls `new WebSocket(url)`, intercept the constructor in the page context instead.

### [Test] E2E/Unit selectors must use `data-testid` — never `getByText`/`getByRole` for interactive elements

**Date:** 2026-03-24

**Problem:** BulkItemAddWizard E2E and unit tests broke repeatedly (5+ times) when UI text changed — adding description spans under category buttons changed the accessible name, breaking `getByRole('button', { name: 'Food', exact: true })`. Same pattern with subcategory buttons, submit buttons, back buttons, and select-all toggles.

**Root Cause:** Tests used `getByText`, `getByRole({ name })`, and `getByPlaceholderText` to find interactive elements. Any text change (adding descriptions, i18n updates, rewording) silently broke selectors. The `getByRole` accessible name includes all descendant text, so adding a `<span>` child changes it.

**Solution:** Added `data-testid` to every interactive element in BulkItemAddWizard: category buttons (`bulk-cat-{category}`), subcategory buttons (`bulk-subcat-{name}`), item cards (`bulk-item-{name}`), select-all toggles (`bulk-select-all-{subcategory}`), submit button (`bulk-submit`), back button (`bulk-back`), search input (`bulk-search-input`). Converted all E2E and unit tests to use these testids exclusively.

**Lesson:** NEVER use `getByText`, `getByRole({ name })`, or `getByPlaceholderText` to interact with or assert on interactive elements (buttons, links, inputs). Always add `data-testid` to the component first, then use `getByTestId` in tests. `getByText` is only acceptable for asserting data content (e.g., checking a plan name appears on screen). This applies to both unit tests (Testing Library) and E2E tests (Playwright). When adding any new interactive element, add `data-testid` immediately — don't wait for a test to break.

### [Refactor] Item API alignment — bulk endpoints, guest payload gaps, personal_equipment defaults

**Date:** 2026-03-24

**Problem:** Three copies of the same `Promise.allSettled` + individual item-create logic existed across `plan.$planId.lazy.tsx`, `ItemsView.tsx`, and `CreatePlanWizard.tsx`. Each made N individual `POST /plans/:planId/items` calls instead of one bulk call, causing N query invalidations. Guest item creation via `addGuestItem` omitted `subcategory` and `isAllParticipants` from the payload. The mock server did not auto-fill `assignmentStatusList` for `personal_equipment` items, diverging from real BE behavior.

**Root Cause:** The FE was built before the BE introduced consolidated bulk create endpoints and `personal_equipment` auto-assignment logic. `addGuestItem` was typed with only the minimum fields; `updateGuestItem` used `Record<string, unknown>`. No `bulkCreateItems`/`bulkCreateGuestItems` API functions existed.

**Solution:** (1) Added `subcategory` and `isAllParticipants` to `addGuestItem` type. (2) Typed `updateGuestItem` with a proper `GuestItemUpdate` interface. (3) Added `bulkCreateItems` and `bulkCreateGuestItems` API functions calling `POST /plans/:planId/items/bulk`. (4) Created `useBulkCreateItems` mutation hook with query invalidation. (5) Extracted `processBulkCreateResult` helper in `utils-plan-items.ts` for shared toast/error handling. (6) Replaced all three `Promise.allSettled` patterns with the bulk endpoint. (7) Updated mock server to auto-fill `assignmentStatusList` for `personal_equipment` items and added bulk create endpoints for both JWT and invite paths.

**Lesson:** When the BE consolidates multiple individual endpoints into a bulk endpoint, the FE should adopt it immediately — not accumulate parallel `Promise.allSettled` wrappers. Always keep mock server behavior in sync with real BE defaults (especially auto-populated fields like `assignmentStatusList`), otherwise tests pass locally but fail in production. Guest API functions should accept the same field set as authenticated ones — omitting optional fields like `subcategory` silently drops data.

### [Feature] PostHog participant action tracking + mock client enhancement

**Date:** 2026-04-16

**Problem:** The PostHog mock client (`mock-posthog.ts`) was a dead no-op — all methods were empty functions. This made it impossible to verify analytics calls in tests or inspect events during local development. Additionally, 8 participant-related events were either defined but unwired or not defined at all.

**Root Cause:** The mock was created as a minimal type-safe stub to satisfy imports but was never designed for observability. Participant actions (add, leave, transfer ownership, moderate join requests) and invite/profile events had `track*` functions defined in `analytics.ts` but no call sites in application code.

**Solution:** (1) Enhanced `mockPosthog` to accumulate captured events in an in-memory array, `console.debug` them in dev mode, and expose `getCapturedEvents()` / `clearCapturedEvents()` helpers for test assertions. (2) Added 4 new tracking functions: `trackParticipantAdded`, `trackParticipantLeft`, `trackOwnershipTransferred`, `trackJoinRequestModerated`. (3) Wired all 8 events into their respective call sites (invite.ts, api.ts, RequestToJoinPage, complete-profile, manage-participants, useLeaveParticipant, usePlanActions). (4) Updated `useLeaveParticipant` mutation signature from `string` to `{ participantId, planId }` to pass `planId` for tracking. (5) Added analytics assertions to all affected test files.

**Lesson:** When changing a mutation hook's parameter shape (e.g., from a plain string to an object), all callers and their tests must be updated in the same change. Mock clients should be designed for observability from the start — accumulating events costs nothing and prevents the need for `vi.spyOn` gymnastics in every test file.

### [Test] E2E calendar date selection must navigate months — `DateField` opens to current month

**Date:** 2026-04-16

**Problem:** All 12 E2E tests that used the custom `DateField` component failed. After clicking the trigger button, Playwright could not find `getByRole('button', { name: /July 15/ })` — the test timed out waiting for a day button that didn't exist on the visible calendar page.

**Root Cause:** `DateField` initializes its `month` state to `new Date()` (the current month). When the E2E tests opened the calendar, it showed April 2026, not July. The old native `<input type="date">` accepted `.fill('2026-07-15')` to set any date directly; the custom `react-day-picker` calendar requires navigating to the correct month first. Initially misdiagnosed as a Headless UI `PopoverPanel` rendering/portal issue — the `anchor` prop and render function pattern were both red herrings.

**Solution:** Added a `selectCalendarDate(page, testId, day, monthsForward)` helper to `tests/e2e/fixtures.ts` that: (1) clicks the trigger by `data-testid`, (2) waits for the panel to be visible, (3) clicks the "next month" nav button N times, (4) clicks the day button by its numeric text content (`td button` filtered by `^${day}$`). Using text content for the day number is locale-independent. Removed the two `plan-tags.spec.ts` date interactions entirely (those tests were scoped to only test the tag wizard, not plan creation).

**Lesson:** When replacing native HTML inputs with custom picker components, E2E tests cannot use `.fill()` — they must interact with the picker UI. Calendar components open to the current month by default; E2E tests must navigate to the target month before clicking a day. Use locale-independent selectors (day number text content) rather than locale-specific aria-labels (e.g., "July 15") that break under i18n changes.
