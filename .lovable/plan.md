

## Plan: Fix 3 Broken Navigation Links to `/teacher/setup/syllabus`

Replace all remaining references to `/teacher/setup/syllabus` with `/teacher/setup/lesson-plan` in three files:

1. **`src/pages/teacher/MaterialQualityCheck.tsx`** (line 711) — Forward button uses old path
2. **`src/pages/teacher/ConceptManagement.tsx`** (line 302) — Back button uses old path
3. **`src/pages/teacher/DiagnosticQuestionsSetup.tsx`** (line 1092) — Back button uses old path

Each is a single string replacement: `"/teacher/setup/syllabus"` → `"/teacher/setup/lesson-plan"`.

### Result
All 8 steps will have correct forward/back navigation with no dead links.

