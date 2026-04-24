# Backend issue: `POST /api/internal/plans` — add `ownerPreferences` for chatbot plan creation

Use this document as the body of a **chillist-be** GitHub issue.

**GitHub Issue:** https://github.com/Alexgub84/chillist-be/issues/207

---

## Suggested GitHub title

**feat(internal-api): accept ownerPreferences on POST /api/internal/plans for chatbot flow**

Suggested labels: `enhancement`, `api`

---

## Summary

When a user creates a plan via WhatsApp chatbot, the bot should collect their RSVP status (auto-confirmed since they're creating it), group size (adults/kids), and dietary preferences. Currently, `POST /api/internal/plans` only creates the plan and owner participant with default values — there's no way to pass owner preferences.

Extend the internal create-plan route to accept an optional `ownerPreferences` object. The BE applies these values to the owner participant row it creates.

---

## Current behavior

`POST /api/internal/plans` creates:
1. Plan record with title, dates, location, etc.
2. Owner participant row with:
   - `rsvpStatus: "pending"` (default)
   - `adultsCount: null`
   - `kidsCount: null`
   - `foodPreferences: null`
   - `allergies: null`

The chatbot cannot set owner preferences at creation time.

---

## Proposed change

Add optional `ownerPreferences` object to request body:

```json
{
  "title": "Camping Trip",
  "startDate": "2026-06-01",
  "ownerPreferences": {
    "rsvpStatus": "confirmed",
    "adultsCount": 2,
    "kidsCount": 1,
    "foodPreferences": "vegetarian",
    "allergies": "nuts"
  }
}
```

All fields in `ownerPreferences` are optional. The BE applies non-null values to the owner participant row.

---

## Schema

```typescript
ownerPreferences?: {
  rsvpStatus?: "pending" | "confirmed" | "not_sure",
  adultsCount?: number,      // integer >= 0
  kidsCount?: number,        // integer >= 0
  foodPreferences?: string,  // free text
  allergies?: string,        // free text
}
```

---

## Acceptance criteria

- [ ] `POST /api/internal/plans` accepts optional `ownerPreferences` object in request body
- [ ] When `ownerPreferences` is provided, the owner participant row is created with those values
- [ ] When `ownerPreferences` is omitted, behavior is unchanged (current defaults)
- [ ] OpenAPI / `docs/openapi.json` updated with new schema
- [ ] Integration tests: create plan with ownerPreferences, verify participant row has correct values
- [ ] Validation: rsvpStatus must be valid enum, adultsCount/kidsCount must be >= 0 if provided

---

## Implementation notes

In `src/routes/internal.route.ts` (or equivalent service):

1. After creating the plan record
2. When creating the owner participant row, merge `ownerPreferences` values:

```typescript
const ownerParticipant = {
  planId: plan.id,
  userId: request.internalUserId,
  role: 'owner',
  rsvpStatus: body.ownerPreferences?.rsvpStatus ?? 'pending',
  adultsCount: body.ownerPreferences?.adultsCount ?? null,
  kidsCount: body.ownerPreferences?.kidsCount ?? null,
  foodPreferences: body.ownerPreferences?.foodPreferences ?? null,
  allergies: body.ownerPreferences?.allergies ?? null,
  // ... other fields
};
```

---

## References

- Chatbot spec: [whatsapp-chatbot-spec.md](./whatsapp-chatbot-spec.md) — `POST /api/internal/plans`
- Participant schema: [user-management.md](./user-management.md) — participant fields
