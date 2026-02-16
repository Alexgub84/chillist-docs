# Backend Rules

Rules specific to the `chillist-be` repository. Use alongside [common rules](common.md).

---

## Before Coding (after common Starting Work steps)

No additional setup needed — start implementing.

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

## Version Bumping

Bump the version in `package.json` on every issue/PR:

- **Patch** (1.0.x): Bug fixes, small changes, no API impact
- **Minor** (1.x.0): New features, new routes, schema changes, DB migrations
- **Major** (x.0.0): Breaking changes that require FE coordination

## API Breaking Change Check

Before committing any change that touches routes, request/response schemas, or DB schema:

1. **Detect breaking changes** — Compare old vs new behavior:
   - Removed or renamed endpoints
   - New required fields in request body (was optional or didn't exist)
   - Removed fields from response
   - Changed response shape (e.g., flat object to nested, array to object)
   - Changed field types or enum values
2. **If breaking** — Keep the old route working alongside the new one:
   - The old request format must still be accepted (detect format and handle both code paths)
   - The old response shape should remain functional for existing FE code
   - Add `@deprecated` note in the route's OpenAPI summary
   - Create a GitHub issue to remove the deprecated route: `gh issue create --label "cleanup" --title "Remove deprecated <route> after FE update" --body "<details>"`
   - Add `fe-update-required` label to the PR
   - Once FE is updated and deployed, close the cleanup issue and remove the old code path
3. **If non-breaking** (additive fields, new optional params, new endpoints) — No action needed, proceed normally
4. **Always** run `npm run openapi:generate` after API changes and commit updated `docs/openapi.json`

## Error Logging

Use Fastify's built-in Pino logger (`request.log` or `fastify.log`). Every log statement must include relevant contextual data for debugging.

1. Always pass the error object as `err` (Pino serializes stack trace + message)
2. Include all relevant entity IDs for correlation (planId, itemId, etc.)
3. Write a human-readable message as the second argument describing what failed
4. Info logs for successful operations must include result metadata (count, ID)

```typescript
// BAD - no context, impossible to debug
request.log.error('Something went wrong')
request.log.error({ err: error }, 'Error')

// GOOD - full context: error object, entity IDs, readable message
request.log.error({ err: error, planId }, 'Failed to retrieve plan items')
request.log.error({ err: error, planId, itemId }, 'Failed to update item status')

// BAD - missing result metadata
request.log.info('Items retrieved')

// GOOD - includes entity ID and result count
request.log.info({ planId, count: items.length }, 'Plan items retrieved')
request.log.info({ itemId, planId }, 'Item created')
```

## Testing

- Every new route file must have a matching integration test file in `tests/integration/`
- Every new endpoint or behavior change must have test coverage **before** finalization
- Follow existing patterns: use `buildApp({ db })` with testcontainer, `seedTest*` helpers, `app.inject()` for requests
- Tests to write for new routes: happy path, validation errors (400), not found (404), cross-resource isolation, and any security/filtering behavior
- "All existing tests pass" is not sufficient — new code requires new tests
- Update `tests/helpers/db.ts` seed helpers when schema columns are added

### Combine Similar Tests

Use `it.each` to combine tests that follow the same pattern. Every case must still be covered.

```typescript
// BAD: repetitive tests with identical structure
it('returns 400 when name is missing', async () => { ... })
it('returns 400 when category is missing', async () => { ... })

// GOOD: combined with it.each, all cases still covered
it.each([
  ['name', { category: 'equipment', quantity: 1, status: 'pending' }],
  ['category', { name: 'Tent', quantity: 1, status: 'pending' }],
])('returns 400 when %s is missing', async (_field, payload) => {
  const response = await app.inject({ method: 'POST', url, payload })
  expect(response.statusCode).toBe(400)
})
```

### Avoid Redundant Tests

Do not write a separate test if its assertions are already fully covered by another test. For example, a "returns correct structure" test is redundant if the main happy-path test already asserts every property.

### When NOT to Combine

Keep tests separate when:
- They have meaningfully different setup or mock configurations
- Combining would make the test name unclear or the failure message unhelpful
- The logic being tested is fundamentally different (e.g., happy path vs error path)

## Finalization

1. Write tests for any new or changed functionality (see Testing section above)
2. Run validation: `npm run typecheck && npm run lint && npm run test:run`
3. Fix any failures automatically
4. If API routes or schemas changed, run `npm run openapi:generate` and commit updated `docs/openapi.json`
5. Run the API Breaking Change Check above
6. Ask for user confirmation
7. Follow the common [Git Workflow](common.md#git-workflow) (commit, push, PR)
