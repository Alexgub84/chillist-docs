# Backend Dev Lessons

A log of bugs fixed and problems solved in `chillist-be`.

*(Note: All lessons prior to 2026-03-02 have been distilled into `rules/backend.md` to save context tokens. Only add NEW lessons here.)*

---

<!-- Add new entries at the top -->

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
