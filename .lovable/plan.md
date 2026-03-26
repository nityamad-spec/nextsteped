

## Plan: Build Concept Management Page with DB Integration

### Summary
Create a new `/teacher/setup/concepts` page (step 4) where teachers can CRUD concepts from the `concepts` table. Insert it between Lesson Plan and Diagnostic Qs in the pipeline, bumping subsequent steps.

### Changes

#### 1. New file: `src/pages/teacher/ConceptManagement.tsx`
- Fetch concepts from `concepts` table filtered by `courseId` (from localStorage)
- CRUD operations wired to the database:
  - **Create**: Insert row with `concept_id` (text), `weight` (numeric input 0.0–1.0), `course_id`
  - **Edit**: Inline edit mode, update row in DB on save
  - **Delete**: Delete from DB with confirmation
- Display total weight sum with a progress indicator toward 1.0
- Table layout: concept_id, weight, actions (edit/delete)
- Loading spinner, empty state ("No concepts yet")
- SetupProgressBar at step 4
- Navigation: Back to Lesson Plan, Continue to Diagnostic Questions

#### 2. Update `src/components/SetupProgressBar.tsx`
- Insert `{ label: "Concepts", path: "/teacher/setup/concepts" }` at index 3
- Pipeline becomes 8 steps

#### 3. Update `src/App.tsx`
- Add route `/teacher/setup/concepts` → `ConceptManagement`

#### 4. Update `src/pages/teacher/CourseCreation.tsx`
- Change "Continue to Diagnostic Questions" button (line 975) to navigate to `/teacher/setup/concepts`

#### 5. Bump `currentStep` in downstream pages
- `DiagnosticQuestionsSetup`: 4→5
- `AITASettings`: 5→6
- `ExamMode`: 6→7
- `PublishEnrollment`: 7→8

### Files Modified
1. `src/pages/teacher/ConceptManagement.tsx` — new file (CRUD page wired to `concepts` table)
2. `src/components/SetupProgressBar.tsx` — add "Concepts" step
3. `src/App.tsx` — add route + import
4. `src/pages/teacher/CourseCreation.tsx` — update continue navigation
5. `src/pages/teacher/DiagnosticQuestionsSetup.tsx` — currentStep 4→5
6. `src/pages/teacher/AITASettings.tsx` — currentStep 5→6
7. `src/pages/teacher/ExamMode.tsx` — currentStep 6→7
8. `src/pages/teacher/PublishEnrollment.tsx` — currentStep 7→8

