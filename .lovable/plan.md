# Diagnostic Results Dashboard (Admin)

Add a new **Diagnostics** tab to `/admin/dashboard` that summarizes diagnostic test results across all courses, drillable by course and by student, with cross-course analytics for tracking progress.

## Scope

Frontend-only. Read-only admin views over existing `diagnostic_results`, `diagnostic_questions`, `courses`, `profiles`, and `enrollments` tables. Admin RLS policies already allow reading these.

## UI structure

New `<TabsTrigger value="diagnostics">` added next to Settings / Cost Calculator in `src/pages/admin/AdminDashboard.tsx`. To keep the file manageable, the tab body is extracted into a new component `src/components/admin/DiagnosticsAnalytics.tsx`.

Layout inside the tab:

### 1. Top KPI strip (global)
Six small stat cards:
- Total attempts (count of `diagnostic_results`)
- Unique students assessed
- Courses with ≥1 attempt
- Average score (% across all attempts)
- Median time-per-question (from `question_times` jsonb)
- Completion rate (attempts vs. enrolled students across courses)

### 2. Learner-level distribution (global)
Horizontal stacked bar + legend showing share of Beginner / Progressing / Proficient / Expert across all attempts. Adjacent donut showing branch_tier distribution (easy / medium / hard / none).

### 3. Course-wise summary table
Columns: Course code · Course name · Attempts · Avg score % · Avg standard-phase score · Adaptive tier mix (easy/med/hard pills) · Level mix (mini stacked bar) · Last attempt date. Sortable by any column. Clicking a row opens the course drill-down (section 5).

### 4. Cross-course progress chart
Line/area chart of attempts over time (last 90 days), grouped by course (top 5 by volume) + an "Others" series. Toggle: attempts count vs. rolling avg score.

### 5. Course drill-down panel (opens when a course row is clicked)
- Course header with code/name/teacher.
- Per-concept performance: for each `concept_id` covered in that course's `diagnostic_questions`, compute % correct from `answers` arrays joined to question_ids → questions. Bar chart sorted weakest → strongest. Highlights weakest 3 concepts as "Focus areas".
- Tier accuracy: bars showing accuracy on standard vs. easy/medium/hard questions for that course.
- Student table for that course: Student name · Roll no · Score · Level · Branch tier · Avg time/q · Completed at. Filter by level/branch. CSV export button.

### 6. Student drill-down (opens when a student row is clicked)
Modal/sheet with:
- Profile chip (name, roll, email, course).
- Score, level, branch tier, total time.
- Per-question table: question text · topic/concept · tier · student answer · correct answer · ✓/✗ · time spent · confidence.
- "Strengths" and "Gaps" summaries grouped by concept.

### 7. Filters bar (applies to sections 1–4)
- Course multi-select
- Date range (last 7d / 30d / 90d / all)
- Learner level multi-select
- Branch tier multi-select

## Data layer

All queries via supabase-js from the client (admin RLS already permits). New helper file `src/lib/diagnosticsAnalytics.ts` with pure functions:
- `aggregateGlobalKpis(results)`
- `aggregateByCourse(results, courses)`
- `aggregateLevelDistribution(results)`
- `aggregateBranchTierDistribution(results)`
- `timeSeriesByCourse(results, days)`
- `aggregateConceptPerformance(results, questions)` — joins `question_ids` ↔ `diagnostic_questions.concept_id`, scores per concept
- `aggregateTierAccuracy(results, questions)`
- `studentDetail(result, questions)`

Unit tests for these aggregators in `src/lib/diagnosticsAnalytics.test.ts` (vitest), covering: empty results, mixed-format answers, missing question_times, branch_tier null handling, concept rollup correctness.

Fetch strategy on mount:
```text
Promise.all([
  diagnostic_results (id, student_id, course_id, score, total_questions,
                      learner_level, branch_tier, answers, question_ids,
                      question_times, confidences, created_at),
  courses (id, name, course_code, teacher_id),
  profiles (id, name, roll_number, email)  -- only students with results
  diagnostic_questions (id, course_id, concept_id, tier, content_text,
                        answer, topic, format)  -- lazy: only for selected course drill-down
])
```
Cache the heavy `diagnostic_questions` fetch per course in component state.

## Charts
Use the existing `recharts`-backed `@/components/ui/chart.tsx` primitives (already in the project) — `ChartContainer`, `ChartTooltip`, etc. — for bars, stacked bars, area, and donut. No new dependencies.

## Design tokens
All colors via semantic tokens from `index.css` (`--primary`, `--muted`, `--destructive`, `--accent`, plus mastery-level colors already defined). Skeleton loaders during fetch. Empty states with `Users` / `BarChart3` lucide icons.

## Out of scope
- No new tables, columns, RLS policies, or edge functions.
- No changes to student or teacher dashboards.
- No realtime subscriptions (admin loads on demand; a Refresh button is provided).

## Technical notes
- `answers` is `jsonb` array of selected option indices (and/or text answers); correctness is recomputed client-side using `isAnswerCorrect` from existing `src/lib/diagnosticBranching.ts` joined to questions by `question_ids` order.
- `branch_tier` is nullable for older rows — bucket those as "none/legacy".
- CSV export uses a tiny inline serializer (no new deps).
- Sort/filter handled in-memory; result volume is small (per existing scale).

## Files
- new `src/components/admin/DiagnosticsAnalytics.tsx`
- new `src/lib/diagnosticsAnalytics.ts`
- new `src/lib/diagnosticsAnalytics.test.ts`
- edit `src/pages/admin/AdminDashboard.tsx` (add tab trigger + content)
