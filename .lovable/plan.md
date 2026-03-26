

## Plan: Add Concept Selector Dropdown to Diagnostic Questions UI

### Summary
Add a concept selector dropdown to the question edit form that loads concepts from the `concepts` table (filtered by `course_id`) and saves the selected `concept_id` foreign key when persisting questions.

### Changes

**File: `src/pages/teacher/DiagnosticQuestionsSetup.tsx`**

1. **Extend `DiagnosticQuestion` interface** — add `conceptId?: string` field to track the FK
2. **Fetch concepts on mount** — query `supabase.from("concepts").select("*").eq("course_id", courseId)` alongside existing questions fetch; store in a `concepts` state array
3. **Update `dbRowToQuestion`** — map `row.concept_id` to `conceptId`
4. **Update `questionToDbRow`** — include `concept_id: q.conceptId || null` in the returned object
5. **Add concept `<Select>` dropdown in the edit form** — placed near the existing `topic` field; lists all loaded concepts by their `concept_id` text (e.g., "PWIM/Python_Environment"); includes a "None" option to clear
6. **Auto-fill `topic` from concept** — when a concept is selected, optionally sync the `topic` text field to the concept's `concept_id` string for consistency
7. **Update view mode** — show selected concept as a badge alongside existing topic display
8. **Handle empty concepts gracefully** — if no concepts exist for the course, show "No concepts defined yet" in the dropdown with a disabled state

### Technical Details

- Concepts state: `const [concepts, setConcepts] = useState<{id: string, concept_id: string, weight: number}[]>([])`
- The dropdown maps `concept.id` (UUID) as the select value, displays `concept.concept_id` (text) as the label
- On save, `concept_id` UUID is written to `diagnostic_questions.concept_id` FK column

### Files Modified
1. `src/pages/teacher/DiagnosticQuestionsSetup.tsx` — add concept fetch, dropdown widget, and FK persistence

