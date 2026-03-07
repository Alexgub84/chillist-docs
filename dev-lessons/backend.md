# Backend Dev Lessons

A log of bugs fixed and problems solved in `chillist-be`.

*(Note: All lessons prior to 2026-03-02 have been distilled into `rules/backend.md` to save context tokens. Only add NEW lessons here.)*

---

<!-- Add new entries at the top -->

### [Infra] Drizzle migrator skips migrations with out-of-order timestamps
**Date:** 2026-03-07
**Problem:** Migrations 0016 and 0017 were never applied in production. Drizzle's migrator compares `created_at` (the `when` field from `_journal.json`) — it fetches `MAX(created_at)` from `__drizzle_migrations` and skips any migration whose timestamp is lower. Migration 0015 had a manually-set timestamp (`1772870400000`) that was later than 0016/0017's auto-generated timestamps, so they were silently skipped.
**Solution:** Fixed the `when` values in `_journal.json` so timestamps are strictly increasing. Added a CI check (`scripts/check-migration-order.ts`) that validates timestamp order before migrations run.
**Prevention:** Never manually set migration timestamps. After generating a migration on a feature branch, always rebase on main and verify the journal timestamps are monotonically increasing. The CI check now catches this automatically.

### [Arch] Expense access control: check participant ownership, not expense creator
**Date:** 2026-03-06
**Problem:** Initial expense PATCH/DELETE routes checked `expense.createdByUserId === request.user.id` to determine if a non-owner could edit. This meant that when the plan owner added an expense for participant B, participant B could not edit it — the expense was "owned" by whoever typed it in, not the person it was about.
**Solution:** Replaced `isCreator` check with `isExpenseParticipant`: look up the participant record for `expense.participantId` and check if `participant.userId === request.user.id`. Also added `checkPlanAccess()` to PATCH/DELETE so removed participants lose access entirely.
**Prevention:** For entities that belong to a participant (expenses, preferences, etc.), always authorize based on the participant linkage (`participant.userId`), not who happened to create the record. The "creator" may be the plan owner acting on someone's behalf.

### [Logic] GET /plans list only returned plans the user created, not plans they participate in
**Date:** 2026-03-05
**Problem:** The `GET /plans` endpoint filtered by `plans.createdByUserId`, so participants who joined via invite or join request never saw those plans in their list.
**Solution:** Replaced the `createdByUserId` filter with an `innerJoin` on the `participants` table filtered by `participants.userId`. Since the plan creator is always inserted as a participant with `role: 'owner'`, this covers both owned and joined plans.
**Prevention:** Always test list/query endpoints from the perspective of every user role (owner, participant, non-participant). When a query filters by ownership, ask: "are there other ways a user can be associated with this entity?" Write multi-user integration tests that verify visibility from each role's perspective.

### [API] Every route must declare all possible error status codes with descriptions in OpenAPI
**Date:** 2026-03-05
**Problem:** 20 error status codes were missing from route schemas (mostly 401 on JWT-protected routes). All existing error entries used "Default Response" as the description. The FE had no way to know which errors a given endpoint could return, and backend logs showed `statusCode: 400` with no context about the actual error message or request body.
**Solution:** Audited all 8 route files and added every missing error code (401, 404, 503). Added a `description` field to every error response entry (e.g. `'Bad request — check the message field for details'`, `'Authentication required — JWT token missing or invalid'`). Also added a global `onSend` hook in `app.ts` that logs a WARN for every 4xx response with request body and response message.
**Prevention:** When creating or updating a route, always declare every status code the handler can return — including 401 from auth hooks. Add a meaningful `description` to each response entry so the OpenAPI spec is self-documenting for FE developers.

### [API] Simplified item assignment API — unified item-object shape
**Date:** 2026-03-05
**Problem:** Item PATCH had four assignment-specific fields (`assignToAll`, `assignmentStatusList`, `forParticipantId`, `unassign`) with role-dependent semantics. FE had to branch on user role to pick the correct payload shape. Participants hit `400 "Only the plan owner can modify assignments"` when using the wrong fields.
**Solution:** Removed all action-hint fields. FE now sends the full desired `assignmentStatusList` array and `isAllParticipants` boolean on every create/update. Backend validates non-owners via diff (only their own entry may change). One payload shape for all users.
**Prevention:** Prefer "send the desired state" APIs over "send an action command" APIs. Action-hint fields multiply client complexity and create role-dependent branching bugs. When access control is needed, validate by diffing incoming vs current state server-side.

### [Arch] All-participants item assignment replaced groupId duplication with JSONB column
**Date:** 2026-03-05
**Problem:** The original "assign to all" model duplicated items (N copies with a shared `allParticipantsGroupId`). This made queries, updates, and lifecycle management (participant join/leave) complex and error-prone.
**Solution:** Replaced with a single `assignmentStatusList` JSONB column (`[{ participantId, status }]`) and `isAllParticipants` boolean on the items table. One item row per logical item. Migration backfilled and consolidated duplicates. Deleted `all-participants-items.service.ts`.
**Prevention:** For per-participant status on shared entities, use a JSONB array column rather than row duplication. It simplifies queries, avoids cascade/sync bugs, and makes lifecycle hooks (participant add/remove) trivial.

### [Arch] All-participants item assignment uses groupId + flat duplication (SUPERSEDED)
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
