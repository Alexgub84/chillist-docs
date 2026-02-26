# Chillist Backlog

Use this file to capture upcoming work as issue candidates. Each item should be small enough to become a single GitHub issue.

## Task Template

- **Title:**
- **Goal:**
- **Scope:**
  - In:
  - Out:
- **Acceptance Criteria:**
  - [ ]
  - [ ]
- **Notes:**
- **Dependencies:**
- **Related Spec Sections:**
- **Priority:** P0 | P1 | P2

## Task Backlog

- **Title:** Guest preferences save route
  - **Goal:** Implement `PATCH /plans/:planId/invite/:inviteToken/preferences` so guests can save preferences without 404
  - **Priority:** P0

- **Title:** Unify Invite Page and Plan Page UI components
  - **Goal:** The guest invite route (Invite Page) and the authenticated plan route (Plan Page) should reuse the same UI components and forms as much as possible, while enforcing role based limitations.
  - **Scope:**
    - In:
      - Shared components for plan header, participants list, items list, item editor, assignment UI, preferences UI
      - A single "Plan View" composition with a mode switch (authenticated vs guest) that controls permissions and visible fields
    - Out:
      - Duplicated separate implementations of the same forms per route
  - **Acceptance Criteria:**
    - [ ] Invite Page and Plan Page render from the same component set (no duplicated form logic)
    - [ ] Guest limitations are applied consistently (UI and API error handling)
    - [ ] Authenticated flow remains unchanged for signed users
  - **Notes:** Limitations will be refined and added as follow ups.
  - **Priority:** P0

- **Title:** Sync participant details from authenticated user on first login
  - **Goal:** When an invited participant signs up or logs in, the backend should link their auth user to the existing participant record and overwrite participant identity fields with the authenticated user profile details.
  - **Context:** Owner can create participant with `firstName`, `lastName`, `phone`, `email` and send invite. After invitee authenticates, their user profile may differ. Example: participant created as "Alex", user signs in as "Bob" and participant record must update to "Bob".
  - **Scope:**
    - In:
      - On successful auth for an invite link, backend resolves the participant record for that invite and associates it to the auth user id
      - Backend updates participant fields using the authenticated user profile: `firstName`, `lastName`, `email`, and `phone` (if available)
      - Precedence: auth profile wins over invite seeded values
    - Out:
      - Manual editing by the participant as a requirement
  - **Acceptance Criteria:**
    - [ ] Existing participant record is linked to the authenticated user (no duplicate participant created)
    - [ ] Participant identity fields are updated to match the authenticated user profile after login
    - [ ] Works for sign up and login flows
  - **Notes:** If auth profile lacks some fields (eg phone), keep existing participant value for those fields.
  - **Priority:** P0

- **Title:** Fix participant filter selected state styling on Plan Page
  - **Goal:** When filtering items by participant on the Plan Page, the selected participant indicator should use a single consistent background color style across the entire row (no mixed or inconsistent colors within the same line).
  - **Acceptance Criteria:**
    - [ ] Selected participant row has one consistent background style across the full row width
    - [ ] Non selected rows remain visually distinct
    - [ ] Works across hover, active, and focus states
  - **Priority:** P1

- **Title:** Reuse participant details form across Create Plan and Add Participant
  - **Goal:** The owner flow "Add Participant" on the Plan Page must use the same participant details form as the Create Plan flow. No duplicated form UI or validation logic.
  - **Scope:**
    - In:
      - Extract participant form into a shared component if it is not already
      - Create a shared forms folder (eg `components/forms` or `components/shared/forms`) and move the participant form there
      - Use the shared form in both Create Plan and Add Participant
    - Out:
      - Maintaining two separate participant forms
  - **Acceptance Criteria:**
    - [ ] Create Plan and Add Participant render the same participant form component
    - [ ] Same fields, validation, and error messaging in both places
    - [ ] No duplicated form logic between the two flows
  - **Priority:** P0

- **Title:** Restore event details section on Invite Page
  - **Goal:** The Invite Page should display the same event details as the Plan Page (title, date, location, description, etc.), but must not show participant management (owner only).
  - **Acceptance Criteria:**
    - [ ] Invite Page shows the full event details section matching Plan Page content
    - [ ] Participant management UI is hidden on Invite Page (and remains owner only)
    - [ ] Styling and layout are consistent with Plan Page where applicable
  - **Priority:** P0

