# Chatbot Dev Lessons

A three-section log for `chillist-whatsapp-bot`: **wins** (strategies that worked), **bugs** (problems fixed), and **decisions** (architecture, config, and integration choices). Read all sections before starting any chatbot task.

> **Goal:** This file is the primary knowledge asset for building the *next* WhatsApp bot. Every non-obvious choice made during development should be recorded here so the next project starts with the full context of this one.

_(Seeded with relevant lessons from `dev-lessons/backend.md`. Only add NEW lessons here.)_

---

## Decisions

Architecture, config, and integration choices made during development — the "why we built it this way" record. Add a `[Decision]` entry whenever you make a non-obvious design choice, pick one approach over another, or discover an important integration constraint.

<!-- Add new Decision entries at the top of this section -->

### [Decision] Create-plan flow: immediate creation + owner preferences + soft items wording

**Date:** 2026-04-24
**Context:** User testing showed the create-plan flow had three issues: (1) bot asked for dates/location before creating, which felt slow; (2) after creating, bot pushed users to "use the app" too aggressively; (3) owner's RSVP and preferences weren't collected despite the plan creator obviously attending.
**Decision:** Changed the create-plan flow to: (1) create immediately when user provides a title — do not wait for dates/location; (2) before calling createPlan, briefly ask about group size (adults/kids) and dietary preferences (optional); (3) always set `ownerPreferences.rsvpStatus: "confirmed"` — the creator is coming; (4) after creation, share the plan link and offer to add dates/location; (5) when user asks about adding items (out of v1 scope), say "You can add items on the plan page" with the link — soft wording, no "use the app" phrasing. Extended `POST /api/internal/plans` to accept optional `ownerPreferences` object (BE issue #207).
**Reason:** Faster flow for users (plan exists immediately), better data capture (owner prefs at creation), softer UX (no app-pushing).
**Reuse tip:** When collecting user data via chat, prefer atomic operations (collect → create in one tool call) over multi-step flows that require the user to wait.

### [Decision] Context-aware URL emission for WhatsApp (plan, items, expenses, create-plan)

**Date:** 2026-04-23
**Context:** Users needed tappable deep links, not just the site origin; packing vs buying lists and expenses have distinct FE routes.
**Decision:** Centralize rules in `system-prompt.ts` under `## URL rules`: `{feBaseUrl}/create-plan` for empty plans and createPlan errors; `{feBaseUrl}/plan/<id>` after createPlan success; `{feBaseUrl}/items/<id>?list=packing|buying` (or bare `/items/<id>` when generic); `{feBaseUrl}/expenses/<planId>` after expense writes; `{feBaseUrl}/plans` when no plan id is known. Removed `getPlanTags` from the model tool set; `createPlan` no longer accepts `tags`. Welcome copy includes `/create-plan` via `feBaseUrl` from the handler. Quality tests strip approved URL-shaped UUIDs before asserting no bare UUID leaks.
**Reason:** One prompt section keeps behavior consistent; matches FE routes (`/plan`, `/items`, `/expenses`, `/create-plan`).
**Reuse tip:** When adding a new user-facing app surface, add a row to URL rules and a gated conversation-quality assertion.

### [Decision] Stabilize create-plan replies: sanitize bare UUIDs + force createPlan on completion turn

**Date:** 2026-04-21
**Context:** Conversation-quality runs intermittently failed: the model pasted raw plan UUIDs outside the `/plan/` link, and on two-turn flows it confirmed date/location without calling `createPlan`, so replies lacked `/plan/`.
**Decision:** (1) Post-process assistant text with `sanitizeAssistantReply` so UUID-shaped tokens are removed unless they appear only inside `{feBaseUrl}/plan/<uuid>`. (2) When message history matches “user started create-plan → assistant asked for date/location → user answered”, append a short completion directive to the system prompt and set `prepareStep` `toolChoice` to `{ type: 'tool', toolName: 'createPlan' }` on step 0. (3) Same forced tool + directive when the user corrects the date right after a reply that already included a `/plan/` link (`buildPlanDateCorrectionDirective`). (4) Prompt + tool copy: do not call `createPlan` on the first turn if the user only gave a title — ask for date/location first. (5) Quality tests: assert `createPlan` in relevant turns and exactly one UUID in replies that include `/plan/`.
**Reason:** Prompt-only fixes are insufficient under real LLM variance; deterministic sanitization fixes UX and assertions; forced tool choice on a narrowly detected completion turn fixes the missing-tool flake without affecting other flows.
**Reuse tip:** Track regressions in GitHub — e.g. [chillist-whatsapp-bot#33](https://github.com/Alexgub84/chillist-whatsapp-bot/issues/33).

### [Decision] Conversational create-plan: title, date, location only — no tag wizard in chat

**Date:** 2026-04-21
**Context:** Users can create plans from WhatsApp; the web wizard has a heavy tag taxonomy. Asking for tags in chat duplicates UX and confuses the model.
**Decision:** System prompt + `createPlan` tool description require collecting only title, optional dates, and optional location. Do not call `getPlanTags` in the default create-plan flow. Tags may be derived from free text later. Participants are out of scope for the same iteration.
**Reason:** Smaller surface area, fewer tool calls, clearer success criteria; matches MVP chat flow.
**Reuse tip:** When adding new write tools, pair prompt rules with tool descriptions and add conversation-quality rows in the same commit.

### [Decision] Document two test tracks: default CI vs conversation quality

**Date:** 2026-04-21
**Context:** Developers conflated `npm test` (fakes, no prod services) with `npm run test:conversation-quality` (real LLM, still no Chillist prod BE and no WhatsApp). That led to confusion about "prod" and Green API.
**Decision:** In `guides/chatbot.md`, `rules/chatbot.md`, bot `README.md`, and the quality test file headers, state explicitly: default suite never uses production backend or WhatsApp; conversation quality uses the real LLM provider only to judge prompts/tools, with `FakeInternalApiClient` and no Green API.
**Reason:** The quality suite is a prompt regression harness, not an integration test against deployed infrastructure.
**Reuse tip:** Any new opt-in suite that calls paid APIs should get the same two-column table: what touches prod vs what stays fake.

### [Decision] Resolve bilingual labels in the tool layer, not in the AI prompt

**Date:** 2026-04-14
**Context:** The `GET /api/internal/plan-tags` endpoint returns the full taxonomy with every label as `{ en, he }`. The AI model needs a single-language view — passing bilingual objects would double the payload, require the model to reason about language selection, and risk it picking the wrong language.
**Decision:** The `getPlanTags` tool resolves all bilingual labels to a single string before returning the result to the model. A `resolveTagsForLang(tags, lang)` helper in `tools.ts` walks the full taxonomy structure (tier1, universal_flags, tier2_axes, tier3, item_generation_bundles) and replaces every `{ en, he }` with the appropriate string. `ctx.lang ?? "en"` is the fallback. Option `id` values and structural metadata (select, shown_for_tier1, defaults_by_tier1, contradictions, etc.) are preserved unchanged.
**Reason:** The tool layer is the right place for this translation: it keeps the AI prompt shorter, eliminates a class of model reasoning errors (wrong language), and is fully testable with fixed fixtures.
**Reuse tip:** Any tool that fetches bilingual data should resolve to one language before returning. Pass `ctx.lang ?? "en"` as the resolution key. `item_generation_bundles` items are `{ en, he }` directly (no `label` wrapper) — handle them separately from option objects.

### [Decision] maxRetries bumped to 4 for Anthropic API calls (5 total attempts)

**Date:** 2026-04-09
**Context:** In production, the Anthropic API returned HTTP 529 "Overloaded" on a `getPlanDetails` follow-up turn. The AI SDK default `maxRetries: 2` (3 total attempts) exhausted within ~20s. The user manually said "try again" 3 seconds later and it worked — the overload was transient.
**Decision:** Set `maxRetries: 4` (5 total attempts) as the default in `ai.client.ts`. Made it configurable via `AiGenerateParams.maxRetries` so tests can override. Rejected alternatives: (a) app-level retry in engine.ts — duplicates SDK logic; (b) provider fallback to OpenAI — adds complexity, different model behavior, and a second API key dependency.
**Reason:** The AI SDK already implements exponential backoff for retryable errors (429, 529). Two extra attempts add ~10-15s of backoff window, which covers the typical Anthropic overload burst. Cost is negligible (failed attempts consume no tokens).
**Reuse tip:** Always set `maxRetries: 4` on `generateText()` for production AI calls. The SDK default of 2 is too low for services with transient capacity spikes.

### [Decision] Railway log-fetching script for WhatsApp bot service

**Date:** 2026-04-09
**Context:** Debugging production issues required manually running `railway logs` with ad-hoc flags. The backend (`chillist-be`) already had `scripts/fetch-railway-logs.sh` + `npm run railway:logs` + a Cursor rule. The WhatsApp bot had nothing.
**Decision:** Ported the same three-part setup: `scripts/fetch-railway-logs.sh`, `npm run railway:logs` script in `package.json`, and `.cursor/rules/production-logs.mdc`. The Railway CLI is linked to service `chillist-whatsapp-chatbot` in the `chillist-be` Railway project.
**Reason:** Consistent debugging workflow across both services. The Cursor rule ensures the AI agent fetches logs first when asked to debug production issues.
**Reuse tip:** Every Railway-deployed service should have this three-part setup from day one: fetch script, npm script, and Cursor rule.

### [Decision] Multi-turn edge-case tests use explicit planContextStore seeding

**Date:** 2026-04-09
**Context:** Scenarios #13 (undo), #14 (typo), #16 (already done), #18 (bulk items) all need a second turn that depends on plan context from T1. T1 tool-call patterns are non-deterministic — the model may call `getPlanDetails` via different paths (direct, auto-fetch, or from cache).
**Decision:** Seed `planContextStore.setActivePlan()` explicitly between T1 and T2 instead of relying on T1's side effects. This matches the pattern established in the "short messages" scenario.
**Reason:** Decouples T2 assertions from T1's stochastic behavior. Even if T1 takes a different tool path on retry, T2 always has correct context.
**Reuse tip:** Any multi-turn quality test where T2 needs plan context should seed explicitly between turns.

### [Decision] Quality tests use temperature=0 and retry=2 to absorb LLM non-determinism

**Date:** 2026-04-09
**Context:** Quality tests assert deterministic tool-call patterns against a live LLM API. Even verbose, explicit messages like "Mark the Tent as done on my Camping Trip" intermittently returned empty tool calls — 5/17 tests failed in one run, different tests each time. Patching individual assertions after each failure created an endless change loop.
**Decision:** (1) Pass `temperature: 0` through `AiGenerateParams` → `generateText()` to maximize determinism. (2) Add `retry: 2` to every `it()` block via Vitest's per-test retry option. Production code is unaffected — temperature is optional and defaults to provider default. Alternative considered: semantic evaluation (LLM-as-judge) — deferred as Tier 2 if retry+temp0 proves insufficient.
**Reason:** Industry best practice (Advisor360, Iterathon 2026): "You can't assert your way out of non-determinism." Temperature=0 reduces variance; retry absorbs the remaining ~5-15% that greedy decoding cannot eliminate (MoE routing, probability ties). Together they broke the change loop without weakening any assertions.
**Reuse tip:** For any test suite that calls a real LLM: always set temperature=0 and add retry=2-3. Assert outcomes (correct tool, correct ID), not exact response text. Any scenario failing 3 consecutive retries at temperature=0 is a real regression.

### [Decision] Quality tests write real token usage to DB via tee logger

**Date:** 2026-04-09
**Context:** Quality tests use a real AI API and consume tokens, but the `FakeUsageLogger` meant that cost/usage data was silently discarded — there was no way to track quality-test spending over time.
**Decision:** When `DATABASE_URL_PUBLIC` is set in `.env`, quality tests use a tee logger (`createQualityLoggerSetup` in `report-helpers.ts`) that writes to both the in-memory fake (for assertion reads) and the real `chatbot_ai_usage` table. When `DATABASE_URL_PUBLIC` is absent, the fake-only path is used (CI-safe, no side effects). The `qt-` session ID prefix already in place makes these entries filterable: `SELECT * FROM chatbot_ai_usage WHERE session_id LIKE 'qt-%'`.
**Reason:** Allows tracking quality-test token costs over time without any schema changes. Uses `DATABASE_URL_PUBLIC` (the externally-accessible URL) rather than `DATABASE_URL` (Railway internal) so local runs can connect.
**Reuse tip:** Any test suite that uses real AI should follow the same pattern: `FakeLogger` for assertion reads, `tee(fake, real)` for persistence, and a `cleanup()` to close the DB connection in `afterAll`.

### [Decision] RUN_CONVERSATION_QUALITY gates real-model quality tests in the default test run

**Date:** 2026-04-09
**Context:** `prompt-quality.test.ts` and `prompt-quality-he.test.ts` ran whenever `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` was present in `.env`, including during `npm test` / `npm run test:unit` — slow and costly.
**Decision:** Suites use `runQuality = Boolean(process.env.RUN_CONVERSATION_QUALITY?.trim()) && hasRealApiKey` and `describeQuality = runQuality ? describe : describe.skip`. `npm run test:conversation-quality` prefixes the command with `RUN_CONVERSATION_QUALITY=true` and runs both EN and Hebrew files.
**Reason:** Opt-in at the command level; local dev can keep API keys in `.env` without accidentally running expensive tests on every suite.
**Reuse tip:** For any opt-in integration test that needs real credentials, pair an env flag with the credential check and set the flag only in a dedicated npm script.

### [Decision] Quality test assertions must match their own comments — no silent contradictions

**Date:** 2026-04-09
**Context:** The disambiguation quality test had a comment saying "trouble accessing is acceptable" but then asserted `expect(t2.replyText).toMatch(/2025/)` — which fails when the bot gives an error without naming the year. This caused consistent false negatives on a structurally limited scenario.
**Decision:** Assertions in quality tests must be consistent with their inline comments. If the comment says a class of response is acceptable, the assertion must not reject it. Comments that say "X is acceptable" are documentation of intent; the assertion is the law.
**Reason:** Contradictory comment + assertion erodes trust in the test suite — it fails on known-acceptable behavior, so developers start ignoring failures.
**Reuse tip:** Before writing a quality test assertion, write the comment first. Then write the assertion to match it. Never add a "technically stricter" assertion to a lenient comment.

### [Decision] Remove analyzeScenario tool-chain warnings when architecture changes the expected pattern

**Date:** 2026-04-09
**Context:** `report-helpers.ts` flagged `updateItemStatus without getPlanDetails` as a ⚠️ warning. After introducing the plan context store, calling `updateItemStatus` directly in T2 (without re-fetching plan details) became the correct and desired behavior. The warning became a false positive on every mark-done warm test.
**Decision:** Removed the `updateItemStatus without getPlanDetails` check from `analyzeScenario`. When the architecture changes what "correct" looks like, update the quality analysis logic to match.
**Reason:** False positive warnings in quality reports train developers to ignore the report entirely.
**Reuse tip:** Review all `analyzeScenario` checks after any architectural change to tool call patterns. Checks that encode assumptions about the old architecture must be updated or removed.

### [Decision] System prompt item name examples must be language-neutral

**Date:** 2026-04-09
**Context:** The `updateItemStatus` rule used `(e.g. "Tent")` as the example item name. For Hebrew plans, item names are in Hebrew (e.g. "אוהל"). An English-only example could cause the model to transliterate or translate item names before passing them to the tool, breaking the exact-match lookup in the plan context store.
**Decision:** Changed the example to "copy character-for-character, preserving original language". The tool description mirrors this.
**Reason:** The plan context store uses case-insensitive string equality to match item names. Any name transformation (translation, transliteration) causes lookup failure.
**Reuse tip:** Any time tool input is matched against stored data by string equality, make it explicit in the tool description and system prompt that the value must be copied verbatim, not paraphrased.

### [Decision] Session Plan Context Store — model never handles UUIDs

**Date:** 2026-04-09
**Context:** `updateItemStatus` required the model to pass a correct `itemId` UUID. In warm T2, tool results from T1 are not in message history — only the bot's text reply is. The model either hallucinated an ID or had to re-chain `getMyPlans → getPlanDetails` from scratch. Production failure: bot called `getPlanDetails` 7x with hallucinated IDs, never reaching `updateItemStatus`.
**Decision:** Introduce `IPlanContextStore` (in-memory `Map`, shared across requests). `getPlanDetails` saves the plan (id, name, items) on success. `updateItemStatus` input changes from `itemId: uuid` to `itemName: string`; the tool resolves name → ID from the store internally.
**Reason:** Eliminates the entire category of UUID hallucination bugs. The model works with human-readable names (which it handles reliably). ID resolution is deterministic and happens inside the tool, not in the model's chain-of-thought.
**Reuse tip:** For any write tool that needs a real ID: store the fetched parent object in a session context store keyed by session ID. Accept human-readable input in the tool schema and resolve to the ID inside `execute`. The model never touches UUIDs in tool arguments.

### [Decision] Positive-reframe phrasing over prohibition for tool-call constraints

**Date:** 2026-04-08
**Context:** The system prompt and tool description both had "do not call getMyPlans again" style rules. Conversation quality reports showed ~75% non-compliance across 4 runs and 3 multi-turn scenarios.
**Decision:** Replace all tool-call frequency constraints with positive-reframe phrasing ("reuse the plan IDs from the getMyPlans result already in this conversation") rather than negation ("do not call getMyPlans again").
**Reason:** Safety Adherence Benchmark (ICML 2025) showed positive-reframe achieves near-perfect compliance; NeQA benchmark confirmed negation compliance does NOT improve with model scale. Conditional allows ("only call X when Y") are second-best; hard prohibitions are worst.
**Reuse tip:** For any tool that should be called at most N times: lead with what to DO ("reuse the result from earlier"), then state the narrow condition for when the tool call IS legitimate. Never lead with "don't" or "never" as the primary frame.

### [Decision] Three-layer defense for critical tool-call frequency constraints

**Date:** 2026-04-08
**Context:** Layer 1 (prompt) alone achieves ~70–85% compliance at best. For tool calls that must never be redundant, prompt-only approaches are insufficient.
**Decision:** Apply three layers: (1) positive-reframe phrasing in both system prompt and tool description + few-shot example; (2) `prepareStep` callback in `engine.ts` to dynamically remove the tool from `activeTools` after first use within a turn; (3) execute guard inside `getMyPlans.execute` that returns `{ error: "..." }` if the SDK still calls it despite Layer 2.
**Reason:** AGENTIF benchmark (Tsinghua 2025) found even top models follow fewer than 30% of constraints perfectly. Architectural enforcement is needed as a deterministic backstop.
**Reuse tip:** `prepareStep` handles within-turn redundancy. Cross-turn redundancy (calling the tool again in a later message) is primarily handled by Layer 1 (prompt). A future improvement would be to include tool-call results in message history so `prepareStep` can detect cross-turn prior calls.

---

## Wins

Strategies, patterns, and decisions that worked well. Add a `[Win]` entry whenever a design choice, prompt, or approach is confirmed to work in practice.

<!-- Add new Win entries at the top of this section -->

### [Win] Flexible typo assertions avoid false failures from valid model behavior

**Date:** 2026-04-09
**Context:** Scenario #14 (typo "Tnet" for "Tent") can be handled by the model in two valid ways: (1) suggesting correct item names from the tool error, or (2) auto-correcting and calling `updateItemStatus` directly.
**Strategy:** Assert `(mentionsItems || autoFixed)` — accept either behavior as passing.
**Why it works:** LLMs may auto-correct obvious typos or relay the tool's error message. Both are correct user experiences. Testing only one path creates false failures when the model takes the other.

### [Win] Conversation-quality script uses Vitest `verbose` reporter to avoid terminal spam

**Date:** 2026-04-09
**Context:** `npm run test:conversation-quality` filled the terminal with hundreds of identical lines (`❯ prompt-quality-he.test.ts (13)`), as if tests were duplicated.
**Strategy:** Add `--reporter=verbose` to the `test:conversation-quality` script only (leave default reporter for fast unit tests). Document in `guides/chatbot.md` why.
**Why it works:** Vitest’s default reporter redraws the live suite tree while a test is running. Real-API quality tests take minutes per case, so there are many redraws. Integrated terminals (including Cursor) often log each redraw as a new line instead of overwriting in place. Verbose reporter prints one line per test when it finishes — no live redraw loop.

### [Decision] Multi-plan switch assertion: "all real IDs + at least one target ID"

**Date:** 2026-04-09
**Context:** The multi-plan switch quality test (T3: "show me Beach Day items" after viewing Camping Trip) failed because the assertion required ALL `getPlanDetails` calls in T3 to use `PLAN_BEACH_ID`. The model legitimately called `getPlanDetails` for both plans in the same turn — refreshing Camping Trip context before switching to Beach Day. This is valid behavior, not hallucination.
**Decision:** Changed T3 assertion from `t3Calls.every(c => c.planId === BEACH_ID)` to: (1) all calls use a known real plan ID (`validPlanIds.includes(c.planId)`), (2) at least one call uses `BEACH_ID` (`t3Calls.some(c => c.planId === BEACH_ID)`). Rejected the alternative of filtering calls to only check the last one — the "all real + some target" pattern is more robust.
**Reason:** The model's tool-call behavior within a single turn is non-deterministic — it may call supplementary tools for context. What matters for anti-hallucination is: no fabricated IDs + correct plan appears in the response. Overly strict assertions cause flaky tests.
**Reuse tip:** For any quality test that checks tool calls in a multi-step AI turn, assert "all calls use valid IDs AND at least one call hits the expected target" rather than "every call must match exactly one target."

### [Win] Anti-hallucination stress tests recreate exact production failure conditions

**Date:** 2026-04-09
**Context:** The getPlanDetails UUID hallucination bug passed all quality tests because they used single-turn flows or pre-seeded fakes. Production failures occurred in multi-turn scenarios where the model only had plan names from conversation text (not tool results). Need tests that specifically stress the conditions that triggered hallucination.
**Strategy:** Added 3 anti-hallucination quality test scenarios (EN+HE) that recreate the exact production failure conditions: (1) **multi-plan switch** — T1 lists plans, T2 gets Camping Trip details, T3 gets Beach Day details (tests name resolution across different plans in the same session); (2) **cold plan details** — user asks for plan details directly without listing plans first (tests `getPlanDetails` auto-fetch fallback — previously would always hallucinate a UUID); (3) **chitchat gap** — T1 lists plans, T2 is casual chat (no tool call), T3 asks for plan details (intermediate non-tool turn pushes plan names further back in context). Each asserts that ALL `getPlanDetailsCalls` use real plan IDs, not fabricated ones.
**Why it works:** These scenarios target the specific gaps that existing tests missed: cross-plan switching (which requires correct name→ID mapping for different plans), auto-fetch when plan list is not cached, and name resolution with intervening context dilution. If the name resolution logic has any edge case bugs, these tests will catch them before production.

### [Win] Explicit planContextStore seeding between turns makes T2 deterministic

**Date:** 2026-04-09
**Context:** Short-message quality tests ("camping" → "tent done") failed intermittently because T1's tool invocation was non-deterministic — sometimes calling `getMyPlans`, sometimes not. T2 depended on the planContextStore being populated by T1's tool chain.
**Strategy:** Seed the `planContextStore` explicitly between T1 and T2 in both English and Hebrew short-message tests. Remove T1 tool-call assertions entirely; only assert T1 replied on-topic (`replyText.toMatch`). Assert T2 tool calls and outcome.
**Why it works:** T2 correctness is decoupled from T1 tool behaviour. The test now verifies what matters (bot understands terse input and marks the right item) without requiring deterministic tool invocation on an ambiguous one-word message.

### [Win] Mirrored quality test suites for each supported language

**Date:** 2026-04-09
**Context:** The English quality test suite had 8 scenarios (list, details, mark done warm, empty, disambiguation, cold-start, context follow-up, short messages). The Hebrew suite only had 6, missing cold-start, context follow-up, and short terse messages.
**Strategy:** Extended the Hebrew suite to mirror English breadth: added cold-start mark done (`סמן את האוהל כבוצע`), text context follow-up (T2 answers from prior turn, no tool call), and short terse messages (`קמפינג` → `אוהל בוצע`).
**Why it works:** Language-specific regressions surface only when the test suite exercises the same scenarios in both languages. Hebrew-specific failures (transliteration, RTL formatting, item name mismatch) are only caught by Hebrew tests. Mirror coverage is the minimum required to trust a multilingual bot.

### [Win] qt- session ID prefix + Source header makes test runs filterable in chatbot_ai_usage

**Date:** 2026-04-08
**Context:** Quality tests use `FakeUsageLogger` so entries normally don't reach the DB, but if ever run with a real logger, test data would pollute production metrics. Also, markdown report files had no self-identifying metadata.
**Strategy:** Prefix all quality test session IDs with `"qt-"` (e.g. `"qt-mark-done"`) so DB queries can filter: `WHERE session_id LIKE 'qt-%'`. Added `Source: Quality Test` and `Suite: en/he` lines to the report header metadata block in `beforeAll`.
**Why it works:** Zero schema changes — `session_id` is an unconstrained text field. Filterable at any time with a simple LIKE query. Report files are self-identifying at a glance.

### [Win] Short-message scenarios expose real WhatsApp failure modes

**Date:** 2026-04-08
**Context:** Quality tests used verbose messages like "I packed the Tent — mark it done". Real WhatsApp users send "tent done" or "camping". Verbose messages can mask intent-parsing failures invisible in production.
**Strategy:** Added a dedicated `short messages` scenario using single-word T1 (`"camping"`) and two-word T2 (`"tent done"`). Asserts that the bot resolves intent, fetches items, and marks the correct item done — from minimal input.
**Why it works:** Model behavior on short/ambiguous input differs from verbose input. Testing both ensures prompt rules and tool descriptions work across the full input spectrum.

### [Win] Three-layer tool-call guard eliminates redundant getMyPlans in quality reports

**Date:** 2026-04-08
**Context:** `getMyPlans` was being called redundantly in 3/4 scenarios across 4 conversation quality report runs, despite existing prompt rules.
**Strategy:** (1) Rewrote `system-prompt.ts` with a `## Tool usage rules` section using positive-reframe phrasing + a few-shot XML example with bracket annotations. (2) Updated `getMyPlans` tool description to "call exactly once per conversation — reuse IDs directly". (3) Added `prepareStep` in `engine.ts` to hide `getMyPlans` from `activeTools` after it has been called in any step of the current turn. (4) Added execute guard in `getMyPlans.execute` that returns `{ error: "..." }` on duplicate calls (catches a known Vercel AI SDK bug where `activeTools` hides tools but the SDK still executes them if the model hallucinates a call).
**Why it works:** Each layer addresses a different failure mode — prompt handles the model's intention, `prepareStep` enforces it architecturally within a turn, execute guard is the deterministic last resort.

### [Win] Shared report-helpers.ts eliminates test duplication and adds auto-detection

**Date:** 2026-04-08
**Context:** `prompt-quality.test.ts` and `prompt-quality-he.test.ts` each duplicated `TurnResult`, `runTurn`, and `formatTurnBlock`. Reports had no way to detect anti-patterns at a glance.
**Strategy:** Extracted all shared helpers to `tests/unit/conversation/report-helpers.ts`. Added `analyzeScenario()` that auto-detects (a) redundant `getMyPlans` calls in T2+, (b) `updateItemStatus` called without prior `getPlanDetails`. Added `formatSummaryTable()` that prepends a summary table to every report — one glance shows all scenarios and whether any flags fired. Added `// Regression: [Bug title] — YYYY-MM-DD` comment convention to each `it()` block.
**Why it works:** The summary table turns a 166-line report into a 6-row table that immediately shows which scenarios passed. Auto-detection means a future regression triggers a visible flag even if the test assertion doesn't directly catch it.

### [Win] Hebrew conversation quality tests with number-selection and bulk-item scenarios

**Date:** 2026-04-07
**Context:** After adding Hebrew prompt support and fixing numbered-option / bulk-item handling, we needed regression coverage for those flows in Hebrew.
**Strategy:** Created `tests/unit/conversation/prompt-quality-he.test.ts` — a separate `describe.skip` suite that mirrors all 5 English scenarios in Hebrew, plus two new scenarios: (1) **number selection** — bot presents a numbered disambiguation list, user replies `"1"`, expect bot resolves to the correct plan; (2) **bulk items** — user says "קניתי אוהל ושק שינה, סמן אותם כבוצע", expect `updateItemStatus` called once per item. Reports written to `tests/conversation-quality-reports/report-he-<timestamp>.md`.
**Why it works:** Uses the same fake fixture data and `runConversationEngine` wiring as the English suite. The two new scenarios directly exercise the prompt rules added for number selection and bulk items, so any regression in those rules fails immediately.

### [Win] Opt-in real-model conversation quality tests + Markdown report

**Date:** 2026-04-04
**Context:** Need to regression-test system prompt and tool behavior against a live model without slowing CI or spending tokens on every push.
**Strategy:** `tests/unit/conversation/prompt-quality.test.ts` is `describe.skip` unless `RUN_CONVERSATION_QUALITY=true` and an API key exist; it runs `runConversationEngine` with `FakeInternalApiClient` + `FakeMessageStore` + real `createVercelAiClient`, detects language with `detectLanguage(text)` per turn, asserts heuristics on tool names and reply text, and writes `tests/conversation-quality-reports/report-*.md` (gitignored). Run via `npm run test:conversation-quality`.
**Why it works:** Mirrors production conversation + tool wiring while keeping data deterministic; report file gives a reviewable transcript with tokens and timings.

### [Win] Internal plan detail + item status endpoints mirror list membership

**Date:** 2026-04-03
**Context:** New `GET /api/internal/plans/:planId` and `PATCH /api/internal/items/:itemId/status` must not use public-plan bypass; chatbot list only shows plans where the user is a participant.
**Strategy:** Require a `participants` row for `(planId, x-user-id)` before returning detail or allowing status patch, same effective rule as `GET /api/internal/plans`.
**Why it works:** Avoids exposing public plans to non-members via the chatbot path and keeps access consistent across internal data routes.

### [Win] Template — copy this for new entries

**Date:** YYYY-MM-DD
**Context:** What problem or decision this applies to
**Strategy:** What worked well
**Why it works:** The reasoning behind it

---

## Bugs

<!-- Add new Bug entries at the top of this section -->

### [Bug] Anthropic 529 "Overloaded" exhausted default 3 retries — user had to manually retry

**Date:** 2026-04-09
**Problem:** User asked for plan details ("טיול ב-24 באפריל") in a group conversation. Anthropic API returned HTTP 529 "Overloaded" on all 3 attempts (default `maxRetries: 2` = 3 total). The conversation engine caught the `AI_RetryError`, logged it, and sent the generic fallback: "משהו השתבש אצלי. נסה שוב בעוד רגע." The user tagged the bot again with "תנסה שוב" (try again) 3 seconds later and it worked — the overload was transient (~20s window).
**Solution:** Increased `maxRetries` from default 2 to 4 (5 total attempts) in `ai.client.ts`. Made it configurable via `AiGenerateParams.maxRetries`. The AI SDK uses exponential backoff, so 2 extra attempts add ~10-15s of additional retry window.
**Prevention:** Always set `maxRetries: 4` on production `generateText()` calls. The AI SDK default of 2 is too aggressive for services with transient overload spikes. Monitor via `railway:logs` — filter for `"Conversation engine failed"` and check if the retry count was the bottleneck.

### [Bug] tool_calls double-serialized as JSONB string in chatbot_ai_usage

**Date:** 2026-04-09
**Problem:** `postgres-usage-logger.ts` called `JSON.stringify(toolCalls)` before passing to `postgres.js` tagged template INSERT. `postgres.js` auto-serializes JS values for JSONB columns, so the pre-stringified text was double-encoded: `tool_calls = '"[\"getMyPlans\"]"'::jsonb` (type: `string`) instead of `'["getMyPlans"]'::jsonb` (type: `array`). All 39 production rows had `jsonb_typeof(tool_calls) = 'string'`. The BE admin route `GET /admin/chatbot-ai-usage` crashed with `PostgresError: cannot extract elements from a scalar`.
**Solution:** Replaced `JSON.stringify(safeToolCalls)` with `sql.json(safeToolCalls)`, which lets `postgres.js` handle JSONB serialization correctly. Added migration `005_fix_tool_calls_jsonb.sql` to parse the 39 double-encoded rows back to proper JSONB arrays: `SET tool_calls = (tool_calls #>> '{}')::jsonb WHERE jsonb_typeof(tool_calls) = 'string'`. Added `usage-logger-postgres.e2e.test.ts` that asserts `jsonb_typeof(tool_calls) = 'array'` after insertion.
**Prevention:** Never call `JSON.stringify()` on values bound to JSONB columns in `postgres.js` tagged templates. Use `sql.json(value)` instead. The E2E test now guards against regression.

### [Bug] HE planName resolution test flaky — strict T1 getMyPlans assertion failed stochastically

**Date:** 2026-04-09
**Problem:** `פתרון שם תוכנית` test in `prompt-quality-he.test.ts` failed intermittently (1 of 37 tests, all 3 attempts). T1 ("אילו תוכניות יש לי?") sometimes didn't call `getMyPlans`, so the plan list was never stored. T2 then had no plan context and also failed to call `getPlanDetails`. The strict `expect(t1.toolCalls).toContain("getMyPlans")` and `expect(storedList).not.toBeNull()` assertions made the test brittle.
**Solution:** Made T1 assertion loose (only check reply is non-empty). Seed `planContextStore.setPlanList()` explicitly between T1 and T2 so T2 can resolve plan names regardless of T1's stochastic behavior. This is the same pattern used in the "short messages" and "undo" scenarios.
**Prevention:** Every multi-turn quality test must seed `planContextStore` between turns. Never rely on T1's tool calls populating the store — the model may answer conversationally without calling any tools.

### [Bug] HE cold-start test used literal `/UUID_RE/` instead of regex variable

**Date:** 2026-04-09
**Problem:** `prompt-quality-he.test.ts` line 961 had `expect(t1.replyText).not.toMatch(/UUID_RE/);` which matches the literal string "UUID_RE" instead of actual UUIDs.
**Solution:** Changed to `expect(t1.replyText).not.toMatch(UUID_RE);` (the regex variable defined at file top).
**Prevention:** Use the regex variable directly — never wrap a variable name in `/` delimiters.

### [Bug] getPlanDetails UUID hallucination — model fabricated plan IDs in follow-up turns

**Date:** 2026-04-09
**Problem:** In production, the model called `getPlanDetails` with hallucinated UUIDs (3 different fake IDs in one session, all returning 404). This happened because `getPlanDetails` accepted `planId: z.string().uuid()` — the model had plan *names* from conversation history but no plan *IDs* (system prompt says "never paste UUIDs to the user"). It fabricated valid-format UUIDs to satisfy the schema. Quality tests didn't catch this because `FakeInternalApiClient` was pre-seeded with exact UUIDs from `getMyPlans` within a single turn.
**Solution:** Changed `getPlanDetails` input from `planId: z.string().uuid()` to `planName: z.string()`. The tool now resolves name → ID from `IPlanContextStore.getPlanList()` (populated by `getMyPlans`). If the plan list isn't cached yet, the tool auto-fetches it. Also added `try/catch` to `getMyPlans` (the only tool without error handling) and a defensive `Array.isArray` guard in `postgres-usage-logger` for `toolCalls` data. Added quality test scenarios that replicate the exact production failure: T1 lists plans, T2 requests details by name — asserts the internal API call uses a real plan ID.
**Prevention:** Never let any tool accept a UUID as direct model input. Both `getPlanDetails` and `updateItemStatus` now accept human-readable names. The model never sees or handles UUIDs in tool arguments. The plan context store resolves all name → ID mappings deterministically inside tool `execute` functions.

### [Bug] Stochastic T1 assertion on terse messages caused recurring quality test failures

**Date:** 2026-04-09
**Problem:** `expect(t1.toolCalls).toContain("getMyPlans")` on a one-word message (`"camping"`) failed intermittently — the model sometimes responded conversationally with no tool call. Each failure triggered a fix-revert loop (change T1 wording → passes → revert → fails again).
**Solution:** Removed the T1 tool-call assertion. The `planContextStore` was already seeded explicitly between T1 and T2, making T1's tool behaviour irrelevant to T2's correctness. Added a rule to `chatbot.md`: short-message tests must never gate T2 on T1 tool invocation.
**Prevention:** For any quality test scenario with intentionally ambiguous input, only assert that the reply is on-topic (`replyText.toMatch`). Seed deterministic state (planContextStore) explicitly between turns rather than relying on the model's stochastic tool chain.

### [Bug] updateItemStatus never reached — bot looped getPlanDetails with hallucinated planIds

**Date:** 2026-04-07
**Problem:** User asked to mark an item done. Bot called `getPlanDetails` 7 times in one turn, each time with a different hallucinated UUID (not from `getMyPlans`). Every call returned 404. `updateItemStatus` was never called.
**Solution:** (1) PR #21 added `prepareStep` guard to remove `getMyPlans` from `activeTools` after first use, and tightened system prompt phrasing. (2) Session plan context store: `updateItemStatus` now accepts item name, resolves ID from store — model never passes UUIDs.
**Prevention:** Never let a write tool accept a UUID as direct model input. Always resolve IDs from a session-level context store populated by the preceding read tool.

### [Bug] Prompt overcorrected — "once per conversation" breaks multi-turn plan ID lookups

**Date:** 2026-04-08
**Problem:** After changing the `getMyPlans` rule to "call exactly once per conversation", the bot stopped calling `getMyPlans` in T2+ turns, even when it had no plan IDs in context. This caused `getPlanDetails` to be called with guessed/wrong plan IDs → "Plan not found" error → `updateItemStatus` never reached. Both `mark item done` and `disambiguation` multi-turn scenarios regressed.
**Solution:** Changed the rule scope from "per conversation" to "per response (turn)": the model can call `getMyPlans` at most once within a single response, but is free to call it again in a subsequent turn if plan IDs are not available. The `prepareStep` guard already enforces within-response deduplication architecturally; the prompt rule needed to match that scope.
**Prevention:** When writing tool-call frequency constraints, always scope them to "per response" (i.e. within one `generateText` call), not "per conversation". The message store only persists plain text — plan IDs from prior turns are NOT available in subsequent turns unless the model re-fetches them. A "per conversation" rule conflicts with this architecture and causes silent failures.

### [Bug] Vercel AI SDK activeTools bug — hides tool from schema but still executes it

**Date:** 2026-04-08
**Problem:** `activeTools` correctly removes a tool from the model's schema so the model cannot see or select it. However, if the model hallucinates a call to a hidden tool (from conversation memory), the SDK's `runToolsTransformation` still executes it because it uses the full `tools` object instead of the filtered `stepTools`.
**Solution:** Add an execute guard inside the tool's `execute` function that detects prior calls from the messages context and returns `{ error: "..." }` instead of performing the real operation.
**Prevention:** For any tool where a second call would be harmful or wasteful: (a) use `prepareStep` to hide it via `activeTools`, AND (b) add an execute guard inside `execute` checking `messages` for a prior tool-result message. Never rely on `activeTools` alone as a hard gate.

### [Bug] Sessions keyed only by phone caused cross-context bleed between groups and DMs

**Date:** 2026-03-18
**Problem:** The same user in Group A and Group B (or a DM) shared a single session. If the user triggered the bot in Group A and got a welcome prompt, then triggered it in Group B, Group B's message would find Group A's session — responding with "still learning" instead of a fresh welcome.
**Root cause:** `chatbot_sessions` had no `chat_id` column. `getActiveSession(phone)` returned ANY active session for that phone number regardless of which chat it came from.
**Solution:** Added `chat_id` column to `chatbot_sessions` (migration `002`). Session key is now `(phone_number, chat_id)` — each WhatsApp chat context (DM or group) gets its own independent session.
**Prevention:** When designing session keys for multi-context systems, the key must always include the full conversation context, not just the user identity. The pattern is `(user_identifier, context_identifier)`. A session scoped only by user silently bleeds across independent conversations.

---

### [Debug] Green API replays queued webhooks after a new deployment

**Date:** 2026-03-18
**Problem:** After deploying a new Railway build, the bot processed old messages (sent while the server was restarting) as if they were new — triggering welcome flows for conversations that had already happened.
**Root cause:** Green API queues webhook deliveries and retries them when the server is unavailable. On restart, it flushes the queue in order, replaying all unacknowledged messages.
**Solution:** Not a code bug. Cleared stale sessions from the DB (`DELETE FROM chatbot_sessions`) and re-tested. After the replay burst settled, the bot behaved correctly.
**Prevention:** After any deploy, expect a burst of replayed messages. If testing session state immediately after a deploy, clear the `chatbot_sessions` table first to avoid false "broken" signals. The queue drains within seconds.

---

### [Integration] Green API `mentioned` array is empty when user types `@PHONE` manually

**Date:** 2026-03-18
**Problem:** Implemented @mention detection by checking `extendedTextMessageData.mentioned` for the bot's JID. In production, `mentioned` was always `[]` even when the message text contained `@972545053620`. Bot never responded to @mentions.
**Root cause:** Green API only populates `mentioned` when the user picks the contact from WhatsApp's @mention autocomplete UI. When the user types `@PHONENUMBER` as plain text, `mentioned` is empty but the phone number appears in the `text` field.
**Solution:** Added a text-based fallback in `isBotMentioned`: if `mentioned` is empty, check whether `@botPhone` (digits only, no `+`) appears in the message text.
**Prevention:** Never rely solely on the `mentioned` array for @mention detection in Green API. Always add a text-based fallback. Verified via debug log showing `mentioned: [], textSnippet: "@972545053620 היי"`.

---

### [Infra] Railway skips redeploy when only env vars change — trigger manually

**Date:** 2026-03-18
**Problem:** Set `BOT_PHONE_NUMBER` via `railway variables set`. Railway created a new deployment record with status `SKIPPED` — the running container was not restarted, so the new env var was never picked up.
**Solution:** After setting env vars, force a redeploy via the Railway dashboard (Redeploy button) or `railway deployment redeploy`.
**Prevention:** `railway variables set` does not guarantee a redeploy. Always verify the deployment list with `railway deployment list` after changing env vars. If the latest entry is `SKIPPED`, redeploy manually.

---

### [Infra] Use `tsx scripts/migrate.ts` instead of raw `psql` for CI migrations

**Date:** 2026-03-18
**Problem:** GitHub Actions ran `psql "$DATABASE_URL_PUBLIC" -f migration.sql` and got `FATAL: database "railway" does not exist`. Raw `psql` does not handle Railway's proxy connection string (SSL negotiation, database name resolution) the same way Node.js does.
**Solution:** Replaced psql with a TypeScript migration script (`scripts/migrate.ts`) that uses the `postgres` npm package — the same library the app uses at runtime. No `postgresql-client` install needed.
**Prevention:** Follow the same pattern as `chillist-be` (`src/db/migrate.ts`). Always use the Node.js `postgres` package for migrations in CI — it uses the same connection handling as production and avoids psql SSL/proxy compatibility issues.

---

### [Integration] Green API `extendedTextMessageData` field names differ from assumptions

**Date:** 2026-03-18
**Problem:** Implemented @mention detection using `extendedTextMessageData.textMessage` and `mentionedJidList`. In production, Green API sends `text` (not `textMessage`) and `mentioned` (not `mentionedJidList`). Every @mention message failed to parse and was silently dropped.
**Solution:** Updated Zod schema and helper functions to use the correct field names: `text` and `mentioned`.
**Prevention:** Always verify Green API payload field names against real webhook deliveries before implementing logic that depends on them. Add a log of the raw payload at `DEBUG` level or inspect from a real test send before writing schema code.

### [Infra] Railway PORT: never hardcode a specific value — use 8080 or let Railway assign it

**Date:** 2026-03-17
**Problem:** `PORT=3333` was hardcoded on `chillist-be-prod` in Railway. Railway assigns its own dynamic PORT (8080) and routes public traffic to it. When PORT was overridden to 3333 the BE listened on 3333 but Railway routed to 8080 → 502 on the public URL.
**Solution:** Delete any hardcoded PORT that doesn't match what the app actually binds to. Railway injects `PORT=8080` by default for Node services. Set PORT explicitly only if needed for cross-service references (see lesson below).
**Prevention:** Never set PORT to an arbitrary value in Railway. Check the service logs (`Server listening at http://...:XXXX`) to confirm what port the app actually uses before hardcoding it.

---

### [Infra] Railway reference variable `${{service.PORT}}` only resolves if PORT is explicitly set on that service

**Date:** 2026-03-17
**Problem:** Tried to set `APP_BE_INTERNAL_URL=http://zealous-beauty.railway.internal:${{chillist-be-prod.PORT}}` on the chatbot. It resolved to empty (`http://zealous-beauty.railway.internal:`) because Railway's dynamically-injected PORT is not exposed as a reference variable unless PORT is explicitly defined in the service's env vars.
**Solution:** Explicitly set `PORT=8080` (or the actual port) on `chillist-be-prod` in Railway. After that `${{chillist-be-prod.PORT}}` resolves to `8080` and the internal URL works.
**Prevention:** For `${{service.VAR}}` reference variables to resolve, the variable must be user-defined (visible in Railway dashboard) — Railway's runtime-injected vars are not reference-able. Always verify with `railway variables --json` (shows resolved values) after setting.

---

### [Infra] `railway variables --json` shows resolved values; `railway variables set` needs single quotes for `${{...}}`

**Date:** 2026-03-17
**Problem:** Running `railway variables set APP_BE_INTERNAL_URL=http://...railway.internal:${{chillist-be-prod.PORT}}` without single quotes caused the shell to expand (or mangle) the `${{...}}` syntax before it reached Railway.
**Solution:** Always use single quotes: `railway variables set 'KEY=value with ${{ref}}'`. Verify immediately after with `railway variables --json | python3 -c "..."`.
**Prevention:** Single quotes in zsh prevent ALL expansion. Double quotes allow `$VAR` expansion. Always single-quote Railway variable values that contain reference syntax.

---

### [Infra] `railway up` deploys local working directory — including uncommitted changes

**Date:** 2026-03-17
**Problem:** Ran `railway up` to force a fresh build. It deployed the local working directory which contained uncommitted session-feature code that wasn't ready for production, causing `PostgresError: relation "chatbot_sessions" does not exist`.
**Solution:** Railway rolled back (via a subsequent `railway up` from the correct state). The session code is safe because `railway up` re-ran after the issue was identified.
**Prevention:** Only run `railway up` from a clean git state on the intended branch. Prefer `railway redeploy --yes` to reuse the last production image when only env vars changed.

---

### [Infra] Railway internal networking requires HOST=0.0.0.0 and correct PORT on every service

**Date:** 2026-03-17
**Problem:** The chatbot was deployed on Railway and receiving real WhatsApp webhooks, but every `identify` call to the BE failed with `ECONNREFUSED`. The `APP_BE_INTERNAL_URL` was set to `http://zealous-beauty.railway.internal:3333` — the hostname resolved correctly (no more `ENOTFOUND`) but the connection was refused.
**Cause:** The BE service was binding to `127.0.0.1` (localhost) inside its container. Railway's private networking routes traffic from other containers, which arrives as an external connection. A service bound to `127.0.0.1` refuses all connections from outside its own container.
**Solution:** Set `HOST=0.0.0.0` in the BE's Railway environment variables so it accepts connections on all interfaces, including Railway's private network. Also confirm `PORT` matches the port in the internal URL exactly.
**Prevention:** Any Railway service that must be reachable by another service via `*.railway.internal` must have `HOST=0.0.0.0` set explicitly. Never rely on a default host binding. Add this to the Railway deploy checklist for every new service.

### [Arch] Fake external services must never be a runtime default — applies to all 3 providers

**Date:** 2026-03-16 (ported from backend lesson 2026-03-13)
**Problem:** In the app backend, `WHATSAPP_PROVIDER` defaulted to `'fake'` with no production guard. The factory had a `fake` fallback, and the plugin silently fell back to a noop service. On Railway without the correct env var, the app ran with a fake that returned `{ success: true }` for every call — masking total failure.
**Applies to chatbot:** The chatbot has three external services that need the same discipline: (1) Green API (WhatsApp messaging), (2) AI provider (Anthropic/OpenAI), (3) Upstash Redis (session storage). Each must follow the pattern below.
**Prevention:** For every external service: (a) never make a fake provider the default in env — block it in production via `.refine()`, (b) never let the factory create the fake — only inject via `buildApp` options in tests, (c) if the real service fails to initialize, crash — no silent fallback, (d) add an E2E prod test (`describe.skipIf(!CREDS)`) that validates the real service before deploy. See `.cursor/rules/new-external-service.mdc` for the full checklist.

### [Arch] Decouple business logic from route handlers into services

**Date:** 2026-03-16 (ported from backend lesson 2026-03-02)
**Problem:** In the app backend, business logic was embedded directly in route handlers. When the same logic was needed in multiple routes, there was no reusable function — only copy-paste.
**Applies to chatbot:** The chatbot's webhook route handler should only handle HTTP concerns (parsing the Green API payload, responding 200). Business logic — session lookup, phone-to-user resolution, AI orchestration, response sending — belongs in dedicated services (e.g., `SessionService`, `AiOrchestrator`, `GreenApiClient`).
**Prevention:** Route handlers handle HTTP concerns (parse request, validate, return status code). Services handle business logic (session management, AI calls, WhatsApp messaging). This keeps each layer testable in isolation and avoids duplication when adding group chat support (v1.5).

### [Bug] resolveUserByPhone queried users.phone (always null) instead of participants.contact_phone

**Date:** 2026-04-05
**Problem:** `POST /api/internal/auth/identify` returned 404 for every registered user. The chatbot sent every real user a signup link instead of identifying them. Root cause: `resolveUserByPhone()` in `src/services/internal-auth.service.ts` queried `users.phone`, which is `null` for all users. The spec (`whatsapp-chatbot-spec.md` § 3) explicitly says to query `participants.contact_phone` — a different table entirely.
**Solution:** Rewrite `resolveUserByPhone()` to query `participants WHERE contact_phone = $1 AND user_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`. Resolve `displayName` from the same row (`display_name ?? name + last_name`). Remove the `fetchSupabaseUserMetadata()` call from this path — the spec states "No SUPABASE_SERVICE_ROLE_KEY needed." Tracked in [chillist-be#176](https://github.com/Alexgub84/chillist-be/issues/176).
**Prevention:** See full retro below.

#### Retro — how we built this end-to-end with tests and still shipped the wrong table

**What happened during development:**

1. The spec was written first and was correct. It named the table (`participants`), the column (`contact_phone`), and the exact SQL query. It also explicitly said "No SUPABASE_SERVICE_ROLE_KEY needed."

2. During implementation, the developer noticed the `users` table has a `phone` column (used by `PATCH /auth/profile`). This created a plausible-looking alternative: "phone lookup → `users.phone`." The `participants.contact_phone` path — the one the spec prescribed — was bypassed.

3. The implementation also added a Supabase Admin API call (`fetchSupabaseUserMetadata`) to resolve the display name. The spec says to get it from the `participants` row itself. This was a second deviation that slipped in alongside the first.

4. Unit and integration tests were written against the wrong implementation. They seeded a `users` row with `phone` set. Since the code queried `users.phone` and the test seeded `users.phone`, all tests passed — green suite, wrong table.

5. No test ever seeded a `participants` row and verified the lookup worked against `participants.contact_phone`. The critical path the spec described was never exercised.

6. Manual testing likely used a local environment where `users.phone` was populated via `PATCH /auth/profile`. Production users had never called that endpoint, so `users.phone` was `null` in prod — but `participants.contact_phone` was correctly set.

**Why this is a pattern to watch:**

- Spec drift happens when there are two plausible implementations and the developer picks the wrong one. The safeguard is to **read the spec section that names the exact query before writing the function, not after**.
- Tests that are seeded against the wrong table give false confidence. A test that passes is not evidence that the right table is being queried.
- The `users.phone` column exists for a different purpose (`auth/profile` preferences). Having a phone column in a `users` table is intuitive for a phone lookup, so the wrong path feels correct at a glance.

**Rules to add going forward:**

1. Before implementing any service function that the spec describes with an exact SQL query, open the spec and find that query. If the code does not match — stop.
2. Integration test fixtures for `resolveUserByPhone` must seed `participants` rows with `contact_phone` and assert the lookup uses them. A test that seeds `users.phone` is testing the wrong thing.
3. Any deviations from spec during implementation must be called out in the PR description with a reason. "I used a different table because..." is a red flag that must be reviewed.

---

### [Bug] CreatePlanWizard stores '+10000000000' as contactPhone for phone-OTP users

**Date:** 2026-04-05
**Problem:** Users who registered via Supabase phone OTP have their phone in `auth.users.phone` (top-level Supabase field), not in `user.user_metadata.phone`. `CreatePlanWizard` reads only `user_metadata.phone`. When it is empty, the fallback is the hardcoded placeholder `'+10000000000'`, which is then written to `participants.contact_phone`. Since the chatbot identifies users by `participants.contact_phone`, these users are permanently invisible to the chatbot. Same gap exists in `complete-profile.lazy.tsx` (phone field pre-fills blank, so the user never sees their real number to confirm it). Tracked in [chillist-fe#213](https://github.com/Alexgub84/chillist-fe/issues/213).
**Solution:** In `CreatePlanWizard`, read `user.phone` (top-level Supabase field) as a fallback: `const ownerPhoneRaw = (meta.phone as string) || (user.phone ?? '')`. In `complete-profile.lazy.tsx`, pre-fill from `user.phone` when `user_metadata.phone` is empty. In `AuthProvider`, call `syncProfile` on `SIGNED_IN` (not only `USER_UPDATED`) so phone sync happens on every login.
**Prevention:** Supabase has two separate phone fields: `user.phone` (set by phone-OTP auth) and `user.user_metadata.phone` (set by `updateUser({ data: { phone } })`). Any code that reads the user's phone must check both. The `'+10000000000'` placeholder silently satisfies a `NOT NULL` constraint but creates a data integrity problem downstream — a silent wrong value is worse than a loud null. Test plan creation with a phone-OTP user in staging before shipping any feature that reads `contactPhone`.

### [Bug] Bot re-calls getMyPlans redundantly in follow-up turns

**Date:** 2026-04-07
**Problem:** In multi-turn conversations, the bot was calling `getMyPlans → getPlanDetails → getPlanDetails` (3 tool calls) for follow-up questions where it already had the plan list in context. In the `updateItemStatus` flow it was calling 4 tools when only 2 were needed. This caused higher latency (8–12s extra), wasted tokens, and in one run produced a wrong item ID because the unnecessary re-fetch returned a different item order.
**Solution:** Updated `system-prompt.ts` with explicit rules: (1) only call `getMyPlans` when the plan list is not yet in context; (2) when calling `updateItemStatus`, use the plan id already in context — do not re-call `getMyPlans` first. Updated both the `getMyPlans` and `updateItemStatus` tool descriptions with the same constraint.
**Prevention:** After every prompt change, run `npm run test:conversation-quality` and check the Tools column in the report. Any turn showing `getMyPlans` after Turn 1 (where plans were already fetched) is a red flag. The tool description and system prompt must both say "only call getMyPlans if the plan list is not already in context."

### [Bug] Bot didn't understand numbered option selection ("1", "2" replies)

**Date:** 2026-04-07
**Problem:** When the bot presented a numbered disambiguation list ("1. Camping Trip 2025 / 2. Camping Trip 2026") and the user replied with just `"1"`, the bot failed to connect the reply to the list and asked a clarifying question again or errored.
**Solution:** Added an explicit prompt rule: "When the user replies with just a number (e.g. '1' or '2'), treat it as selecting that option from the most recent numbered list you presented."
**Prevention:** Numbered-list + digit-reply is the most common WhatsApp interaction pattern (users avoid typing on mobile). Whenever the prompt instructs the bot to present a numbered list, it must also have a rule explaining how to handle a bare-number reply. Add a quality test scenario that sends `"1"` as a Turn 2 reply.

### [Bug] Bot only acted on the first item when user mentioned multiple items at once

**Date:** 2026-04-07
**Problem:** When a user said "I bought X and Y" or "ארזתי אוהל ושק שינה", the bot only called `updateItemStatus` once (for the first item) and ignored the rest.
**Solution:** Added an explicit prompt rule: "When the user mentions multiple items at once, call `updateItemStatus` once for each item — do NOT skip any of them."
**Prevention:** Bulk-action messages are natural in WhatsApp. Any time the prompt covers `updateItemStatus`, it must also cover the multi-item case. The Hebrew quality test scenario `מספר פריטים בבת אחת` asserts that `updateItemStatus` is called for every item in the message.

### [Bug] System prompt referenced "the app" with no link — unhelpful on error/empty states

**Date:** 2026-04-07
**Problem:** When plans were empty or a tool failed, the bot said "create one in the app" or "try using the app" with no URL. On WhatsApp this is a dead end — the user has no link to tap.
**Solution:** Threaded `feBaseUrl` (already in handler deps as `config.FE_BASE_URL`) through `ConversationEngineDeps` → `buildSystemPrompt`. Prompt rules now reference `${siteLink}` directly in the empty-plans and tool-error lines.
**Prevention:** Any prompt message that asks the user to go somewhere must include the actual URL. `buildSystemPrompt` now has a required `feBaseUrl` parameter — if it is missing the TypeScript compiler will fail. Never write "use the app" without a link.

### [Bug] Bot used "Chillist" as app name in Hebrew prompts instead of "צ'יליסט"

**Date:** 2026-04-07
**Problem:** Hebrew-language users saw the English app name "Chillist" in bot replies. The correct Hebrew brand name is "צ'יליסט".
**Solution:** `buildSystemPrompt` now derives `appName` from `lang`: `lang === "he" ? "צ'יליסט" : "Chillist"`. The prompt intro and any explicit app references use this variable.
**Prevention:** Any user-visible string in `system-prompt.ts` that contains a brand name must be localised per `lang`. Added assertion `expect(prompt).toContain("צ'יליסט")` to the Hebrew system-prompt unit test.

### [Bug] Bot mentioned "sync issue" when getMyPlans and getPlanDetails item counts differed

**Date:** 2026-04-07
**Problem:** `getMyPlans` returns plan-wide item totals (all participants' items), while `getPlanDetails` returns only items visible to the requesting user. When the bot saw "10 items" from `getMyPlans` but only 1 item in `getPlanDetails`, it told the user: *"there might be a sync issue."* This undermines trust in the app.
**Solution:** Added an explicit rule to `system-prompt.ts`: "getMyPlans returns plan-wide item totals (all participants); getPlanDetails returns only items visible to the requesting user — this discrepancy is expected and normal, never comment on it or suggest a sync issue."
**Prevention:** Any time `getMyPlans` and `getPlanDetails` return different item counts, the bot must stay silent on the discrepancy. Add a quality test scenario that verifies this.

### [Bug] Anthropic 529 Overloaded causes "something went wrong" in production

**Date:** 2026-04-09
**Problem:** Anthropic API returned HTTP 529 "Overloaded" during a real user conversation. The AI SDK's default `maxRetries: 2` (3 total attempts) was insufficient; all retries failed and the user saw "something went wrong."
**Solution:** Set `maxRetries: 6` explicitly in `runConversationEngine` and raised the default in `ai.client.ts` from 4 to 6. The Vercel AI SDK uses exponential backoff between retries, so 6 retries covers ~2 minutes of backoff, enough to ride out brief API blips.
**Prevention:** Always set `maxRetries` explicitly in the engine call rather than relying on defaults. For longer outages, a model-fallback mechanism (Anthropic → OpenAI) should be implemented as a separate feature.

### [Decision] Two-tier assertion model for quality tests

**Date:** 2026-04-09
**Context:** Quality tests against a live LLM were flaky: 1-2 tests failed per run due to strict `expect(toolCalls).toContain("readTool")` assertions. At `temperature=0` with `retry: 2`, the model still occasionally skips a read tool or answers from context. Three separate bug entries documented the same root cause. Patching individual tests just moved the flakiness elsewhere.
**Decision:** Split every quality-test assertion into two tiers. Hard assertions (`expect`) cover user-visible correctness: non-empty reply, no error phrases, no UUID leaks, write-tool mutations (`updateItemStatus`) with correct `itemId`/`status`. Soft assertions (`softAssert` from `report-helpers.ts`) cover model reasoning path: read-tool calls, no-tool expectations, keyword matches, planId correctness. Soft failures are logged as warnings in the Markdown report but never fail the test.
**Reason:** The suite conflated behavioral correctness (must pass) with implementation verification (nice to track). Splitting the two gives stable CI while preserving full visibility into model behavior via reports.
**Reuse tip:** In any LLM-backed test suite, separate "did the user get the right outcome" from "did the model take the expected path." Only fail the test on the first category.

### [Bug] Bot asks "which plan?" when user has only one plan

**Date:** 2026-04-15
**Problem:** When a user with a single plan said "update items," the bot called `getMyPlans`, showed the plan summary, and asked "which items would you like to update?" without calling `getPlanDetails` to actually list the items. The expected behavior is to auto-select the only plan and show items immediately.
**Solution:** Added a system prompt rule: "If the user has only one plan and asks to see or update items without specifying a plan name, auto-select that plan — call getPlanDetails immediately instead of asking which plan they mean."
**Prevention:** When adding disambiguation rules (e.g. "if multiple plans match, ask which one"), always add the inverse single-match rule too. Add quality tests for both the single and multi-match paths.
