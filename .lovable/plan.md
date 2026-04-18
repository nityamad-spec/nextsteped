
## Plan

Big restructure across 9 sections. Below is concise mapping of work + file touches. No code is changed in this turn.

---

### Section 1 — Intro Demo screens (between role select & auth)

- **Keep** `Landing.tsx` exactly as-is (role tiles).
- **Change** `Landing.selectRole`: instead of going to `/auth?role=...`, route to `/intro/teacher` or `/intro/student`.
- **New files**:
  - `src/pages/TeacherIntro.tsx` — headline + 2-sentence body + 5 static cards (Lesson Plan Generation, Curriculum-Aligned AI TA, Professor AI TA, Mastery Tracking, AI Teaching Insights) + "Get Started" → `/auth?role=teacher`.
  - `src/pages/StudentIntro.tsx` — headline + body + 4 static cards (Adaptive AI Tutor Study, AI Tutor Exam Mode, What to Do Next, Mastery Map) + "Get Started" → `/auth?role=student`.
- Static design only (Card grid, lucide icons, no animations).
- Add routes in `App.tsx`: `/intro/teacher`, `/intro/student`.

### Section 2 — Single-page Professor onboarding

- **Rewrite** `src/pages/teacher/TeacherOnboarding.tsx` to one scrollable page with two `Card` sections:
  - **Your Profile**: Name, Institutional Email (prefilled, read-only from `user.email`), Institution (new field), Department, Designation (new field).
  - **Your Course**: Course Name, Course Code, Semester (Term), Student Graduation Year, Learning Objective of Course.
- Persist Institution + Designation: store in `profiles` (need to add `institution text`, `designation text` columns via migration).
- Drop multi-step `SetupProgressBar` from this page.
- CTA: "Go to Dashboard" → on save, upsert `profiles` + `courses`, then `navigate("/teacher/courses/dashboard")`.

### Section 3 — Course Setup tab on dashboard

- **Sidebar** (`TeacherLayout.tsx`): replace the navigation order so the top items are **Course Dashboard** and **Course Setup** (new), keep the rest. Remove standalone **Settings** entry (its content moves into Card 4 per Section 7).
- **New file** `src/pages/teacher/CourseSetup.tsx`: index page that renders 5 square cards in a grid, each with title + 1-line description + status badge ("Not Started"/"In Progress"/"Complete"). Clicking a card navigates to its module route.
- **New routes** under teacher layout (so they share the sidebar):
  - `/teacher/setup` → `CourseSetup` (grid)
  - `/teacher/setup/upload` → existing `CourseMaterials` (slimmed per Section 4)
  - `/teacher/setup/lesson-plan` → existing `CourseCreation` (output reformatted per Section 5)
  - `/teacher/setup/diagnostic` → existing `DiagnosticQuestionsSetup` (Section 6)
  - `/teacher/setup/ai-settings` → new combined page (Section 7)
  - `/teacher/setup/exam-mode` → existing `ExamMode` (Section 8)
- Inside each module, replace the old `SetupProgressBar` + linear nav with a **Back to Course Setup** button + a **Next** button to the next module (Upload → Lesson Plan → Diagnostic → AI Settings → Exam Mode → back to grid).
- **Status logic** (read on `CourseSetup` mount):
  - Card 1 status: query `course_material_files` for syllabus → Complete if ≥1 syllabus file else Not Started.
  - Card 2: Complete if `published-plan.json` exists in storage; In Progress if a draft exists; else Not Started.
  - Card 3: Complete if ≥1 `diagnostic_questions` row for course.
  - Card 4: Complete if `course_ta_settings.customStudyPrompt` is non-empty.
  - Card 5: Complete if `course_ta_settings.examEnabled = true`.
- **Dependency lock**: Card 2 disabled (not clickable, faded) with copy "Upload your syllabus in Step 1 to unlock this." until Card 1 status = Complete.
- **Remove from nav/flow**: routes `/teacher/setup/quality-check` (Syllabus Review) and `/teacher/setup/concepts` (Concepts). Delete from `App.tsx` route table; leave files on disk to avoid risk but unreachable.

### Section 4 — Card 1: Upload Course Materials (slimmed)

- **Edit** `CourseMaterials.tsx`:
  - Remove the Course Schedule card (weeks, sessions, session length, midterm, final). These move to onboarding/lesson-plan generation defaults; keep DB columns intact, just stop editing here.
  - Two upload zones only:
    1. **Syllabus** — red "Required" badge + helper text "This is required to unlock Lesson Plan generation and align the AI TA to your course." Accept `.pdf,.docx`.
    2. **Lesson Plans and Other Teaching Materials** — gray "Optional" badge + helper text from spec. Keep current accept list.
  - Footer: Back to Course Setup grid + Next → `/teacher/setup/lesson-plan`.

