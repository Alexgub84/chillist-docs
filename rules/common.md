# Common Rules

Shared workflow rules for both frontend and backend repos.

---

## Issue-Driven Development

- GitHub Issues are the single source of truth for all planned work
- Every feature, enhancement, or task must have a corresponding GitHub issue before work begins
- Every bug must be filed as a GitHub issue before fixing
- Do NOT start coding without an issue to reference
- If working on a bug and no issue exists yet, create one first:
  `gh issue create --title "<title>" --label "bug" --body "<description>"`

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
- Pin dependency versions exactly (no `^` or `~` ranges)

## Security (OWASP Top 10)

- **NEVER** output API keys, passwords, or tokens. Warn immediately if hardcoded secrets are found
- Assume all input is malicious — use Zod for strict typing and parameterized queries for SQL
- Pin dependency versions to prevent supply chain attacks

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

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `refactor:` — Code refactoring
- `test:` — Adding or updating tests
- `chore:` — Maintenance tasks

## Finalization

1. Run validation (build, lint, test)
2. Fix any failures automatically — do not ask for permission to fix
3. Ask for user confirmation
4. Follow the Git Workflow sequence (commit, push, PR)

## Dev Lessons Log

After fixing any bug, configuration mistake, or non-obvious problem, add an entry to `DEV-LESSONS.md` (or `dev-lessons.md`) with:

```markdown
### [Category] Short Title
**Date:** YYYY-MM-DD
**Problem:** One sentence describing what went wrong
**Solution:** One sentence describing the fix
**Prevention:** How to avoid this in the future
```

Categories: `Config`, `Deps`, `Logic`, `Types`, `Async`, `Test`, `Infra`, `Arch`
