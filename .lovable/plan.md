# Coding exercises for coding/lab weeks

On `/teacher/setup/lesson-plan`, coding/lab weeks get a second section — **Coding Exercises** — below Concepts. A "Generate Coding Exercises" button (with professor-chosen quantity and language) generates industry-aligned exercises via AI. Each exercise carries: problem statement, language, input spec, output spec, constraints, example I/O, reference solution, standard test cases, and hidden/edge test cases with expected outputs. Professors review and edit everything, then explicitly publish. Students get a read-only view of published exercises on the learning path.

Resolved decisions: read-only student view included · explicit draft → publish · generate **appends** (never replaces) · one language per exercise.

## Phase 1 — Database (migration)

Two tables (split is a security requirement, see Risks):

- `coding_exercises` (student-visible fields): `course_id` FK, `week_number`, `position`, `title`, `problem_statement`, `language` (single, e.g. `python`), `input_spec`, `output_spec`, `constraints` (nullable), `examples` jsonb `[{input, output, explanation?}]`, `standard_test_cases` jsonb `[{input, expected_output}]`, `published` bool default false + `published_at`, `teacher_id`, timestamps (+ `update_updated_at_column` trigger).
- `coding_exercise_private` (teacher-only): `exercise_id` unique FK → `coding_exercises.id` ON DELETE CASCADE, `reference_solution` text, `hidden_test_cases` jsonb `[{input, expected_output}]`.

Grants + RLS:
- Both tables: `GRANT SELECT,INSERT,UPDATE,DELETE TO authenticated`, `GRANT ALL TO service_role`; no anon.
- `coding_exercises`: course teachers/collaborators (`is_course_member`) full access. Enrolled, non-suspended students may read **published** rows only, and only when the week itself is visible — policy uses `EXISTS (SELECT 1 FROM lesson_plan_weeks w WHERE w.course_id = ... AND w.week_number = ...)`; that subquery runs under the student's own RLS on `lesson_plan_weeks`, so locked/future weeks automatically hide their exercises.
- `coding_exercise_private`: `is_course_member` only. Students have no path to reference solutions or hidden tests.
- Types regenerate after approval.

## Phase 2 — Edge function `generate-coding-exercises`

Mirrors `generate-weekly-quiz` patterns:

- Auth: Bearer token → `auth.getClaims`; caller must be course teacher or collaborator.
- Server-side guards (never trust the client gate): course `coding_access_status = 'approved'`, target week exists in `lesson_plan_weeks` with `is_coding_week = true`, week has ≥1 concept.
- Input (Zod-validated): `course_id`, `week_number`, `count` (1–5), `language` (allowlist, default from course / `python`), optional `hint`.
- Generation: one exercise per gateway sub-call (parallel, like the quiz's chunked sub-calls) with tool-calling schema covering every required field; prompt frames exercises as industry-aligned (interview/workplace style) and grounded in the week's concepts; model is instructed to derive expected outputs from its own reference solution. Structural validation (non-empty statement/specs, ≥1 example, ≥1 standard + ≥1 hidden test, every test case has expected output) with one retry per failure. `loggedGatewayFetch` for AI logging.
- Persistence: inserts **draft** rows into both tables, `position` continuing after existing max (append semantics). Returns `{ generated, total_for_week }`.

## Phase 3 — Teacher UI (`CourseCreation.tsx`)

- For coding weeks, the currently hidden Weekly Quiz area becomes a **Coding Exercises** section: header + explainer, quantity input (1–5), language selector, `Generate Coding Exercises` button (Sparkles icon) with elapsed-time loading state. Handler mirrors `handleGenerateWeeklyQuiz`: upserts the week row first, then calls the function; toast reports appended count.
- Exercise list cards: title, language badge, draft/published badge, delete (Trash2), and View/Edit.
- New `CodingExerciseDialog` (modeled on `WeeklyQuizReviewDialog` but editable): text areas for statement/specs/constraints, language select, editable tables for examples / standard tests / hidden tests (add/remove rows), reference-solution code textarea. Saves update the two tables.
- Per-week `Publish exercises` / `Unpublish` button: flips `published` for that week's exercises (with count confirmation). Publish is blocked with a toast if any draft is missing required fields.
- Deleting a coding week warns that its exercises will be deleted too (cascade delete by `course_id`+`week_number`); week renumbering on drag-reorder updates exercises' `week_number` to follow.

## Phase 4 — Student read-only view

- `useLearningPlan` exposes published exercises per coding week (RLS already filters to published + visible weeks).
- `UnitPathwayCard` coding units render exercise cards: statement, language, input/output specs, constraints, examples, standard test cases. No reference solution, no hidden tests (impossible — separate table), no code execution.
- `StudentHome` "What to do today" for coding units links into the unit's exercise section.

## Tests

- Unit: exercise validation (required fields, test-case shape), append-position logic, publish-field completeness check.
- Component: section renders only for coding weeks and only when coding access is approved; quantity/language passed to handler; dialog edits persist; publish/unpublish flow.
- Edge: 401 unauthenticated, 403 non-teacher, 400 non-coding week / coding access not approved, invalid count/language rejected.

## Risks / constraints

- **Solution/test leakage (drives the schema):** RLS is row-level — reference solutions and hidden tests cannot live as columns on a student-readable table (same reason a jsonb blob on `lesson_plan_weeks` was rejected). The two-table split makes leaks structurally impossible; student code must never query `coding_exercise_private`.
- **Test cases are unverified:** Judge0 execution is still deferred, so expected outputs come from the AI and are not machine-checked. The prompt mitigates (derive outputs from the reference solution), but professor review before publish is the real gate — the publish button copy should say so.
- **DB-backed, not plan-draft-backed:** like quiz questions, exercises write to the DB on generation, not into the lesson-plan draft JSON. "Review before publishing" is enforced by the `published` flag, not the plan's Publish button. A clean-slate republish (`upsertPublishedWeeks`) or AI "Update Plan" that shifts concepts across weeks can leave exercises attached to a week whose concepts changed — accepted, since weeks keep their numbers; teachers re-publish exercises if they restructure.
- **Week renumbering:** drag-reorder renumbers weeks; exercises must follow (Phase 3) or they silently attach to the wrong week.
- **Append-only means duplicates are possible:** no auto-dedup this phase; the professor prunes via delete.
- **Legacy surfaces:** `TeachingPlan.tsx` won't show exercises (accepted limitation, same as coding-week badges).
