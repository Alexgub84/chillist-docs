# Backend Dev Lessons

A log of bugs fixed and problems solved in `chillist-be`.

*(Note: All lessons prior to 2026-03-02 have been distilled into `rules/backend.md` to save context tokens. Only add NEW lessons here.)*

---

<!-- Add new entries at the top -->

### [Arch] All-participants item assignment uses groupId + flat duplication
**Date:** 2026-03-03
**Problem:** Needed to support assigning equipment items to all participants — each participant gets their own copy with independent status, and the system auto-creates/deletes copies as participants join/leave.
**Solution:** Added `isAllParticipants` boolean + `allParticipantsGroupId` UUID to items table. When owner assigns to all, the original item is flagged and N-1 copies are created (one per other participant), all sharing the same groupId. Re-toggling reconciles with current participant roster (revives canceled copies, creates new ones for joiners). All multi-write operations use `db.transaction()` for atomicity. Core field updates (name, qty, unit) cascade across the group; status stays local per participant.
**Prevention:** For "assign to all" patterns, prefer flat duplication with a shared groupId over parent/child hierarchies. Use transactions for multi-write operations. Add idempotency guards (NOT EXISTS checks) for operations that may be retried.

### [Arch] Item change tracking uses separate table and fire-and-forget recording
**Date:** 2026-03-02
**Problem:** Needed to persist audit history for every item create/update (status changes, assignments, etc.) without slowing down or breaking the main API response.
**Solution:** Added `item_changes` table and `src/utils/item-changes.ts`. All 8 item mutation endpoints call `recordItemCreated` / `recordItemUpdated` after successful writes. Recording is fire-and-forget — errors are logged but never thrown, so a failed audit write cannot break the user's request.
**Prevention:** For audit/change-tracking features, use a separate table (not a JSONB column on the hot table) and fire-and-forget recording. This keeps item reads fast and ensures the main operation always succeeds.

### [Arch] Decouple business logic from route handlers into services
**Date:** 2026-03-02
**Problem:** Business logic (participant creation, user_details pre-fill) was embedded directly in route handlers (plans.route.ts, participants.route.ts, claim.route.ts). When join-request approval needed the same participant creation logic, there was no reusable function to call — only copy-paste from other handlers.
**Solution:** Extracted `addParticipantToPlan()` into `src/services/participant.service.ts`. The service is a pure function that receives `db` as its first argument — no Fastify coupling. Route handlers do orchestration (auth, validation, error responses) and delegate business logic to the service.
**Prevention:** Route handlers should only handle HTTP concerns (auth, validation, status codes, error formatting). When business logic is needed in 2+ routes or is complex enough to warrant its own tests, extract it to `src/services/` immediately. Services are the single place for side effects (notifications, activity logs) that should fire regardless of which route triggers the action.

### [Category] Short Title
**Date:** YYYY-MM-DD
**Problem:** One sentence describing what went wrong
**Solution:** One sentence describing the fix
**Prevention:** How to avoid this in the future
