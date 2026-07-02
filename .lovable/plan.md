## Goal

Remove the UI-level cap of 10 mock tests on `/teacher/setup/exam-mode` so professors can create an unbounded number of finals.

## Changes (single file: `src/pages/teacher/ExamMode.tsx`)

1. **Delete the `MAX_EXAMS = 10` constant** (line 31).
2. `**handleAddExam**` (line 384): remove the `if (examSchedule.length >= MAX_EXAMS) return;` guard.
3. **Add-exam button** (lines 875, 887–888):
  - Update helper copy from `"Add 1 – {MAX_EXAMS} mock tests"` to `"Add mock tests as needed"`.
  - Change `disabled={examSchedule.length >= MAX_EXAMS || addingExam}` to `disabled={addingExam}`.
4. **Restore-from-archive button** (lines 1141–1142): remove the cap-based disabled state and tooltip; keep only `disabled={restoringExamId === ex.id}` with the standard restore tooltip.
5. **Remove the now-unused `MAX_EXAMS` import/reference** anywhere else in the file (grep confirms only the above sites).

No changes to `useCourseExams`, `nextAvailableLabel`, DB schema, RLS, or the naming logic — `nextAvailableLabel` already handles arbitrary N (it walks `Final 1`, `Final 2`, ... until it finds a free slot).

## Risks / trade-offs to flag to the user

1. **Naming collisions & UI clutter** — `nextAvailableLabel` scales fine, but a long "Final 47" list becomes hard to scan; the cards render in a single vertical stack with no pagination or search.
2. **Question-generation cost** — each new final can trigger `generate-exam-questions` (LLM calls). With no cap, an accidental spam-click or scripted use could rack up significant AI Gateway usage. The 10-cap was implicitly a cost/abuse guardrail.
3. **Student-facing exam picker load** — `ExamPrepPanel` shows "Exam X of N remaining"; N growing large is fine textually, but students will see many "practice exams remaining" which may confuse rather than help.
4. **Performance** — `course_exams` queries are `.order("position")` with no `.limit()`. At small-to-moderate N (≤100) this is fine. Beyond that, the exam-mode page renders every card in the DOM (no virtualization), which can slow the setup screen.
5. **Realtime + persistence churn** — each card independently debounces to `course_exams`; many cards mean more subscriptions and writes when the professor edits breakdowns.
6. **No DB-level constraint exists** — removing the UI cap does not create a new backend risk (nothing was enforcing it there), but it also means there is no server-side backstop if we later want one.

## Non-goals

- No change to archive/restore semantics.
- No change to `nextAvailableLabel` (already unbounded).
- No new DB constraint added; can be added later if abuse becomes a concern.

## Open questions

1. Do you want a soft cap (e.g. warn at 20, still allow more) instead of fully unbounded, to preserve the cost guardrail? No
2. Should the archive-restore button also be uncapped (plan currently says yes, matching "remove the cap")? Yes