- **Title:** Unify Create Item and Update Item flows between Invite Page and Plan Page
  - **Goal:** The Invite Page must use the exact same Create Item and Update Item components and behavior as the Plan Page. No separate implementation on the invite route.
  - **Scope:**
    - In:
      - Reuse the same item create and item edit forms/components
      - Share the same validation, defaults, and UI states
    - Out:
      - Maintaining invite specific item create or edit components
  - **Acceptance Criteria:**
    - [ ] Create Item UI on Invite Page is identical to Plan Page (same component)
    - [ ] Update Item UI on Invite Page is identical to Plan Page (same component)
    - [ ] No duplicated form logic for item create or edit across the two routes
  - **Priority:** P0

- **Title:** Prevent iOS input focus zoom breaking page zoom
  - **Goal:** On mobile (notably iOS Safari), focusing the item name input in the Add Item flow triggers automatic zoom in and leaves the page stuck at a broken zoom level. Prevent the focus zoom or ensure the page returns to normal zoom without user friction.
  - **Acceptance Criteria:**
    - [ ] Focusing the item name input does not cause disruptive zoom behavior on iOS
    - [ ] If any zoom occurs, the page returns to normal scale automatically on blur or submit
    - [ ] No layout shift or stuck zoom after adding an item
  - **Priority:** P0

- **Title:** Decide and implement profile sync strategy (Supabase Auth vs backend participant data)
  - **Goal:** Resolve whether the app should persist user profile changes only in Supabase or also mirror them in the backend database, then implement the chosen approach.
  - **Problem:** Today the Profile Page updates only Supabase. Backend participant records may become stale unless refreshed from Supabase on fetch or on login.
  - **Options to evaluate:**
    - A) Backend as source of truth: Add a backend endpoint to update profile fields (`firstName`, `lastName`, `email`, `phone`, etc.) and update participant records accordingly.
    - B) Supabase as source of truth: Do not store or update these fields in the backend beyond linkage; always derive them from Supabase on fetch and on session connect.
  - **Acceptance Criteria:**
    - [ ] Clear decision documented (which system is source of truth for each field)
    - [ ] No stale identity data shown in the app after a user edits their profile
    - [ ] If option A chosen: backend endpoint exists and FE calls it after Supabase update
    - [ ] If option B chosen: backend responses consistently reflect Supabase profile values
  - **Priority:** P1

- **Title:** Open invite link with owner approval (join requests flow)
  - **Goal:** Support sharing a single plan invite link publicly (or to multiple people) where users can request access, and the plan owner approves or rejects each request before they become participants.
  - **User Flow:**
    - Owner generates a shareable plan link (no per participant pre creation).
    - Invitee opens link.
    - Invitee signs in with Google (Supabase).
    - If not approved yet, invitee sees "Request pending owner approval".
    - Owner views join requests list inside the plan and can approve.
    - After approval, invitee becomes a participant and can access the plan.
  - **Backend Requirements:**
    - Create a `plan_join_requests` table (or similar) keyed by `planId` and `supabaseUserId`.
    - Store request metadata and user details snapshot (name, lastName, email, phone if available), timestamps, status: `pending | approved | rejected`.
    - Add endpoints:
      - Create join request
      - List join requests (owner only)
      - Approve join request (owner only) which creates or links a participant record and associates it with `supabaseUserId`
      - Optional: reject request
    - Authorization rules:
      - Only owner can list and approve.
      - User can only create or view their own pending status for a plan.
  - **Frontend Requirements:**
    - Owner UI: "Share link" and "Join requests" section with approve action.
    - Invitee UI: Sign in gate, pending state screen, and success state after approval.
  - **Acceptance Criteria:**
    - [ ] Owner can generate a single invite link and share it
    - [ ] Signed in user can request to join a plan via the link
    - [ ] User cannot access plan data until approved
    - [ ] Owner can see pending requests and approve them
    - [ ] After approval, the user becomes a participant linked by `supabaseUserId` and can access the plan
  - **Notes:** Decide whether the share link is fully public or still contains a static token (plan level token) to reduce random discovery.
  - **Priority:** P0
