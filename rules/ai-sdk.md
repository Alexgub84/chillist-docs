# AI SDK Rules

Reusable best practices for any Chillist project that uses the [Vercel AI SDK](https://ai-sdk.dev). Read this before implementing or modifying AI features. Use alongside [common rules](common.md).

---

## 1) Package & Version Policy

- Pin `ai`, `@ai-sdk/<provider>` to **exact** versions (no `^` or `~`). See [common rules — Code Standards](common.md#code-standards).
- AI SDK v5+ is the minimum supported version. v6 is preferred when stable.
- Canonical APIs: `generateText`, `streamText`, `tool()`, `inputSchema`, `stopWhen`, `stepCountIs`, `prepareStep`, `onStepFinish`, `ModelMessage`.
- Model type: `LanguageModelV2` from `@ai-sdk/provider`.
- Provider factories: `createAnthropic` / `createOpenAI` from their respective `@ai-sdk/*` packages.

---

## 2) Model Configuration

- Model IDs **must** be configurable via environment variable (e.g. `AI_MODEL_ID`), with a sensible default per provider.
- Never hardcode model IDs in plugin or factory code. The plugin reads the ID from config and falls back to a default only if the env var is unset.
- `getAiRuntimeMetadata()` reads from config — never from string literals.
- Rationale: the AI SDK is designed for easy model switching. Hardcoded IDs defeat this and require a code deploy to change models.

---

## 3) Tool Design

Sourced from [AI SDK: Prompt Engineering for Tools](https://ai-sdk.dev/docs/ai-sdk-core/prompt-engineering).

- **Max 5 tools per agent** — the AI SDK recommendation for reliable tool selection.
- Use **semantically meaningful names** for tools and parameters.
- Every `inputSchema` field **must** have `.describe("...")` — this is the model's primary guide for what to pass. Be explicit about format, allowed values, and language expectations.
- Keep parameter schemas **flat and simple** — avoid deep nesting, unions, and optionals where possible.
- Use the tool `description` to explain output shape when dependencies exist between tools (e.g. "Use item names from this result with updateItemStatus").
- **Never accept UUIDs as tool input from the model** — accept human-readable names and resolve IDs inside `execute`. The model hallucinates valid-format UUIDs when it has names but not IDs in context.

---

## 4) Agentic Loop Patterns

- Use `stopWhen: stepCountIs(N)` — not the deprecated `maxSteps` parameter.
- Use `prepareStep` for dynamic tool gating per step (e.g. remove a tool from `activeTools` after first use within a turn).
- Set `maxRetries` **explicitly** — minimum 4 for production, recommended 6. The SDK default is 2, which is too low for transient provider overload (Anthropic 529, OpenAI 429).
- For critical tool-call constraints, use **three-layer defense**: prompt + `prepareStep` + execute guard. Prompt alone achieves ~70–85% compliance at best (AGENTIF benchmark, Tsinghua 2025).

### Three-layer defense explained

| Layer | Where | What it catches |
|---|---|---|
| **1. Prompt** | System prompt + tool description | Model intention — "reuse plan IDs from earlier" (positive-reframe phrasing) |
| **2. prepareStep** | `generateText({ prepareStep })` | Within-turn redundancy — removes tool from `activeTools` after first use |
| **3. Execute guard** | Inside tool `execute` function | Deterministic backstop — returns `{ error }` if SDK still calls a hidden tool |

---

## 5) Observability

- Use `onStepFinish` callback to log per-step tool calls, token usage, and finish reason. This gives granular visibility into multi-step agent behavior.
- Log aggregate `totalUsage` from the result for overall cost tracking.
- Usage logging **must** be fire-and-forget — never block message delivery on a logging call.
- Store per-invocation metadata: `provider`, `modelId`, `stepCount`, `toolCalls`, `inputTokens`, `outputTokens`, `totalTokens`, `durationMs`, `status`.
- Per-step data (via `onStepFinish`) enriches debugging: which step made which tool call, how many tokens each step consumed, and what the finish reason was.

---

## 6) In-Memory State Management

- Any in-memory store keyed by session (e.g. plan context, conversation cache) **must** have a cleanup path tied to session lifecycle.
- When a session is deleted or expires, **clear all associated in-memory state** in the same code path.
- For unbounded maps, add either TTL eviction or a max-size bound. A `Map` that only grows is a memory leak in a long-running process.

---

## 7) AI Client Abstraction & DI

- Wrap the AI SDK behind an `IAiClient` interface for testability.
- **Real client**: wraps `generateText` / `streamText` with project-specific defaults.
- **Fake client**: deterministic responses for unit tests. Must expose inspection helpers (`setNextResponse`, `getCallHistory`, `clear`).
- **Noop client**: for local dev when no API key is needed. Returns a placeholder response.
- Factory plugin pattern: real in production, noop in dev, fake only injected via `buildApp()` in tests.
- `AI_PROVIDER=fake` **must** be blocked in production via Zod `.refine()`.

---

## 8) System Prompt Management

- System prompt lives in **one file** (e.g. `src/conversation/system-prompt.ts`).
- `buildSystemPrompt` takes **explicit parameters** — never reads globals or env vars directly.
- Localise brand names per language (e.g. `lang === "he" ? "צ'יליסט" : "Chillist"`).
- Include `feBaseUrl` in every user-facing error/empty-state message so users always get a tappable link.
- Use **positive-reframe phrasing** for tool-call constraints ("reuse the plan IDs from the earlier result") — never lead with "don't" or "never". Positive-reframe achieves near-perfect compliance; negation is the weakest pattern (Safety Adherence Benchmark, ICML 2025; NeQA benchmark, arXiv 2305.17311).
- Any important tool-call constraint must appear in **both** the system prompt and the tool description (dual placement).
