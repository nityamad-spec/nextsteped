

## Plan: Add Date, Branch Filters and Column Sorting to Assessment Analytics

### Overview
Enhance the `/teacher/assessment-analytics` page with additional filters (date range, student branch) and sortable table columns. All filters apply globally to summary cards, charts, and tables.

### Changes — Single file: `src/pages/teacher/AssessmentAnalytics.tsx`

**1. New State Variables**
- `dateFrom` / `dateTo` (string or null) for date range filtering
- `branchFilter` (string, default "all") for branch filtering
- `sortColumn` / `sortDirection` for both the Topic Performance and Recent Submissions tables
- `branches` list fetched from the `branches` table
- `studentBranches` map: student_id → branch_id, fetched by joining `enrollments` + `profiles` for the current course

**2. Fetch Branch Data**
- Query `branches` table for the dropdown options
- Query enrolled student profiles: `profiles.id, profiles.branch_id` for students enrolled in the current course (via `enrollments`)
- Build a `Map<student_id, branch_id>` to tag each result with a branch

**3. Filter Bar UI**
- Reorganize the header area into a row of filters:
  - Mode filter (existing Select)
  - Date From / Date To (two `<input type="date" />` fields)
  - Branch filter (Select dropdown populated from `branches` table)
- Wrap in a responsive flex/grid layout

**4. Apply Filters**
- After the existing mode filter, additionally filter by:
  - `created_at >= dateFrom` (if set)
  - `created_at <= dateTo + end of day` (if set)
  - `studentBranches.get(r.student_id) === branchFilter` (if not "all")
- All downstream computations (summary cards, distribution chart, topic table, recent submissions) already use the `filtered` array, so they update automatically

**5. Sortable Table Columns**
- Add click handlers to `TableHead` cells in both Topic Performance and Recent Submissions tables
- Clicking a column header toggles ascending/descending sort
- Visual indicator (arrow icon) on the active sort column
- Topic Performance: sortable by Topic, Correct, Incorrect, Total, Accuracy
- Recent Submissions: sortable by Date, Score, Correct, Time

### Technical Details
- Date inputs use native HTML `<input type="date" />` (already available, no new dependencies)
- Branch lookup uses two queries: `supabase.from("branches").select("id, name")` and `supabase.from("enrollments").select("student_id, profiles(branch_id)").eq("course_id", ...)` — the profiles join works via `student_id` referencing `profiles.id`
- Sort state: `{ column: string; direction: 'asc' | 'desc' }` with a toggle helper
- Sort icons: `ArrowUpDown`, `ArrowUp`, `ArrowDown` from lucide-react

### No database changes required. Single file modification only.

