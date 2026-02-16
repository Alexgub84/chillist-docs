# Frontend Rules

Rules specific to the `chillist-fe` repository. Use alongside [common rules](common.md).

---

## Before Coding (after common Starting Work steps)

- Sync the OpenAPI spec and generated types: `npm run api:sync`

## Code Standards (FE-Specific)

- Use `clsx` for all dynamic or conditional `className` values — never use template literals or string concatenation for classNames
- Every API mutation function (`create*`, `update*`) must validate input with `.parse()` before sending — catch bad data client-side, not on the server
- If multiple API functions follow the same pattern, audit them all for consistency when fixing one

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
2. **E2E mock fixtures** (`tests/e2e/fixtures.ts`) — `buildPlan`, `buildItem`, `buildParticipant` factories and `mockPlanRoutes`/`mockPlansListRoutes` route handlers must return response shapes that match the OpenAPI response schemas
3. **Mock server for local dev** (`api/server.ts`) — request schemas, response shapes, and status codes must match OpenAPI definitions
4. **Mock data** (`api/mock-data.json`) — all values must satisfy the schemas above (valid UUIDs, RFC 3339 dates, `null` not `""` for nullable fields)
5. **Tests** — all mock/fixture data in unit and e2e test files must use valid formats matching the schemas

### E2E Mock Fixture Alignment

When an API endpoint changes (new fields, renamed fields, new endpoints), update `tests/e2e/fixtures.ts`:

- **Interfaces** — `MockPlan`, `MockItem`, `MockParticipant` must match the API response schemas
- **Builder functions** — `buildPlan`, `buildItem`, `buildParticipant` must produce valid response objects with all required fields
- **Route handlers** — `mockPlanRoutes`, `mockPlansListRoutes` must handle the same HTTP methods and URL patterns as the real API
- **POST/PATCH handlers** — must read the request body and update mock state consistently (e.g., POST adds to array, PATCH merges updates)

### Mock Server Endpoint Alignment (local dev)

For every path in `openapi.json`, verify the mock server (`api/server.ts`):

- **Exists** — every OpenAPI endpoint has a corresponding Fastify route
- **Method** — GET/POST/PATCH/DELETE matches
- **Request body validation** — Zod schema fields, required vs optional, enums, and constraints match the OpenAPI `requestBody` schema
- **Response status code** — matches the OpenAPI success response (e.g. 200, 201)
- **Response shape** — returned JSON matches the OpenAPI response schema
- **Path parameters** — validated the same way (e.g. `format: "uuid"`)

### Field-Level Checklist

- `format: "date-time"` → `z.string().datetime()` everywhere
- `nullable: true` + not required → `.nullish()` in frontend, `.nullable().optional()` in mock server and e2e fixtures
- `type: "integer"` → `.int()` everywhere
- `minLength` / `maxLength` → `.min()` / `.max()` everywhere
- `format: "uuid"` → IDs in mock data and e2e fixtures must be valid UUIDs (use `randomUUID()`)
- Required fields in OpenAPI → NOT `.optional()` in Zod, and present in e2e fixture builders
- Fields NOT in an OpenAPI request body → NOT accepted by the mock server's Zod schema

## Testing

- All tests live under `tests/` with sub-folders: `tests/unit/`, `tests/integration/`, `tests/e2e/`
- Test assertions must verify value **format correctness** (e.g. ISO 8601 dates end with `Z`), not just structural presence
- **E2E (Playwright):**
  - Use `page.route()` for all API mocking — no external mock server dependency
  - Use the shared fixtures in `tests/e2e/fixtures.ts` (`buildPlan`, `mockPlanRoutes`, etc.) to set up mock data
  - When adding a new API endpoint or changing response shapes, update `tests/e2e/fixtures.ts` FIRST, then write the test
  - **Add new tests to existing spec files** — only create a new spec file for a major new flow (e.g. a whole new page). Small features, bug fixes, and enhancements go into the existing `main-flow.spec.ts` (plan detail) or `plans.spec.ts` (plans list) under the appropriate describe block
  - Don't test loading states — they are transient and flaky with fast API responses
  - Test final outcomes: wait for content or errors to appear, not spinners
  - Use specific URL patterns in `page.route()` (e.g. `**/localhost:3333/plans`) — broad patterns can intercept page navigation

## Finalization

1. Run validation: `npm run typecheck && npm run lint && npm run test:unit`
2. Fix any failures automatically
3. Ask for user confirmation
4. Follow the common [Git Workflow](common.md#git-workflow) (commit, push, PR)
