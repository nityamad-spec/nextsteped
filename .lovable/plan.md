## Goal
Enhance the student profile dialog on `/admin/students` so course progress reflects student activity completion, add an "Expert concepts" fraction per course, and have all key fields live-update via Realtime.

## Changes
Single file: `src/components/admin/StudentProfileDialog.tsx`

### 1. Data fetching
Add a fetch of `concepts` for the open courses to know total concept counts:
- `concepts` table → `select("id, course_id").in("course_id", ids)` → build `conceptsTotalByCourse: Map<courseId, number>`.

Add a fetch of `student_concept_mastery` rows for the student's profile IDs in those courses:
- `select("course_id, concept_id, mastery_level").in("student_id", studentIds).in("course_id", ids)`
- Build `expertByCourse: Map<courseId, number>` counting rows where `mastery_level` is `expert` (case-insensitive). De-dupe by `concept_id` to avoid double-counting if the student has multiple profile rows.

Extend `CourseDetail` with:
- `expertConcepts: number`
- `totalConcepts: number`

### 2. Course progress = activity completion
Replace the time-based `progressPct`/`weekLabel` computation with:
- `done = quizzesDone + examsDone`
- `total = quizzesTotal + examsTotal`
- `progressPct = total > 0 ? Math.round((done / total) * 100) : 0`
- Replace `weekLabel` with an activity label like `"{done} of {total} assessments"` (or omit if `total === 0` → "No assessments yet").

Remove the `courses.start_date` / `total_weeks` reliance for the progress bar (still keep the `courses` query if it's the source of `total_weeks` fallback, but it's no longer used for progress — drop the query to simplify).

### 3. New row in the card
Under the existing Weekly quizzes / Exams row, add:
```
Expert concepts   {expertConcepts}/{totalConcepts}
```
Styled like the other inline stats.

### 4. Realtime subscriptions
Wrap the existing one-shot fetch in a `loadDetails()` function. Inside the same `useEffect` (still keyed on `open` + `student`):
- Call `loadDetails()` once.
- Open a single Supabase channel `admin-student-${student.primaryProfileId}` with three `postgres_changes` listeners (`event: "*"`, `schema: "public"`):
  - `table: "assessment_results"` — filter not possible on `in(...)`, so listen broadly and call `loadDetails()` only if `payload.new?.student_id` or `payload.old?.student_id` is in `studentIds` and `course_id` is in `ids`.
  - `table: "student_course_mastery"` — same filter check.
  - `table: "student_concept_mastery"` — same filter check.
- Debounce reloads (~400ms) to coalesce bursts.
- Cleanup: `supabase.removeChannel(channel)` on unmount / when `open` flips false / student changes.

If any of these three tables is not yet in `supabase_realtime` publication, add a migration:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.assessment_results;
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_course_mastery;
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_concept_mastery;
```
(Will check current publication state before deciding; only add the ones missing.)

### 5. No-op cleanup
- Keep mastery score/level rendering as-is (already covered by realtime via `student_course_mastery`).
- No backend logic, RLS, or schema changes beyond the optional publication additions.

## Out of scope
- Concept mastery thresholds — uses existing `mastery_level` strings already stored.
- Admin students list page itself; only the dialog changes.