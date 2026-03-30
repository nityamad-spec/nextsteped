

## Plan: Add Diagnostic Test Analytics to Assessment Analytics

### Problem
The `/teacher/assessment-analytics` page currently only shows results from exams and daily quizzes (from `assessment_results` table). Diagnostic test results (stored in `diagnostic_results`) are excluded, so teachers have no visibility into how students performed on the initial diagnostic.

### Approach
Add "Diagnostic" as a new mode option in the existing filter dropdown. When selected, fetch and display data from `diagnostic_results` instead of `assessment_results`, normalizing it into the same display format (summary cards, score distribution, topic performance, recent submissions).

### Changes

**1. `src/pages/teacher/AssessmentAnalytics.tsx`**

*Data fetching:*
- Add a second `useEffect` that fetches from `diagnostic_results` (joined via `enrollments` to scope to the current course) when `modeFilter === "diagnostic"` or `"all"`
- Normalize diagnostic rows into the same `AssessmentResult` shape: map `score`/`total_questions`/`answers`/`created_at`, set `mode = "diagnostic"`, `time_spent` derived from `question_times` JSONB if available

*Filter dropdown:*
- Add `<SelectItem value="diagnostic">Diagnostic Tests</SelectItem>` to the mode selector

*Summary cards:*
- Include diagnostic count in the breakdown line (e.g., "5 exams · 3 quizzes · 12 diagnostics")

*Topic performance:*
- Diagnostic `answers` JSONB already stores per-question data with topic info — aggregate the same way

*Recent submissions table:*
- Show "Diagnostic" badge for diagnostic rows
- Include learner level from `diagnostic_results.learner_level` as an extra badge

*Score distribution:*
- Works unchanged since it's computed from the normalized results array

**2. RLS consideration**
- `diagnostic_results` currently only has student-facing RLS (students can view/insert own). Teachers need a SELECT policy scoped to their course's enrolled students.
- Add migration: `CREATE POLICY "Teachers can view diagnostic results for their courses" ON diagnostic_results FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM enrollments WHERE enrollments.student_id = diagnostic_results.student_id AND is_course_member(enrollments.course_id, auth.uid())));`

### Files Modified
- Database migration — RLS policy for teacher access to `diagnostic_results`
- `src/pages/teacher/AssessmentAnalytics.tsx` — fetch diagnostic data, add filter option, normalize and display

