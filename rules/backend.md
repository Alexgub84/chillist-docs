# Backend Rules

Rules specific to the `chillist-be` repository. Use alongside [common rules](common.md).

---

## Starting Work

1. Fetch the GitHub issue assigned to this task: `gh issue view <number>`
2. Confirm with user which issue we're working on
3. Assign yourself and add "in progress" label
4. Create a feature branch from up-to-date main: `git checkout main && git pull origin main && git checkout -b <branch>`
5. Implement the feature/fix per the issue description

## File Permissions

- Allowed to update `.env` file when adding/modifying environment variables
- Always update `.env.example` when adding new env vars (without actual values)

## Schema Design

- Use `src/schemas/` folder with schemas that have `$id`, register via `registerSchemas(fastify)`, reference in routes with `{ $ref: 'SchemaName#' }`
- Never define schemas inline in routes
- Don't encode conditional business rules in JSON Schema — use a simple flat schema for validation, enforce business rules in the handler
- Avoid OpenAPI-only keywords (`discriminator`, `xml`, `externalDocs`) in schemas that AJV validates

## Dependency Injection

- Use DI pattern: `buildApp({ db })` accepts dependencies
- Routes use `fastify.db` from context
- Tests inject testcontainer db
- Never import db directly in routes

## CORS

- Explicitly list all HTTP methods the API uses: `methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS']`
- Whenever adding a route with a non-simple HTTP method (PATCH, DELETE, PUT), verify the CORS config allows it
- Don't include environment-specific URLs in the OpenAPI spec — let clients configure their own base URL

## API Key Middleware

- Any `onRequest` middleware that checks headers (auth, API key) must explicitly skip `OPTIONS` preflight requests
- Browsers cannot send custom headers on preflight, so OPTIONS must be exempt

## OpenAPI Spec

- The backend owns the OpenAPI spec — it is the source of truth
- When API routes or schemas change, run `npm run openapi:generate` and commit the updated `docs/openapi.json`
- Don't hardcode localhost in OpenAPI servers — removed entirely
- Only type responses that clients actually parse; error responses often just need a status code check

## Bug Workflow

1. If a bug fix has no existing GitHub issue, create one before committing:
   `gh issue create --label bug --title "<short description>" --body "<details>"`
   Include: what went wrong, root cause, and what was fixed
2. If an existing issue covers the bug, use that issue number
3. The PR must include `Closes #XX` to auto-close the bug issue on merge

## Finalization (BE-Specific)

1. Run validation: `npm run typecheck && npm run lint && npm run test:run`
2. Fix any failures automatically
3. If API routes or schemas changed, run `npm run openapi:generate` and commit updated `docs/openapi.json`
4. Ask for user confirmation
5. Follow the Git Workflow sequence (commit, push, PR)
