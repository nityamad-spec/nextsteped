

## Plan: Add Filters and Test Analysis Report to Diagnostic Questions Page

### Summary
Add a filter bar below the summary section and an analytics report panel at the top of the page that shows the distribution of questions selected for the diagnostic test across difficulty, question type, concept, and Bloom's level.

### 1. Filter Bar (below existing summary bar)

Add four filter dropdowns in a horizontal row:
- **Concept**: dropdown listing all concepts for the course (from `concepts` state) + "All"
- **Question Type**: dropdown with MCQ, True/False, Short Answer, Code + "All"
- **Difficulty**: dropdown with Easy, Medium, Hard + "All"
- **Bloom's Level**: dropdown with levels 1-6 + "All"

Filter state: `filterConcept`, `filterType`, `filterDifficulty`, `filterBloom` — all default to `"all"`.

The question list renders only questions matching all active filters. Bulk actions (Add All to Test, Remove All from Test) apply only to filtered questions.

### 2. Test Analysis Report (collapsible card above filters)

A collapsible panel titled "Test Composition Analysis" that computes stats from questions where `inTest === true`:

**Four mini distribution tables/bars:**

| Section | Display |
|---------|---------|
| **By Difficulty** | Count + percentage for Easy / Medium / Hard |
| **By Question Type** | Count + percentage for MCQ / True-False / Short Answer / Code |
| **By Concept** | Count + percentage per concept_code (with weight comparison) |
| **By Bloom's Level** | Count + percentage for each level 1-6 |

Each section shows a simple horizontal bar or badge-based breakdown. Use existing Badge and Progress components. Show "No questions in test" if `inTestCount === 0`.

### 3. Implementation Details

**Single file change**: `src/pages/teacher/DiagnosticQuestionsSetup.tsx`

- Add 4 filter state variables
- Compute `filteredQuestions` from `questions` based on filters
- Render filter row using existing `Select` components
- Compute test analysis stats with `useMemo` from `questions.filter(q => q.inTest)`
- Render analysis report as a `Collapsible` card
- Replace `questions.map(...)` in the list with `filteredQuestions.map(...)`
- Update bulk in-test actions to apply to `filteredQuestions` only

### Files Modified
1. `src/pages/teacher/DiagnosticQuestionsSetup.tsx`

