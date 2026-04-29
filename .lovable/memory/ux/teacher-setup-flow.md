---
name: teacher-setup-flow
description: 7-step professor setup pipeline. Concept Review is now step 2 (between Materials and Lesson Plan). After onboarding, professors land on /teacher/setup. Setup progress is per-course so adding/switching courses gives a clean slate.
type: feature
---

7-step pipeline: Materials → Concept Review → Lesson Plan → Diagnostic → AI Assistant → Exam Mode → Enrollment & Course Settings.

Per-course progress (CRITICAL):
- `teacher_setup_progress` is keyed on `(teacher_id, course_id, step_id)` — a `course_id` column was added so badges (especially steps 5 "AI Assistant" and 7 "Enrollment") don't carry over from a previous course when the professor adds or switches courses.
- `src/lib/setupProgress.ts` helpers (`fetchStepProgress`, `markStepOpened`, `markStepCompleted`) all take `courseId` as a required argument; passing `null` is a no-op.
- Call sites: `CourseSetup.tsx`, `AIAssistantAndSettings.tsx`, `EnrollmentSettings.tsx`.

Landing (HARD GATE):
- After teacher onboarding, navigate to `/teacher/setup`. `TeacherRedirect` (App.tsx) calls `useTeacherSetupStatus()` on every login; incomplete → `/teacher/setup`, complete → `/teacher/courses/dashboard`.
- `TeacherLayout` enforces the gate; sidebar items render as locked while incomplete.
- Setup is "complete" only when ALL of: profile (name + department), course basics, ≥1 uploaded course material, ≥1 confirmed concept, AND a published lesson plan.

Materials step (`/teacher/setup/upload`):
- FileUploadZone STAGES selected files; confirmation checkbox required; delete via AlertDialog.
- Auto-parse syllabus on upload (background, fire-and-forget); writes `course-materials/{uid}/syllabus/approved-syllabus.json` and updates `courses.syllabus_json_path`.

Concept Review step (`/teacher/setup/concept-review`):
- Reads/writes `concepts` table.
- Sections (top → bottom): "Identify Concepts" trigger card → "Extracted Concepts" (per-unit suggestions from `suggest-concepts`) → **"Additional Concept Recommendations"** (NEW) → "Confirmed Concepts".
- "Additional Concept Recommendations" calls the `recommend-additional-concepts` edge function (Lovable AI google/gemini-2.5-pro). Returns `{ recommendations: [{ name, rationale, category }] }` where category ∈ `industry|foundational|gap`. Each recommendation card has Approve / Edit (inline rename) / Dismiss; Approved inserts into `concepts` (same flow as Extracted) and feeds lesson plan generation automatically.
- Continue requires ≥1 confirmed concept.

Lesson Plan step:
- Generated from confirmed concepts via `generate-lesson-plan`.
- Reads from the `concepts` table, so any approved Recommendation is included automatically.

CourseSetup card locking:
- concept-review locked until upload Complete.
- lesson-plan locked until concept-review Complete.

Removed / dormant:
- `MaterialQualityCheck.tsx` deleted; `quality-check` edge function dormant. `parse-syllabus` is invoked by `FileUploadZone` directly.
