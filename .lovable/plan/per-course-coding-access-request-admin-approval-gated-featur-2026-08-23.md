# Per-Course Coding Access: Request → Admin Approval → Gated Features

Add a "Does this course require coding exercises?" (Yes/No) field to the Upload Course Materials step. "Yes" creates an admin approval request; approval gates the student Code terminal, coding resources in the lesson plan, and (later) Judge0 execution and Judge0-scored code questions. "No" (the default) preserves today's behavior and hides all coding surfaces.

## Decisions confirmed

- Lesson-plan generation prompts: unchanged this phase (deeper integration decided later) — this phase only gates UI surfaces.
- Target mastery model: code questions scored by Judge0 test-case pass rate feeding the existing 80/20 attempt scoring — design documented, built in a later phase.
- Admin approval lives in the existing Course dialog on /admin/courses.
- Judge0 execution is NOT wired this phase — gating scaffolding only.

## Current state (verified)

- `courses` table has no coding-related columns.
- `CodingTerminalWidget.tsx` is a placeholder (Judge0 TODO); the "Code" button in `src/pages/student/AIChat.tsx` (study mode) is visible to ALL students today — ungated.
- `generate-lesson-plan` inserts 1 coding-exercise resource per non-exam week unconditionally; the lesson-plan editor (`CourseCreation.tsx`) offers an "Industry Exercise" (coding-exercise) resource type to everyone.
- Admin course management UI: `src/components/admin/CourseProfileDialog.tsx`.

## Phase 1 — Database: per-course coding access status

Migration on `public.courses` (no new table, no new GRANTs needed — ALTER of an existing granted table):

- `coding_access_status text NOT NULL DEFAULT 'none'` — values: `none` | `pending` | `approved` | `rejected`.
- `coding_requested_at timestamptz`, `coding_reviewed_at timestamptz`, `coding_reviewed_by uuid REFERENCES profiles(id)` — all nullable.
- Validation trigger `courses_coding_access_guard` (BEFORE UPDATE, security definer):
  - Teachers (course members) may only transition `none`/`rejected` → `pending` (requesting). They cannot self-approve or set reviewer fields.
  - Only `is_admin(auth.uid())` may set `approved`/`rejected` or write `coding_reviewed_*`.
  - Service role bypasses (edge functions, wipes).

## Phase 2 — Upload step UI (CourseMaterials.tsx)

- New card "Coding Exercises" with the question "Does this course require coding exercises?" and Yes/No radio.
- **No** → sets `coding_access_status = 'none'`. Nothing else changes; no coding UI appears anywhere for the course.
- **Yes** → sets status `pending`, shows an "Awaiting admin approval" info badge; explanatory copy that terminal/coding features unlock on approval.
- Status display: Approved (success badge), Rejected (destructive badge + option to request again), Pending (warning badge).
- Choice is editable later; changing Yes→No after approval requires admin revoke (handled in the admin dialog), so the teacher cannot silently disable an approved course's history.

## Phase 3 — Admin approval (CourseProfileDialog.tsx on /admin/courses)

- New "Coding access" section: current status, requester timestamp, Approve / Deny buttons for `pending` courses, and Revoke for `approved` courses.
- Approve/Deny writes `coding_access_status`, `coding_reviewed_at`, `coding_reviewed_by` (allowed by the Phase 1 trigger for admins only).
- Optional: badge on the /admin/courses row for courses with `pending` requests so they're discoverable.

## Phase 4 — Feature gating (frontend + shared hook)

- New hook `src/hooks/useCodingAccess.ts`: reads `coding_access_status` for the active course, returns `{ ready, status, isApproved }` with the same "most restrictive until ready" pattern as `useTeacherNavPermissions`.
- Gate these surfaces on `isApproved`:
  - Student chat "Code" button + `CodingTerminalWidget` render (`AIChat.tsx` lines ~1558, ~1677).
  - "Industry Exercise" (coding-exercise) resource option in the lesson-plan editor (`CourseCreation.tsx`); hide existing coding-exercise resource chips from student-facing learning path for non-approved courses.
- Non-approved courses keep the current lesson-plan interface and existing scoring logic untouched.
- Note for future: any Judge0 edge function must re-check `coding_access_status = 'approved'` server-side (defense in depth), not rely on the hidden button.

## Phase 5 (documented, NOT built) — Judge0 execution + code questions

- `run-code` edge function (Judge0 proxy, server-side approval check, language allowlist from course settings).
- New `code` question format: Judge0 test-case pass rate becomes the accuracy signal feeding `_shared/attempt-scoring.ts` (80% accuracy / 20% pace unchanged); mastery aggregation (beta shrinkage + EMA) unchanged.
- Coding-specific lesson-plan generation prompts (deeper integration) decided at that point.

## Risks & constraints

- **Behavior change for existing courses:** all existing courses default to `none`, so the currently visible Code button disappears for them until a professor requests and an admin approves. This is intended by the feature but worth communicating.
- **Already-generated lesson plans** may contain coding-exercise resources for courses that answer "No" — Phase 4 hides them in UI; a data cleanup is out of scope.
- **Transition abuse** (Yes→No→Yes flip-flopping) is constrained by the DB trigger, not just the UI.
- **Collaborators:** any course teacher (owner or `course_teachers` member) may submit the request; approval is per course, so all teachers and students of that course get access at once.
- **No changes** to `update-mastery`, `attempt-scoring`, or any generator prompts this phase — scoring stays fully standardized.

## Verification

- Teacher flow: select No → no coding UI anywhere; select Yes → pending badge; admin approves → Code button appears in student chat; admin revokes → it disappears.
- Non-admin cannot self-approve (trigger test).
- Full frontend test suite green; existing scoring tests untouched and passing.
