

## Plan: Add "In Test" Filter to Diagnostic Questions Page

### Change
Add a fifth filter dropdown to the existing filter bar that lets the teacher filter by test inclusion status: "All", "In Test", or "Not in Test".

### File Modified
`src/pages/teacher/DiagnosticQuestionsSetup.tsx`

### Details

1. **Add state**: `const [filterInTest, setFilterInTest] = useState("all");`

2. **Update `filteredQuestions` memo**: Add a check:
   ```
   if (filterInTest === "yes" && !q.inTest) return false;
   if (filterInTest === "no" && q.inTest) return false;
   ```

3. **Update `hasActiveFilter`**: Include `filterInTest !== "all"` in the condition.

4. **Add dropdown to filter bar**: A new `<Select>` with options "All Status", "In Test", "Not in Test" — placed after the existing Bloom Level filter.

Single file, minimal change.

