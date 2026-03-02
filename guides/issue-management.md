# Issue Creation and Management

Shared instructions for creating and managing GitHub issues across chillist-be and chillist-fe. **When asked to create issues, read this guide first.**

---

## Repos

| Repo | Purpose |
|------|---------|
| **chillist-be** | Backend API, schema, migrations, auth |
| **chillist-fe** | Frontend UI, pages, components |

---

## Intent of Issues

- **Single source of truth** for planned work
- **Traceability** — every feature, enhancement, or bug has an issue
- **No coding without an issue** — always reference an issue before implementing

---

## Breaking Down Features

### 1. Analyze the feature

- Does it touch both BE and FE? → Create linked issues in both repos
- Backend-only (API, schema, internal)? → Create in chillist-be only
- Frontend-only (UI, styling, routing)? → Create in chillist-fe only

### 2. BE/FE split

For features spanning both repos:

| Backend (chillist-be) | Frontend (chillist-fe) |
|----------------------|------------------------|
| Schema, migrations | Types (from OpenAPI) |
| API endpoints | API client, data fetching |
| Auth, access control | Auth-aware UI, guards |
| Business logic | UI components, pages |

**Dependencies:** FE issues typically depend on BE. Create BE issue first, then FE issue with "Depends on chillist-be#&lt;number&gt;".

### 3. When to create a GitHub Project

**Create a new project when:** The feature has **more than one issue** (e.g. 1 BE + 1 FE, or multiple phased issues).

- Project groups related issues
- Use project board to track progress
- Name: e.g. "Join request flow", "Item wizard"

**Single-issue feature:** No project needed. Create the issue in the relevant repo.

### 4. If unsure

Ask the user:
- "Should I create a GitHub Project for this feature?"
- "Is this BE-only, FE-only, or both?"
- "How would you like to phase this (e.g. display first, actions later)?"

---

## Creating Issues

### Single-issue feature

```bash
gh issue create --repo Alexgub84/chillist-be \
  --title "Feature name" \
  --body "Description..."
```

Or for FE:

```bash
gh issue create --repo Alexgub84/chillist-fe \
  --title "Feature name" \
  --body "Description..."
```

### Multi-issue feature (BE + FE)

1. **Create BE issue first**
   ```bash
   gh issue create --repo Alexgub84/chillist-be --title "..." --body "..."
   ```
2. **Create FE issue** with dependency
   ```bash
   gh issue create --repo Alexgub84/chillist-fe --title "..." \
     --body "Depends on chillist-be#<N>. ..."
   ```
3. **Optionally create a project** and add both issues
   ```bash
   gh project create --owner Alexgub84 --title "Feature name"
   # Add issues to project via GitHub UI or gh project item-add
   ```

### Phased features

When a feature has clear phases (e.g. display first, actions later):

- Create separate issues per phase
- Mark dependencies: Phase 2 depends on Phase 1
- Optionally combine into one parent issue and reference child issues

---

## Issue Body Template

```markdown
## Summary
Brief description.

## Context
Why this is needed.

## Scope
- Task 1
- Task 2

## Dependencies
- Depends on chillist-be#N (if applicable)

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Out of Scope
- What is explicitly not included
```

---

## Linking BE and FE Issues

- In FE issue body: `Depends on chillist-be#117`
- In BE issue: No need to link FE (FE depends on BE, not vice versa)
- Use `Closes #N` in PR body to auto-close when merged

---

## Workflow Integration

**When the user asks to "create issue" or "create issues for a feature":**

1. Read this guide
2. Determine: single vs multi-issue, BE vs FE vs both
3. If multi-issue: ask if a GitHub Project should be created (if unsure)
4. Create issues in the correct repos
5. Add cross-repo links and dependencies
6. If project created: add issues to the project
