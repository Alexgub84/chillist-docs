# Common Rules

Shared workflow rules for all Chillist service repos (backend, frontend, chatbot).

---

## Issue-Driven Development

- GitHub Issues are the single source of truth for all planned work
- Every feature, enhancement, or task must have a corresponding GitHub issue before work begins
- Every bug must be filed as a GitHub issue before fixing
- Do NOT start coding without an issue to reference

**When asked to create issues:** Read [Issue Creation and Management](../guides/issue-management.md) first. Follow its breakdown (BE/FE split, projects, dependencies), then create issues in the relevant repos.

## Starting Work

1. If working on a bug and no issue exists yet, create one first:
   `gh issue create --title "<title>" --label "bug" --body "<description>"`
2. Fetch the GitHub issue assigned to this task: `gh issue view <number>`
3. Confirm with user which issue we're working on
4. Assign yourself and add "in progress" label
5. Create a feature branch from up-to-date main: `git checkout main && git pull origin main && git checkout -b <branch>`
6. See the repo-specific rules for setup steps before coding: [Backend](backend.md), [Frontend](frontend.md), or the chatbot spec

## Planning Mode (Mandatory First Step)

- Output a concise plan before writing code
- Identify modules/components affected and design patterns to use
- Flag potential security risks (OWASP)
- If less than 90% sure about intent, ask clarifying questions
- **Documentation step required:** Every plan must include a documentation update step. If the change introduces new architecture patterns, structure decisions, or conventions, update all relevant docs:
  - `README.md` — file map, "where to find" sections, workflow guidance
  - `../chillist-docs/rules/<service>.md` — new conventions or patterns to follow in future work
  - `../chillist-docs/guides/<service>.md` — "What's next" progress, setup changes
  - `../chillist-docs/dev-lessons/<service>.md` — lessons learned, architecture decisions
  - `../chillist-docs/specs/mvp-v1.md` — feature status updates
  - `../chillist-docs/current/status.md` — update when features are added, changed, or removed
  - Even if no docs need updating, the plan must explicitly state "No docs changes needed" with reasoning

## Implementation Flow

1. **Structure First:** Break tasks into small functions/components. Show signatures/interfaces only
2. **Wait for Approval:** Do not implement until reviewed
3. **One by One:** Implement each function individually — never generate large code blocks unless explicitly asked

## Change → Test → Run → Confirm (Mandatory)

Every code change must follow this sequence before moving on:

1. **Make the change** — edit the source file(s)
2. **Update tests** — immediately update any tests affected by the change (assertions, locators, mock data, expected values). If the change alters behavior, the tests must reflect the new behavior
3. **Run the tests** — execute the relevant test suite and verify all updated tests pass
4. **Confirm** — only after tests pass, report completion to the user

**NEVER** make a code change and present it as done without updating and running the affected tests. A change is not complete until the tests prove it works.

## Code Standards

- No comments in code (exception: complex "why" logic that is non-obvious)
- No lazy coding: never use `// ... rest of code` or placeholders. Always output the full correct block
- Read the target file's existing imports, types, and indentation style before generating code
- Pin dependency versions exactly (no `^` or `~` ranges) to prevent supply chain attacks

## File Permissions

- Allowed to update `.env` file when adding/modifying environment variables
- Always update `.env.example` when adding new env vars (without actual values)

## Environment Variables

`.env.example` is the single source of truth for env vars. It must only contain **active, uncommented** vars — never commented-out legacy entries.

**Before pushing**, when an env var was added or removed, verify all 6 locations are in sync:

1. **`.env.example`** — var present with descriptive comment (no actual secrets)
2. **`.env`** — actual value set locally
3. **GitHub repo settings** — added as a variable (public values) or secret (sensitive values)
4. **Workflow files** (`.github/workflows/*.yml`) — referenced with correct source (`vars.*` for variables, `secrets.*` for secrets)
5. **Deploy validation step** — included **only if the app fails without it** (throws an error, not falls back to a default)
6. **Guides doc** — GitHub secrets/vars table updated

When removing an env var: reverse all 6 steps.

**Do NOT** add env vars to deploy validation if the code falls back to a default (e.g., `import.meta.env.X || ''`). Only validate vars the app **requires** to start.

