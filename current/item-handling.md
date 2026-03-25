# Item handling (BE + FE contract)

This document describes how items are created and updated in the backend, how authenticated and invite (guest) routes align, and where to change behavior.

## Backend layering

Code lives in the `chillist-be` repository.

- **Routes** (`src/routes/items.route.ts`, `src/routes/invite.route.ts`): JWT or invite-token auth, HTTP status mapping, `notifyItemChange`, logging.
- **Service** (`src/services/item.service.ts`):
  - `createPlanItems` — loads plan participant IDs once, validates each row via `prepareItemForCreate`, bulk insert, `recordItemCreated` per row.
  - `processItemUpdate` — `splitUpdatePayload`, access (`canEditItem` / guest path), assignment merge via `computeFinalAssignmentState` + `persistAssignments`, response filtering for non-owners, `recordItemUpdated`.
- **Pure helpers** (`src/utils/item-mutation.ts`): create preparation, update payload split, assignment merge rules, non-owner assignment validation.

New item endpoints should call `createPlanItems` / `processItemUpdate` instead of duplicating insert/update logic.

## Create behavior

- **Owner** can set `assignmentStatusList` and `isAllParticipants` on create. **Guests and non-owner participants** cannot; the API returns 400 if they send assignment fields.
- **`personal_equipment`** defaults `isAllParticipants` to `true`. If the resolved assignment list is empty and `isAllParticipants` is true, the backend fills `assignmentStatusList` with one `pending` entry per current plan participant (from `getPlanParticipantIds`). This fixes empty lists when the client omits assignments.
- **Unit**: food requires `unit`; equipment categories default to `pcs` where applicable (see `resolveItemUnit`).

## Update behavior

- Single payload shape: scalar fields plus optional `assignmentStatusList`, `isAllParticipants`, `unassign`.
- **Owners** can set any assignment state. **Non-owners** (JWT participants and invite guests) may only change their own assignment entry; attempts to set `isAllParticipants` or add others’ entries return 400. Guests get **403** when the item is not editable for them (e.g. assigned only to others); JWT users in the same logical situation may receive **404** (`Item not found`) per existing access checks — see `processItemUpdate` and `checkItemMutationAccess`.
- Responses for non-owners filter `assignmentStatusList` to the caller’s entry where applicable.

## Invite vs JWT

- Invite item routes use the same service functions with `isOwner: false`, `guestParticipantId` set, and a stub `access` object (`INVITE_GUEST_ACCESS`).
- OpenAPI descriptions on invite routes note personal-equipment defaults and owner-only assignment on create.

## Frontend notes

- After creating `personal_equipment` without explicit assignments, expect a full `assignmentStatusList` for all participants and `isAllParticipants: true`.
- Bulk create/update return `207` when some rows fail; always handle `errors` alongside `items`.
