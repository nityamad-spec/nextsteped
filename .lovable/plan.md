

## Plan: Restructure Setup to 7 Steps — Split TA Settings, Add Exam Mode, Rename Step 6

### Summary
Split current "TA Settings" (step 5) into two steps: **TA Settings** (AI instructions only, step 5) and **Exam Mode** (exam/quiz rules, step 6). Update progress bar to 7 steps. Add download for lesson plan. Persist lesson plan to storage for TeachingPlan tab. Add custom instruction fields with read-only defaults.

### Changes

#### 1. SetupProgressBar — 7 steps
**File: `src/components/SetupProgressBar.tsx`**

Update steps to:
1. Profile & Course → 2. Syllabus Review → 3. Lesson Plan → 4. Diagnostic Qs → 5. TA Settings → 6. Exam Mode → 7. Publish

Add route `/teacher/setup/exam-mode` for step 6.

#### 2. AITASettings — AI Instructions only (step 5)
**File: `src/pages/teacher/AITASettings.tsx`**

- Remove all exam/quiz rules (Tabs component, exam/quiz state, estimate logic, approve buttons, preview card)
- Keep only AI System Instructions card, restructured:
  - **Study Mode**: read-only grayed-out textarea with `defaultStudyPrompt`, then editable textarea for custom instructions with placeholder guidelines (depth of explanation, terminology, examples, tone)
  - **Exam Prep Mode**: same pattern — read-only default + editable custom
  - Guidelines text explaining what custom instructions could include
- Save button navigates to `/teacher/setup/exam-mode`
- `currentStep` = 5

#### 3. New ExamMode page (step 6)
**File: `src/pages/teacher/ExamMode.tsx`** (NEW)

Move all exam/quiz rules from current AITASettings:
- Info note about custom questions
- Tabs: Exam Rules + Daily Quiz Rules (all the selects, sliders, approve buttons)
- Student Experience Preview card
- Navigation: Back → `/teacher/setup/settings`, Continue → `/teacher/setup/publish` (disabled until both approved)
- `currentStep` = 6

#### 4. App.tsx — add route
**File: `src/App.tsx`**

- Import `ExamMode`
- Add route: `/teacher/setup/exam-mode` → `ExamMode`

#### 5. PublishEnrollment — update to step 7
**File: `src/pages/teacher/PublishEnrollment.tsx`**

- `currentStep` = 7
- Back button navigates to `/teacher/setup/exam-mode`

#### 6. CourseCreation — save plan JSON + download
**File: `src/pages/teacher/CourseCreation.tsx`**

- On publish, save `published-plan.json` to storage at `{userId}/lesson-plan/published-plan.json`
- Add "Download Lesson Plan" button (text export) visible after publishing

#### 7. TeachingPlan — load published plan from storage
**File: `src/pages/teacher/TeachingPlan.tsx`**

- On mount, try loading `published-plan.json` from storage
- If found, use as initial data instead of hardcoded `workshopPlan`
- Keep all existing editing capabilities

#### 8. Types update
**File: `src/types/index.ts`**

- Add `customStudyPrompt?: string` and `customExamPrompt?: string` to `TASettings`

### Files Modified
1. `src/components/SetupProgressBar.tsx` — 7 steps
2. `src/pages/teacher/AITASettings.tsx` — AI instructions only with default/custom split
3. `src/pages/teacher/ExamMode.tsx` — NEW, exam + quiz rules
4. `src/App.tsx` — add exam-mode route
5. `src/pages/teacher/PublishEnrollment.tsx` — step 7, back to exam-mode
6. `src/pages/teacher/CourseCreation.tsx` — save plan JSON, download button
7. `src/pages/teacher/TeachingPlan.tsx` — load published plan
8. `src/types/index.ts` — custom prompt fields