## Security (OWASP Top 10)

- **NEVER** output API keys, passwords, or tokens. Warn immediately if hardcoded secrets are found
- Assume all input is malicious — use Zod for strict typing and parameterized queries for SQL

## Debugging

- Stop on test or build failures — do not proceed to the next step
- Do not randomly patch. Analyze the stack trace and explain the root cause before fixing

## Git Branch Policy

- **NEVER** push directly to `main` or `staging`
- **NEVER** use `--no-verify` (or `-n`) on `git push` or `git commit`. Husky hooks exist to prevent broken code from being pushed. If hooks fail, fix the underlying issue — never bypass them.
- Always create a feature branch and push to that branch
- Use Pull Requests to merge into main
- All PRs require passing CI checks (lint, typecheck, tests, build)

## Git Workflow

### New branch (first commit)

1. Stash current changes
2. Switch to main and pull latest: `git checkout main && git pull origin main`
3. Create a new feature branch with an appropriate name from main
4. Pop the stash to apply changes on the new branch
5. Stage and commit with a clear message
6. If a related GitHub issue exists, include `Closes #XX` in the commit message
7. **Sync with main before push:** `git fetch origin main && git merge origin/main`
   - If conflicts arise, resolve them, run validation (`typecheck`, `lint`, `test:unit`), then `git add -A && git commit --no-edit`
8. Push the branch: `git push -u origin <branch-name>`
9. Create a PR immediately after push using `gh pr create`
   - Include `Closes #XX` in the PR body if there is a related issue

### Existing branch (subsequent commits / before push)

**ALWAYS** sync with main before pushing to avoid PR conflicts:

1. Stage and commit your changes on the feature branch
2. **Sync with main:** `git fetch origin main && git merge origin/main`
3. If conflicts arise, resolve them, run validation (`typecheck`, `lint`, `test:unit`), then `git add -A && git commit --no-edit`
4. Push the branch: `git push`
5. If creating a PR: `gh pr create` — include `Closes #XX` in the body if there is a related issue

## Pull Request Description Format

Every PR description must include:

1. **What was done** — concise summary of the changes and why
2. **Production test checklist** — manual steps to verify the feature works on production after merge/deploy
3. **Closes issues** — list issues this PR closes (e.g., `Closes #123, Closes #456`)

**Do NOT include:**

- Local test results (e.g., "851 tests pass", "typecheck clean")
- File change lists or line counts
- Implementation details that belong in the commit message, not the PR

### Template

```markdown
## Summary

<What was done and why>

## Test on Production

- [ ] <Step 1>
- [ ] <Step 2>
- [ ] ...

## Closes

Closes #XX, Closes #YY
```

## Version Bumps

- Bump the `version` in `package.json` on every commit using [semver](https://semver.org):
  - `patch` (1.0.X) — bug fixes, small changes, refactors
  - `minor` (1.X.0) — new features, new UI behaviors
  - `major` (X.0.0) — breaking changes
- Include the version bump in the same commit as the code change, not as a separate commit

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `refactor:` — Code refactoring
- `test:` — Adding or updating tests
- `chore:` — Maintenance tasks

## Bug Workflow

1. If a bug fix has no existing GitHub issue, create one before committing:
   `gh issue create --label bug --title "<short description>" --body "<details>"`
   Include: what went wrong, root cause, and what was fixed
2. If an existing issue covers the bug, use that issue number
3. The PR must include `Closes #XX` to auto-close the bug issue on merge

## Dev Lessons Log

After fixing any bug, configuration mistake, or non-obvious problem, add an entry to the relevant dev-lessons file in chillist-docs:

- Backend lessons: `../chillist-docs/dev-lessons/backend.md`
- Frontend lessons: `../chillist-docs/dev-lessons/frontend.md`
- Chatbot lessons: `../chillist-docs/dev-lessons/chatbot.md`

Entry format:

```markdown
### [Category] Short Title

**Date:** YYYY-MM-DD
**Problem:** One sentence describing what went wrong
**Solution:** One sentence describing the fix
**Prevention:** How to avoid this in the future
```

Categories: `Config`, `Deps`, `Logic`, `Types`, `Async`, `Test`, `Infra`, `Arch`
