# Frontend Rules

Strict, minimal rules for `chillist-fe`. Use alongside [common rules](common.md).

## 1) Start Order (Required)

1. Read `README.md` in `chillist-fe`.
2. Identify target files using the route/folder maps.
3. Open only those files.
4. Open deep docs only when needed.

## 2) Non-Negotiables

- **Backend owns OpenAPI.** Frontend consumes it. Never hand-edit `src/core/api.generated.ts` or `src/core/openapi.json`.
- **Never build FE ahead of BE.** Never add fields/endpoints/enums in frontend before backend ships them.
- Use `clsx` for conditional `className` logic.
- Use lazy routes by default (`*.lazy.tsx` + `createLazyFileRoute`). Non-lazy only for route config (`loader`, search validation).
- Treat client auth/role checks as UX only. Backend is the security authority.

## 3) API and Schema Rules

- Mutation functions must validate request input with `.parse()` before sending.
- Response schemas should be strict on structure, lenient on backend date string formatting (`z.string()` for dates in responses, `.datetime()` for inputs).
- Keep schema/mock/fixtures aligned with OpenAPI:
  - `src/core/schemas/*`
  - `api/server.ts`
  - `tests/e2e/fixtures.ts`
- If one API function in a pattern is fixed, audit its siblings for the same issue.

## 4) Auth and Invite Rules

- Read JWT from `supabase.auth.getSession()` right before API calls. Do not cache tokens.
- On backend 401, refresh session and retry once; surface final auth failure with `AuthErrorModal`, not only a toast.
- For invite-auth linking flows, if ordering matters, await side effects before navigation.
- Never use silent `catch {}` in auth/invite paths.

## 5) UI, i18n, and Component Rules

- Extract repeated patterns into shared components when used in 3+ places.
- Use `data-testid` for E2E selectors; do not rely on brittle text/role in complex Headless UI transitions.
- For auth-gated UI changes, cover owner, non-owner authenticated, and unauthenticated states.
- All user-facing strings must use `t()` from `useTranslation()`. Add keys to both `en.json` and `he.json`.
- API enum values must be translated at display time (`t('namespace.${value}')`), not stored translated.

## 6) Testing Rules

- Every behavioral change requires matching test updates.
- Cross-boundary flow change (route + context + API + UI) requires integration or E2E coverage, not only unit tests.
- E2E should assert final outcomes, not transient loading states.
- For responsive flows, include mobile/desktop paths when UI differs (use Playwright's `isMobile`).
- Wrap async state updates (navigation, timers, provider mounts) in `act()` in unit tests.

## 7) Logging and Error Handling

- Every catch block must log context (module + key ids + error message).
- When showing `toast.error`, also log full error details.
- Never log full tokens/secrets. Truncate sensitive values.

## 8) Pre-Change Checklist

- Confirm backend already provides required contract fields/endpoints.
- Identify route, component, hook, API, and tests that the change touches.
- Confirm whether auth gating, i18n, and owner/admin conditions are affected.

## 9) Pre-Push Checklist

- Run:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test:unit`
- If API contract changed on backend, run `npm run api:sync`.
- Update `src/data/changelog.ts` for user-visible changes.
- Ensure changed behavior is reflected in tests.

## 10) Escalate Instead of Guessing

Stop and raise to user when:

- Feature needs backend fields/endpoints not in current OpenAPI.
- Requirement conflicts with existing security or contract rules.
- Expected behavior is ambiguous (ownership/auth/invite edge cases).
