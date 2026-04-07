# Planning Guide — How to Create a Plan in Cursor

> This is the single authoritative reference for how AI agents in this project must plan and execute every task.
> All planning instructions from Cursor user settings, workspace workflow rules, and `rules/common.md` are unified here.

---

## Phase 1: Initialization & Context

### New Chat Policy

For every distinct feature, bug fix, or major section start a **NEW CHAT**.

Why: This prevents context pollution and keeps code generation sharp. Never carry context from an unrelated task into a new one.

### Read the Docs First

Before writing any code or plan, use the Read tool on ALL of these files:

| # | File | What it contains |
|---|------|-----------------|
| 1 | `../chillist-docs/rules/common.md` | Git workflow, planning, code standards, security |
| 2 | `../chillist-docs/rules/backend.md` | Schema design, DI, CORS, logging, testing, breaking changes |
| 3 | `../chillist-docs/guides/backend.md` | Setup, scripts, database, deployment, CI/CD |
| 4 | `../chillist-docs/specs/mvp-v1.md` | Product requirements, entities, API endpoints |
| 5 | `../chillist-docs/dev-lessons/backend.md` | Past bugs — check before debugging |

For WhatsApp-related tasks, also read `../chillist-docs/specs/whatsapp.md`.

Read the docs first, then explore only the files in the repo that are directly relevant to the task. Do NOT scan the entire codebase upfront.

### Clarification Protocol

If you are less than **90% sure** about the user's intent or the "Why" behind a task, **STOP and ask clarifying questions** before doing anything.

Do not guess. Ask at most 1–2 focused questions at a time.

---

## Phase 2: The Master Plan

Work through all six steps below before writing a single line of implementation code.

### Step 1 — Lessons & Known Mistakes

Before planning, write a short "Lessons from similar tasks" section.

Look at:
- `dev-lessons/backend.md` (or frontend/chatbot) — past bugs and fixes
- Code comments marked `// TODO`, `// FIXME`, `// HACK`
- Common AI mistakes for this type of task:
  - Writing tests that only cover the happy path
  - Forgetting async edge cases (race conditions, double-submit, stale closures)
  - Missing null/undefined guards at boundaries
  - Not isolating side effects (timers, network, localStorage) in unit tests
  - Skipping the "what if the API returns unexpected shape" scenario
  - Assuming the component always has required props
  - Not testing loading and error states, only success

Output format:
```
### Lessons Relevant to This Task
- [lesson 1]
- [lesson 2]
```

### Step 2 — Scenario Analysis

List ALL scenarios before writing a single test.

**Happy Path**
- What is the primary flow when everything works?
- What are the inputs, outputs, and side effects?

**Error Path**
- What can fail? (network, validation, permissions, missing data)
- What does the system do for each failure?
- Are errors recoverable or fatal?

**Edge Cases**
- What if the input is empty / null / zero / negative?
- What if the user does this twice (double-click, double-submit)?
- What if data arrives out of order (race condition)?
- What if a required dependency (API, context, store) is missing?
- What if the list is empty vs. has one item vs. has thousands?
- What if the user has no permissions for this action?

Output format:
```
### Scenarios
Happy path:
- [ ] ...

Error path:
- [ ] ...

Edge cases:
- [ ] ...
```

### Step 3 — Architecture & Security

- **Architecture**: Identify all modules/components affected.
- **Design Patterns**: Explicitly name the pattern to use (e.g., *Strategy* for variants, *Factory* for creation, *Adapter* for 3rd party).
- **Security (OWASP Top 10)**: Flag potential risks — IDOR, injection, broken auth, insecure direct object references.
- **NEVER** output API keys, passwords, or tokens. Warn immediately if hardcoded secrets are found.
- Assume all input is malicious — use Zod for strict typing and parameterized queries for SQL.

### Step 4 — Test Strategy

Assign each scenario to the right test layer.

**Unit Tests** — test a single function in isolation
- Use when: pure logic, validators, formatters, error boundaries, loading/empty states
- Mock ALL external dependencies
- One assertion focus per test
- Test the contract (inputs → outputs), not the implementation

**Integration Tests** — test how modules work together
- Use when: form submission flow end-to-end, data-fetching hook + consumer, multiple components interacting
- Mock only at the network boundary (MSW or `app.inject()`)
- Do NOT mock internal modules
- Test user-visible behavior, not internal state

**E2E Tests** — test the full system through the browser
- Use when: critical user journeys, cross-page navigation, scenarios that require real backend state
- Keep few and stable — expensive to maintain
- Each E2E test represents a complete user story
- Never use E2E to cover what a unit test can cover

