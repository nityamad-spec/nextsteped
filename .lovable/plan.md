

## Plan: Add Inline Editing to Syllabus Preview

### Summary
Make the `SyllabusPreview` component editable so professors can click on any section and modify content directly. Changes update the `previewJson` state and can be saved back to storage.

### Changes

#### 1. Make `SyllabusPreview` editable
**File: `src/pages/teacher/MaterialQualityCheck.tsx`**

- Add an `editable` prop and an `onChange` callback to `SyllabusPreview`
- When `editable` is true, each section gets a small pencil/edit icon button
- Clicking it toggles that section into edit mode:
  - **Text fields** (courseTitle, courseCode, instructor, term, description): inline `<Input>` or `<Textarea>`
  - **List fields** (learningObjectives, resources): each item becomes an editable input with delete button; plus an "Add" button at the bottom
  - **Schedule table**: each cell becomes an `<Input>`; add/remove row buttons
  - **Grading components**: each name/weight/description becomes editable; add/remove component
  - **Policies**: title and content become editable; add/remove policy
- A Save/Cancel button pair appears per section when in edit mode
- On save, call `onChange(updatedSyllabus)` which updates the parent state

#### 2. Wire up editing in the parent
**File: `src/pages/teacher/MaterialQualityCheck.tsx`**

- Pass `editable={true}` and `onChange={setPreviewJson}` when rendering the preview in idle stage
- Pass `editable={true}` and `onChange={setSyllabusJson}` when rendering in the preview stage
- Add a "Save Changes" button that re-uploads the updated JSON to storage as `approved-syllabus.json`
- Show a toast on successful save

#### 3. Section-level edit state management
**Inside `SyllabusPreview`**

- Track `editingSection: string | null` state (e.g., "description", "objectives", "schedule", "grading", "policies", "resources", "header")
- Hold a local draft copy of the section being edited
- On "Save" for a section, merge draft into the full syllabus object and call `onChange`
- On "Cancel", discard draft and exit edit mode

### Files Modified
1. `src/pages/teacher/MaterialQualityCheck.tsx` — refactor `SyllabusPreview` to support inline editing, wire up in both idle and preview stages

