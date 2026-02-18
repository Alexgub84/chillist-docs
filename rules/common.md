# Common Rules

Shared workflow rules for both frontend and backend repos.

---

## Issue-Driven Development

- GitHub Issues are the single source of truth for all planned work
- Every feature, enhancement, or task must have a corresponding GitHub issue before work begins
- Every bug must be filed as a GitHub issue before fixing
- Do NOT start coding without an issue to reference

## Starting Work

1. If working on a bug and no issue exists yet, create one first:
   `gh issue create --title "<title>" --label "bug" --body "<description>"`
2. Fetch the GitHub issue assigned to this task: `gh issue view <number>`
3. Confirm with user which issue we're working on
4. Assign yourself and add "in progress" label
5. Create a feature branch from up-to-date main: `git checkout main && git pull origin main && git checkout -b <branch>`
6. See [Frontend Rules](frontend.md) or [Backend Rules](backend.md) for repo-specific setup steps before coding

## Planning Mode (Mandatory First Step)

- Output a concise plan before writing code
- Identify modules/components affected and design patterns to use
- Flag potential security risks (OWASP)
- If less than 90% sure about intent, ask clarifying questions

## Implementation Flow

1. **Structure First:** Break tasks into small functions/components. Show signatures/interfaces only
2. **Wait for Approval:** Do not implement until reviewed
3. **One by One:** Implement each function individually — never generate large code blocks unless explicitly asked

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
- Always create a feature branch and push to that branch
- Use Pull Requests to merge into main
- All PRs require passing CI checks (lint, typecheck, tests, build)

## Git Workflow

When committing, follow this sequence:

1. Stash current changes
2. Switch to main and pull latest: `git checkout main && git pull origin main`
3. Create a new feature branch with an appropriate name from main
4. Pop the stash to apply changes on the new branch
5. Stage and commit with a clear message
6. If a related GitHub issue exists, include `Closes #XX` in the commit message
7. Push the branch: `git push -u origin <branch-name>`
8. Create a PR immediately after push using `gh pr create`
   - Include `Closes #XX` in the PR body if there is a related issue

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

- Frontend lessons: `../chillist-docs/dev-lessons/frontend.md`
- Backend lessons: `../chillist-docs/dev-lessons/backend.md`

Entry format:

```markdown
### [Category] Short Title
**Date:** YYYY-MM-DD
**Problem:** One sentence describing what went wrong
**Solution:** One sentence describing the fix
**Prevention:** How to avoid this in the future
```

Categories: `Config`, `Deps`, `Logic`, `Types`, `Async`, `Test`, `Infra`, `Arch`
