## Root cause

For this course the database actually has:
- 1 active (non-archived) exam
- 5 exam attempts from 5 distinct enrolled students

But the dialog shows `Exams (0 active)` and `Students attempted: 0` while `Total attempts: 5` and `Avg score: 63%`.

Two compounding bugs cause this:

1. **RLS hides `course_exams` from admins.** `public.course_exams` only has two policies: course members (teachers/collaborators) can manage, and enrolled students can read active rows. Admins are neither, so the admin dialog's `course_exams` query returns 0 rows for every course. That's why "(0 active)" is shown and `activeExamIds` is empty.

2. **`examStudents` is gated by `activeExamIds`, but `examAttempts`/`examAvg` are not.** In `CourseProfileDialog.tsx` (lines 275–284), every `mode === 'exam'` row increments `examAttempts` and feeds the avg, but the student is only added to `examByStudent` if `r.exam_id` is in `activeExamIds`. With bug #1 making that set empty, students drop to 0 while attempts/avg stay populated.

The same RLS gap also breaks the "All 14 weekly quizzes & 0 exams submitted" completion line (it under-counts active exams to 0) and the `examsTotal` denominator in the completion check.

## Fix

### 1. Allow admins to read `course_exams` (SQL migration)

Add a SELECT policy:

```sql
CREATE POLICY "Admins can view all course exams"
ON public.course_exams
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));
```

This uses the existing `has_role` security-definer pattern. No grants needed — `authenticated` already has SELECT.

### 2. Make exam counters self-consistent in `src/components/admin/CourseProfileDialog.tsx`

Even with bug #1 fixed, the gating-by-active-exam logic is asymmetric. Restructure the exam-results loop so:

- `examAttempts`, `examPctSum`, `examPctN` count every `mode === 'exam'` row from enrolled students (current behavior).
- `examByStudent` adds the student for **every** exam attempt (drop the `activeExamIds.has(r.exam_id)` gate). The "Students attempted" stat should reflect anyone who attempted any exam tied to this course, even if that specific exam was later archived.
- Keep `activeExamIds` only for the **completion** check (`examsOk`), where it correctly compares against the active exam roster.

Result: `Students attempted ≤ Total attempts` always holds, and admins now see the real active-exam count.

### 3. Verify

- Re-open the GenAI01 course profile: `Exams (1 active)`, `Students attempted: 5`, `Total attempts: 5`.
- Spot-check one other course that has an archived exam with attempts — students count should still include those attempts, attempts ≥ students.
- Confirm completion line denominator now reads `… & 1 exams submitted …`.

## Technical notes

- Files touched: 1 SQL migration + `src/components/admin/CourseProfileDialog.tsx`.
- No change to weekly-quiz logic (quizzes don't depend on `course_exams`).
- No change to student/teacher-facing paths — the new policy only widens admin reads.
