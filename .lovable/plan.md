

## Plan: Teacher Assessment Analytics Dashboard

### Problem
Assessment results are now persisted in `assessment_results`, but teachers have no way to view them. The existing `StudentInsights` page uses only mock data and is not even routed in the teacher layout.

### Approach

**1. Create `src/pages/teacher/AssessmentAnalytics.tsx`** — New page with real data from `assessment_results`

Fetches from Supabase using `course_id` filter. Displays:
- **Summary cards**: Total attempts, average score %, completion count (exam vs quiz), average time spent
- **Score distribution chart**: Bar chart showing how many students scored in each range (0-20%, 20-40%, etc.)
- **Topic performance table**: Extracts topic data from the `answers` JSONB field, shows per-topic correct/incorrect rates
- **Recent results list**: Table of recent assessment submissions with mode, score, time spent, date
- Section filter dropdown (if course has multiple sections)

Data query pattern:
```typescript
const { data } = await supabase
  .from("assessment_results")
  .select("*")
  .eq("course_id", courseId);
```

The `answers` JSONB contains per-question data including topic, so topic-level aggregation happens client-side.

**2. `src/App.tsx`** — Add route `/teacher/assessment-analytics` under the teacher layout

**3. `src/layouts/TeacherLayout.tsx`** — Add nav item "Assessment Analytics" with `BarChart3` icon, positioned after "Assessments"

### Files Modified
- New: `src/pages/teacher/AssessmentAnalytics.tsx`
- `src/App.tsx` — add route
- `src/layouts/TeacherLayout.tsx` — add nav link

