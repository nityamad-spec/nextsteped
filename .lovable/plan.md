## Explicit Publish / Unpublish for Mock Tests

Today "Approve Exam" is only a teacher-side readiness flag. Student visibility is actually driven by two implicit conditions: (a) the exam is not archived in `course_exams`, and (b) `assessment_questions` exist for that `exam_id`. That means as soon as a teacher approves and questions land, students see it — with no way to hide a mock test short of archiving it (which is a heavier action carrying a confirmation and "Archived" section).

We'll introduce an explicit per-exam publish state so teachers decide the exact moment a test appears to (and disappears from) students.

### Behavior

- Each active mock test card gets two mutually exclusive actions:
  - **Publish to students** — enabled only after "Approve Exam" (i.e. `approved = true` and questions exist).
  - **Unpublish** — hides the test from students immediately, without archiving. Past student submissions in `assessment_results` are preserved.
- A visible status pill on each card: `Draft` → `Approved` → `Published`.
- Editing length, breakdown, or question types on a published exam auto-unpublishes it (same pattern already used for `approved = false` on edits) and shows a toast: "Unpublished — republish after review."
- Archiving a published exam also unpublishes it as part of the same action.
- Restoring an archived exam returns it as `Draft` (must be re-approved and re-published), matching existing "requires re-approval" behavior.

### Student side

- `AIChat.tsx` exam rotation query (line 454) adds `.not("published_at", "is", null)` alongside the existing `archived_at IS NULL` filter, so unpublished / draft exams never enter rotation.
- Same filter added anywhere else student-facing that surfaces exams (verified via `rg course_exams` — only `AIChat.tsx` today).

### Data model

Add one column to `course_exams`:

```text
published_at   timestamptz  null
published_by   uuid         null  references profiles(id)
```

Migration also grants unchanged (column additions inherit table grants) and does not touch RLS. No backfill: existing exams start as Published. Teachers explicitly opt in per exam. (If you'd prefer to backfill all currently-approved active exams as published so nothing "disappears" for students, say so and I'll add a one-line UPDATE.) Default for existing exams is 'Published' in DB

### Teacher UI (`src/pages/teacher/ExamMode.tsx`)

- Extend `useCourseExams` types with `publishedAt: string | null`.
- Add `publishExam(id)` / `unpublishExam(id)` mutations that set/clear `published_at` + `published_by`.
- Add the Publish/Unpublish button next to "Approve Exam" on both AI and Manual cards.
- Any edit path that currently sets `approved: false` also clears `published_at`.
- Add a `Published` badge on the card header.

### Analytics / admin

- `CourseProfileDialog.tsx` currently uses "active (non-archived)" exams. Leave that alone — analytics should keep counting drafts/unpublished so teachers can still see setup progress. Only student-facing surfaces gate on `published_at`.

### Verification

- Type check + build.
- Manual: approve an exam, confirm it does NOT appear in the student exam rotation until Publish is clicked; click Unpublish and confirm it disappears without archiving; edit the length on a published exam and confirm it auto-unpublishes.

### Risks

- Existing approved exams will be invisible to students until a teacher publishes them (unless we backfill — flag your preference). Already addressed as part of migration.
- Two "gate" concepts (Approved vs Published) is one more thing for teachers to learn; the status pill + disabled state on Publish (until approved) keeps the order obvious.