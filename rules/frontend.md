# Frontend Rules

Rules specific to the `chillist-fe` repository. Use alongside [common rules](common.md).

---

## Starting Work

1. Fetch the GitHub issue assigned to this task: `gh issue view <number>`
2. Confirm with user which issue we're working on
3. Assign yourself and add "in progress" label
4. Create a feature branch from up-to-date main: `git checkout main && git pull origin main && git checkout -b <branch>`
5. Sync the OpenAPI spec and generated types: `npm run api:sync`
6. Implement the feature/fix per the issue description

## Code Standards (FE-Specific)

- Use `clsx` for all dynamic or conditional `className` values — never use template literals or string concatenation for classNames

## Route Files (TanStack Router)

- Default to **lazy routes** (`createLazyFileRoute` + `.lazy.tsx` suffix) for code-splitting
- Only use a non-lazy route (`createFileRoute` + plain `.tsx`) when the route needs eagerly-loaded features: `loader`, `beforeLoad`, search param validation, or other non-component route config
- The root route (`__root.tsx`) must always remain non-lazy

## OpenAPI Schema Alignment

### Source of Truth

The **backend** owns the OpenAPI spec. The frontend only **consumes** it.

- `src/core/openapi.json` is gitignored and fetched from the backend via `npm run api:fetch`
- **NEVER** edit `src/core/openapi.json` directly in the frontend repo
- To update the spec, make changes in the backend first, then run `npm run api:sync` to pull + regenerate types
- If you need a new field or endpoint, it must be implemented in the backend first

### Layer Checklist (update in this order when spec changes)

1. **Frontend Zod schemas** (`src/core/schemas/`) — mirror OpenAPI format constraints (`date-time` → `.datetime()`, `nullable` → `.nullish()`, `integer` → `.int()`, `maxLength` → `.max()`)
2. **Mock server request schemas** (`api/server.ts`) — create/patch Zod schemas must match the OpenAPI request body definitions (same required fields, same enums, same constraints)
3. **Mock server response behavior** (`api/server.ts`) — endpoints must return the correct HTTP status codes and response shapes defined in OpenAPI
4. **Mock data loader schemas** (`api/mock.ts`) — Zod schemas for loading persisted data must accept the same field shapes as the OpenAPI response schemas
5. **Mock data** (`api/mock-data.json`) — all values must satisfy the schemas above (valid UUIDs, RFC 3339 dates, `null` not `""` for nullable fields)
6. **Tests** — all mock/fixture data in test files must use valid formats matching the schemas

### Mock Server Endpoint Alignment

For every path in `openapi.json`, verify the mock server (`api/server.ts`):

- **Exists** — every OpenAPI endpoint has a corresponding Fastify route
- **Method** — GET/POST/PATCH/DELETE matches
- **Request body validation** — Zod schema fields, required vs optional, enums, and constraints match the OpenAPI `requestBody` schema
- **Response status code** — matches the OpenAPI success response (e.g. 200, 201)
- **Response shape** — returned JSON matches the OpenAPI response schema
- **Path parameters** — validated the same way (e.g. `format: "uuid"`)

### Field-Level Checklist

- `format: "date-time"` → `z.string().datetime()` everywhere
- `nullable: true` + not required → `.nullish()` in frontend, `.nullable().optional()` in mock server
- `type: "integer"` → `.int()` everywhere
- `minLength` / `maxLength` → `.min()` / `.max()` everywhere
- `format: "uuid"` → IDs in mock data must be valid UUIDs
- Required fields in OpenAPI → NOT `.optional()` in Zod
- Fields NOT in an OpenAPI request body → NOT accepted by the mock server's Zod schema

## Finalization (FE-Specific)

1. Run validation: `npm run typecheck && npm run lint && npm run test:run`
2. Fix any failures automatically
3. Ask for user confirmation
4. Create commit on the feature branch and push to origin
5. Create PR linked to the issue