### Section 5 — Card 2: Generate Lesson Plan (format change)

- **Edit** `CourseCreation.tsx` rendering (no change to generation logic call):
  - Output renderer per week now displays:
    - `Week N — <Week Name>`
    - **Overview** (1–2 sentences)
    - **Topics Covered** — bullet list (mapped from `concepts[].name`)
    - **Industry-Relevant Exercise** — exactly 1 (first `coding-exercise` resource; if multiple generated, show first only)
    - **Suggested Articles or Resources** — 1–2 (`article` resources, capped at 2)
    - **Key Concepts to Include** — 1–2 (last 1–2 concepts marked `ai_suggested=true`, fall back to top 2 concepts)
  - After all weeks: closing **Overall Course Learning Outcomes** paragraph.
  - **Remove** any "Learning Outcomes by Week" or "Additional Tips" UI sections in this page.
- **Edge function update** (`supabase/functions/generate-lesson-plan/index.ts`):
  - Add to tool schema: `week_name: string`, `overall_course_learning_outcomes: string` (top-level, returned once).
  - Update system prompt to enforce: produce exactly 1 industry-relevant exercise/week, 1–2 articles/week, 1–2 key concepts/week, week_name, and a single `overall_course_learning_outcomes` paragraph. Forbid "additional tips" and "learning outcomes by week" sections (already partially enforced).
  - **Gap mode**: pass a new `mode: "gap"` flag if `lessonPlanFiles.length > 0`, with system instruction to surface only net-new insights/gaps (do not paraphrase uploaded content).
- UI: when `lessonPlanFiles.length > 0`, show banner at top: "Since you've uploaded existing teaching materials, the plan below highlights gaps and additions not already covered in what you've shared."

### Section 6 — Card 3: Approve Diagnostic Quiz

- Reuse `DiagnosticQuestionsSetup.tsx` as-is. Only the route slot changes (already at `/teacher/setup/diagnostic`). Replace its progress bar with Back to Course Setup + Next → `/teacher/setup/ai-settings`.

### Section 7 — Card 4: AI Assistant Settings (combined)

- **New combined page** `src/pages/teacher/AIAssistantAndSettings.tsx` rendered at `/teacher/setup/ai-settings`:
  - **Part 1: Student AI TA Configuration** — inline the contents of `AITASettings.tsx` (system default prompt display + custom prompt textarea, save handler).
  - **Part 2: Enrollment and Course Settings** — inline the contents of `SettingsIntegrity.tsx` (publish settings, enrollment code, roster, weekly nudges).
  - One Save button at bottom that persists both sections.
  - Back to Course Setup + Next → `/teacher/setup/exam-mode`.
- **Remove** `Settings` entry from `TeacherLayout` sidebar; route `/teacher/settings` redirects to `/teacher/setup/ai-settings` for safety.

### Section 8 — Card 5: Exam Mode Settings

- Reuse `ExamMode.tsx` as-is at `/teacher/setup/exam-mode`. Replace progress bar with Back to Course Setup + a "Save & Finish" button that returns to `/teacher/setup`.

### Section 9 — Preserved (no changes)

- `CourseDashboard.tsx`, all student routes/pages, `Landing.tsx` role tiles, all data/API/AI logic.

---

### Files touched (summary)

**New**: `src/pages/TeacherIntro.tsx`, `src/pages/StudentIntro.tsx`, `src/pages/teacher/CourseSetup.tsx`, `src/pages/teacher/AIAssistantAndSettings.tsx`.

**Edited**: `src/pages/Landing.tsx` (route change only), `src/App.tsx` (routes), `src/layouts/TeacherLayout.tsx` (nav), `src/pages/teacher/TeacherOnboarding.tsx` (single-page rewrite), `src/pages/teacher/CourseMaterials.tsx` (slim down), `src/pages/teacher/CourseCreation.tsx` (output format + gap banner), `supabase/functions/generate-lesson-plan/index.ts` (schema + prompt + gap mode), `src/pages/teacher/DiagnosticQuestionsSetup.tsx`, `src/pages/teacher/ExamMode.tsx` (footer nav swap).

**DB migration**: add `profiles.institution text`, `profiles.designation text` (nullable, no constraint changes).

**Routing safety**: keep `/teacher/settings` as redirect to new combined page; remove Syllabus Review + Concepts from sidebar/flow but leave files in place.

After each section's edits, the route map and sidebar will be re-verified before moving on. No changes to student-side or Course Dashboard.
