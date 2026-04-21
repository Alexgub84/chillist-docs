# GitHub issue draft — chillist-be: `POST /api/internal/plans`

**Opened:** https://github.com/Alexgub84/chillist-be/issues/199

Use this file as the spec reference; the issue body was created from the **Body** section below.

**Title:** Implement `POST /api/internal/plans` for WhatsApp chatbot

**Body:**

## Summary

The WhatsApp chatbot exposes a `createPlan` tool that calls the app backend with `x-service-key` and `x-user-id`. The internal route is specified in [whatsapp-chatbot-spec.md](./whatsapp-chatbot-spec.md) (section *POST /api/internal/plans (Pending)*) but may not be implemented or deployed yet.

## Contract (from spec)

- **Method / path:** `POST /api/internal/plans`
- **Headers:** `x-service-key` (shared with chatbot), `x-user-id` (Supabase UUID)
- **Body (JSON):** `title` (required); optional `description`, `startDate`, `endDate`, `tags`, `defaultLang`, `estimatedAdults`, `estimatedKids`, `locationName` (ISO dates `YYYY-MM-DD` where applicable)
- **Response 201:** `{ "plan": { "id": "<uuid>", "name": "<string>", "date": "<iso|null>" } }`
- **Errors:** `400` validation, `401` auth

## Behaviour

- Resolve owner participant from `x-user-id` per spec (owner row + invite token); do not require owner PII in the request body.
- Align validation with public `POST /plans` where sensible (Zod / OpenAPI).

## Acceptance criteria

- [ ] Route implemented and registered under `/api/internal/*` with service-key auth
- [ ] OpenAPI / Fastify schema updated; `fe-notified` if contract changes
- [ ] Integration tests (create plan via internal route; assert participant ownership)
- [ ] Manual or staging check: chatbot `createPlan` against staging returns `201` and a real plan id

## References

- [whatsapp-chatbot-spec.md](./whatsapp-chatbot-spec.md) — internal plans section
- Chatbot client: `chillist-whatsapp-bot` `IInternalApiClient.createPlan`