Output format:
```
### Test Plan

Unit:
- [ ] test name → what it verifies

Integration:
- [ ] test name → what it verifies

E2E:
- [ ] test name → what it verifies
```

### Step 5 — Module Breakdown & Execution Flow

**Per-file breakdown:**

```
### File: path/to/file.ts
Purpose: [one sentence]
Exports:
  - functionName(params) → returnType — [what it does]
Dependencies: [what it imports / what it needs injected]
Side effects: [network calls, storage writes, events — or "none"]
```

Rules:
- Each file has a single responsibility
- Separate pure logic from side effects
- Identify which files already exist (to be modified) vs. new files
- Flag any file that touches more than 3 concerns — it should be split

**Execution flow (prose):**

```
### Flow
1. User does X
2. Component/route calls Y
3. Service/function calls Z
4. On success: state updates, response returned
5. On error: error state set, user sees message M
6. On edge case (empty list): empty state shown
```

### Step 6 — Documentation Plan

Every plan MUST include a documentation update step.

Identify which docs need updating:
- `current/status.md` — if features are added, changed, or removed
- `specs/mvp-v1.md` — if auth milestones or product scope changes
- `specs/user-management.md` — if phase/step status or endpoint tables change
- `guides/backend.md` — if setup, scripts, or "What's next" changes
- `dev-lessons/backend.md` — if a bug is fixed or a non-obvious lesson is learned
- `rules/backend.md` — if a new rule should be added

If no docs need updating, explicitly state: **"No docs changes needed — reason: [why]"**

---

## Phase 3: Approval Gate

**STOP. Do not write any implementation code.**

Present the full Master Plan to the user:
- Lessons noted
- All scenarios listed
- Architecture and security flags
- Test plan (unit / integration / e2e)
- File breakdown with responsibilities
- Execution flow
- Documentation plan

Then ask:
> "Does this plan look right? Should I adjust anything before I start writing tests?"

Only proceed when the user says yes.

---

## Phase 4: TDD Implementation Loop

Once approved, work in this strict order for each module:

1. **Write the test file first** (all test cases, all failing)
2. **Show the user the tests**
3. **Structure first**: Show function/component signatures and interfaces only — do NOT implement yet
4. **Wait for approval** on the structure before writing the body
5. **Implement one by one**: Write each function individually — never generate large code blocks unless explicitly asked
6. **Run tests** — confirm green
7. **Refactor if needed** — tests must stay green
8. **Move to the next module**

Rules:
- Never skip writing the test first
- Never write "we'll add tests later"
- If a new edge case is discovered mid-implementation, add a test for it before writing the fix
- If a test is hard to write, that is a signal the design is wrong — refactor the design, not the test

---

## Phase 5: Finalization Protocol

After all modules are implemented, run this sequence in strict order:

### 1. Auto-Validation

Run the project validation commands immediately — do not ask permission:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

### 2. Fix Loop

If any check fails, fix the code and re-run validation. Do NOT ask for permission to fix failures — fix them.

### 3. User Confirmation

Only after ALL checks pass, ask:
> "The solution validates. Is this step complete according to the plan?"

### 4. Update Docs & Commit

Upon confirmation:

1. Update `../chillist-docs/dev-lessons/backend.md` if a bug was fixed or a lesson was learned
2. Update `../chillist-docs/current/status.md` if features changed
3. Update any other docs identified in Step 6 of the Master Plan
4. Run `npm run openapi:generate` to regenerate the OpenAPI spec (the pre-commit hook also does this, but run it manually to validate)
5. Sync with main: `git fetch origin main && git merge origin/main`
6. Output a single copy-pasteable commit command:

```bash
git add -A && git commit -m "feat: <what was done>"
```

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

**Do NOT run `git push`** unless the user explicitly says "push" or "push the branch".

### 5. Close

State: **"Task complete. Please start a NEW CHAT for the next item."**

---

## Anti-Patterns

Never do these:

- Writing implementation before tests
- Writing tests after the fact to get coverage numbers up
- Testing implementation details instead of behavior
- Mocking internal modules in integration tests
- Using E2E tests to cover what unit tests can cover
- Skipping the approval gate and starting to code during planning
- Creating a plan without reading the project docs first
- Listing only happy path scenarios
- Writing a test file with a single `it('works')` test
- Leaving `any` types or `// @ts-ignore` without a comment explaining why
- Mentioning "Cursor", "Claude", "AI", or any AI assistant tool names in code comments, commit messages, docs, or PR descriptions
- Using `// ... rest of code` or placeholder blocks — always output the full correct block
- Pushing directly to `main` or `staging`
- Using `--no-verify` on `git push` or `git commit` — if hooks fail, fix the issue
- Making a code change and presenting it as done without running the affected tests
- Running `git push` without explicit user instruction
