

## Plan: Hide Questions Until Filters Applied + Add Question Form at Top

### Changes

1. **Don't show questions on page load** — Start with an empty list view. Show a prompt like "Use filters above to browse questions." Only display the question list once at least one filter is set to something other than "All".

2. **Move "Add Question" form/button to the top** — Place the add-new-question UI above the question list (below filters) so teachers don't need to scroll.

3. **Logic**: `filteredQuestions` returns empty array when all four filters are `"all"`. Once any filter is changed, matching questions appear.

### Single file change
`src/pages/teacher/DiagnosticQuestionsSetup.tsx`

- Add a computed boolean: `const hasActiveFilter = filterConcept !== "all" || filterType !== "all" || filterDifficulty !== "all" || filterBloom !== "all"`
- When `!hasActiveFilter`, render a placeholder message instead of the question list
- Bulk actions also hidden when no filter active
- Move the "Add New Question" button/dialog trigger to sit just below the filter bar, always visible

