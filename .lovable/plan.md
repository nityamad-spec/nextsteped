

## Professor View Revamp Plan

This is a large overhaul touching the setup flow, dashboard, assessments, and adding a content library. Here's the breakdown:

### Setup Flow Changes (8 steps → 6 steps)

Current: Profile → Syllabus Review → Lesson Plan → Concepts → Diagnostic → TA Settings → Exam Mode → Publish

New: Profile → Syllabus Review → Lesson Plan → Concepts (auto-filled) → Diagnostic (AI-generated) → Exam Mode (Study instructions merged) → Publish

**Files:** `SetupProgressBar.tsx` (update steps array from 8 to 7), routing in `App.tsx`

---

### 1. Syllabus Export (#3)
**File:** `MaterialQualityCheck.tsx`
- Add a "Download Updated Syllabus" button that fetches the uploaded syllabus from Supabase Storage and triggers a browser download

### 2. Lesson Plan — Remove Weightage Per Week (#5)
**File:** `TeachingPlan.tsx`, `CourseCreation.tsx`
- Remove the weightage slider/input from each day card
- Remove the `weightage` field from the `DayPlan` type display (keep in data for backward compat)

### 3. Concept Management — Auto-fill from Materials (#6, #7)
**File:** `ConceptManagement.tsx`
- On page load, call AI (edge function or inline) to analyze uploaded materials and generate concept list with 0-100% weightages
- Display as a table where each row has an "Approve" checkbox
- Professor must approve every line item before the "Continue" button enables
- Change weight display/input from 0-1 decimal to 0-100% scale
- Add "Regenerate" button to re-run AI if professor wants different suggestions

**New edge function:** `seed-concepts` update or new `auto-concepts` function that reads uploaded materials from storage and returns concept + weight suggestions

### 4. Diagnostic Section — AI Auto-generation with Branching (#8)
**File:** `DiagnosticQuestionsSetup.tsx`
- Restructure the UI to show:
  - **5 Anchor Questions** section (common to all students)
  - **3 Branches** (Easy/Medium/Hard), each with 5 questions
- AI auto-generates all 20 questions from course materials on page load
- Professor can filter by branch/difficulty, edit any question, remove, or add custom ones
- Each question needs individual approval before continuing
- Call existing `seed-questions` edge function or create new one for branched generation

### 5. Remove Exam Prep TA Instructions, Keep Study Mode (#9)
**File:** `AITASettings.tsx`
- Remove the entire "Exam Prep Mode Instructions" card
- Keep only Study Mode custom instructions
- Update page title to "AI Study Assistant Settings"
- Update navigation: this step now goes directly to Exam Mode

### 6. Remove All Daily Quiz References (#10)
**Files affected (multiple):**
- `ExamMode.tsx` — Remove the "Daily Quiz Rules" tab entirely, remove `quizApproved` from `canContinue`
- `CourseDashboard.tsx` — Remove Daily Quiz toggle from Assessment Controls
- `Assessments.tsx` — Remove the "Daily Quiz" tab
- `StudentHome.tsx` — Remove quiz links/references
- `AIChat.tsx` — Remove quiz mode references
- `TeacherLayout.tsx` — No change needed
- `SetupProgressBar.tsx` — Already handled by step reduction

### 7. Exam Mode Rules Updates (#11)
**File:** `ExamMode.tsx`
- Remove "Question Presentation" dropdown (default to all-at-once)
- Add a prominent info banner: "These rules are recommendations. Students can adjust settings if they choose."
- Remove daily quiz tab (covered in #6)

### 8. Course Dashboard Revamp (#12)
**File:** `CourseDashboard.tsx` — Major rewrite
- **Add course progress bar** at the top (e.g., Week 2 of 3)
- **Remove Assessment Controls** card entirely
- **Replace Mastery Distribution** with new Concept Mastery Map:
  - Three categories: "Touched" (asked about ≥1 time), "Deeply Explored" (multiple sessions/follow-ups), "Not Explored"
  - Aggregate anonymous view of all students
  - Within Touched/Deeply Explored, show sub-insights if students took weekly quiz
- **Add AI-generated insights section**: suggestions on how to enhance learning, deep-dive recommendations
- Keep existing: stats row, weekly engagement, mastery timeline, collaborators

### 9. Assessments Page — Exam & Diagnostic Only (#13)
**File:** `Assessments.tsx`
- Remove Study/Daily Quiz tabs, keep only **Exam** and **Diagnostic** tabs
- In Diagnostic tab, add analytics view (score distribution, difficulty breakdown charts — pull from `diagnostic_results`)
- Keep existing exam question CRUD

### 10. Content Library (#14)
**New file:** `ContentLibrary.tsx` — rewrite from static mock to functional page
- Pull all files from `course_material_files` table for the current course
- Group by folder_type (syllabus, lesson-plans, materials)
- Allow uploading new files using `FileUploadZone` component
- Allow downloading files from Supabase Storage
- Allow deleting files
- Show file metadata (name, size, upload date, type)

**File:** `TeacherLayout.tsx` — Add "Content Library" nav item
**File:** `App.tsx` — Add route `/teacher/content-library`

---

### Technical Notes
- Concept auto-fill needs an edge function that reads from `course-materials` storage bucket and uses AI to extract concepts + weights
- Diagnostic AI generation reuses/extends the existing `seed-questions` edge function with branching logic
- Daily quiz removal touches ~6 files but is mostly deletion
- Dashboard concept mastery map will initially use mock data since chat interaction tracking would need new DB columns (can be wired later)
- Weight scale change (0-1 → 0-100%) is a display-only change; DB stores as decimal, multiply by 100 for display

### Execution Order
1. Setup flow restructuring (steps, progress bar, routing)
2. Remove daily quiz references across all files
3. TA Settings simplification
4. Exam Mode cleanup
5. Lesson Plan weightage removal
6. Concept Management auto-fill + 0-100% scale
7. Diagnostic Questions AI branching UI
8. Course Dashboard revamp
9. Assessments page restructuring
10. Content Library (new page)
11. Syllabus export button

