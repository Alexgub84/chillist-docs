# Backend Dev Lessons

A log of bugs fixed and problems solved in `chillist-be`.

---

<!-- Add new entries at the top -->

### [Arch] Write Tests Alongside New Routes, Not After

**Date:** 2026-02-15
**Problem:** New invite routes were implemented and validated (typecheck + lint + existing tests pass) without writing any new tests. "All tests pass" only proved nothing was broken — not that the new endpoints work.
**Solution:** Added 15 integration tests for invite endpoints. Added a Testing section to backend rules requiring tests before finalization.
**Prevention:** Every new route or behavior change gets a matching test file written as part of implementation, not as a separate step. The finalization checklist now starts with "write tests" before "run tests."

---

## 2026-02-12: Always Create Feature Branch Before Making Changes

**Problem:** Started implementing code changes directly on the current branch without first creating a feature branch from main, violating the git workflow defined in `chillist-docs/rules/common.md`.

**Solution:** Must follow the git workflow: stash changes, checkout main, pull latest, create feature branch, pop stash, then commit.

**Prevention:** Before any code changes, always check git status and create a feature branch. Read `chillist-docs/rules/common.md` at the start of every session.

---

## 2026-02-11: API Key onRequest Hook Must Skip OPTIONS Preflight

**Problem:** The `onRequest` API key check ran on OPTIONS preflight requests. Browsers cannot send custom headers on preflight, so OPTIONS always got 401 — causing `@fastify/cors` and the hook to both call `reply.send()`, which Fastify 5 rejects as `FST_ERR_REP_ALREADY_SENT`.

**Solution:** Added `request.method === 'OPTIONS'` guard to skip preflight in the API key hook. Added CORS integration tests to prevent regression.

**Prevention:** Any `onRequest` middleware that checks headers (auth, API key) must explicitly skip OPTIONS. Add CORS preflight tests when touching auth hooks.

---

## 2026-02-11: CORS Must Explicitly Allow All HTTP Methods

**Problem:** `@fastify/cors` defaults to `GET, HEAD, POST` only. Adding PATCH/DELETE routes without updating CORS caused preflight rejections in production.

**Solution:** Added explicit `methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS']` to the CORS config.

**Prevention:** Whenever adding a route with a non-simple HTTP method (PATCH, DELETE, PUT), verify the CORS config allows it.

---

## 2026-02-09: AJV Strict Mode Rejects OpenAPI-Only Keywords

**Problem:** Used `discriminator` keyword in JSON Schema `oneOf` for the CreateItemBody schema. Fastify's AJV runs in strict mode and rejected it with "unknown keyword: discriminator".

**Solution:** Removed `discriminator` — AJV doesn't need it. Single-value enums in each sub-schema (`['equipment']` vs `['food']`) already act as natural discriminators for validation.

**Prevention:** Avoid OpenAPI-only keywords (`discriminator`, `xml`, `externalDocs`) in schemas that AJV validates. Use simple flat schemas when possible.

---

## 2026-02-09: Keep Schemas Simple — Handle Conditional Logic in Handlers

**Problem:** Tried to express "equipment items don't need unit, food items require unit" via `oneOf` with two sub-schemas and a discriminator. This caused AJV validation failures and added unnecessary complexity.

**Solution:** One flat `CreateItemBody` schema with `unit` optional. Handler checks: if food and no unit, return 400. If equipment, auto-set unit to `pcs`.

**Prevention:** Don't encode conditional business rules in JSON Schema. Use a simple flat schema for validation, enforce business rules in the handler.

---

## 2026-02-05: OpenAPI Schemas Must Use Centralized $ref System

**Problem:** Inline JSON schemas in routes cause duplication, are hard to maintain, and result in bloated OpenAPI spec.

**Solution:** Create `src/schemas/` folder with schemas that have `$id`, register via `registerSchemas(fastify)`, reference in routes with `{ $ref: 'SchemaName#' }`.

**Prevention:** Never define schemas inline in routes. Always create in `src/schemas/`, register in index.ts, use $ref.

---

## 2026-02-05: Don't Hardcode Localhost in OpenAPI Servers

**Problem:** OpenAPI spec had hardcoded `http://localhost:3333` in servers array, which gets committed and is irrelevant for frontend.

**Solution:** Removed `servers` section entirely — frontend configures API URL via its own environment variables.

**Prevention:** Don't include environment-specific URLs in OpenAPI spec. Let clients configure their own base URL.

---

## 2026-02-05: Don't Over-Engineer Error Response Schemas

**Problem:** Created separate HealthyResponse and UnhealthyResponse schemas for health endpoint, but 503 response body is never parsed by clients.

**Solution:** Single HealthResponse schema for 200 only. Unhealthy = any non-200 status, body doesn't matter.

**Prevention:** Only type responses that clients actually parse. Error responses often just need status code check.

---

## 2026-02-02: Use Dependency Injection for Testable Services

**Problem:** Routes imported db directly, making tests require env vars before module load and coupling code to specific implementations.

**Solution:** Use DI pattern — `buildApp({ db })` accepts dependencies, routes use `fastify.db` from context, tests inject testcontainer db.

**Prevention:** Always inject services into app, never import directly in routes. Entry point creates real services, tests create test services.
