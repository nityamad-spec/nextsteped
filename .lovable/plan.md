# Single-Attempt Diagnostic — Fix Persistence & Lock Retakes

## Goal
- A student gets exactly one diagnostic attempt per enrolled course.
- That attempt must reliably persist to the database.
- Students who already completed the diagnostic for a course cannot retake it.
- Newly enrolled students (including those enrolled in additional courses) can take their one attempt and have it saved.

## Root cause recap
`diagnostic_results` currently has two unique indexes on `student_id`:
- `uq_diagnostic_results_student_course` on `(student_id, course_id)` — correct, enforces one attempt per course.
- `diagnostic_results_student_id_unique` on `(student_id)` alone — stale, silently blocks any second row for a student even in a different course. Combined with the unchecked `.insert(...)` in `DiagnosticQuiz.tsx`, saves fail silently and the UI still shows the result screen.

## Changes

### 1. Migration — remove the stale single-column unique index
```sql
DROP INDEX IF EXISTS public.diagnostic_results_student_id_unique;
```
Composite `(student_id, course_id)` uniqueness remains and is what enforces "one attempt per course".

### 2. `src/pages/student/DiagnosticQuiz.tsx` — reliable save + locked retakes
- Replace the unchecked `.insert(...)` at line 419 with a checked call:
  - `const { error } = await supabase.from("diagnostic_results").insert({ ... })`
  - On error: `toast.error("Couldn't save your diagnostic. Please try again.")`, clear `setSaving(false)`, and stop — do not advance to the result phase or clear local progress.
  - On success: proceed to result phase and clear `diagnosticProgress:*` as today.
- Treat a unique-violation error (`code === "23505"`) as "already submitted": show an info toast, mark complete, redirect to `/student/home`.
- The existing pre-quiz guard at lines 139–151 (lookup by `student_id + course_id`, redirect if a row exists) already prevents starting a second attempt — keep as-is.
- Add a small defensive re-check right before insert in `submitFinal`: select existing row for `(user.id, courseId)`; if found, skip insert, toast "Diagnostic already submitted", redirect home. Prevents losing data if the user opens the quiz in two tabs.

### 3. Verification
- Re-take attempt for the stats course as the reporting student → row appears in `diagnostic_results`.
- Second attempt by the same student in the same course → blocked by the pre-quiz guard; if forced, insert is rejected and toast appears.
- New student enrolling in a new course → can take their one attempt, row saved.
- Admin Diagnostics dashboard reflects the new rows (no dashboard code changes needed).

## Out of scope
- No changes to scoring, question selection, RLS, admin dashboard, or teacher flows.
- No bulk backfill of historical missing attempts; affected students can re-take once the index is dropped.
