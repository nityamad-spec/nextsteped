---
name: teacher-setup-flow
description: 7-step professor setup pipeline. Concept Review is now step 2 (between Materials and Lesson Plan). After onboarding, professors land on /teacher/setup.
type: feature
---

7-step pipeline: Materials → Concept Review → Lesson Plan → Diagnostic → AI Assistant → Exam Mode → Enrollment & Course Settings.

Landing (HARD GATE):
- After teacher onboarding, navigate to `/teacher/setup`.
- On every login, `TeacherRedirect` (App.tsx) calls `useTeacherSetupStatus()`. If setup is incomplete → forced to `/teacher/setup`. If complete → lands on `/teacher/courses/dashboard`.
- `TeacherLayout` enforces the gate: any visit to a non-setup, non-support route while setup is incomplete is auto-redirected to `/teacher/setup`. Sidebar items (Dashboard, Course Assistant, Lesson Plan & Resources) render as locked with tooltip "Complete your Course Setup to unlock this."
- Setup is "complete" only when ALL of: profile (name + department), course basics (name, course_code, term, graduation_year), ≥1 uploaded course material, ≥1 confirmed concept, AND a published lesson plan (`{uid}/lesson-plan/published-plan.json` in `course-materials` storage).
- Centralized in `src/hooks/useTeacherSetupStatus.ts` — reuse this hook for any new gating.

Materials step (`/teacher/setup/upload`):
- FileUploadZone STAGES selected files (does not upload on selection).
- Shows file name, type (extension), size summary.
- Required confirmation checkbox: "I confirm these materials are correct and aligned to my course syllabus." before Upload button enables.
- Delete uses shadcn AlertDialog: "Are you sure you want to delete [name]? This will remove it from your course materials and may affect concept mapping." with Cancel + red Delete.

Concept Review step (`/teacher/setup/concept-review`):
- Reads/writes `concepts` table (concept_code, weight, course_id).
- Confirmed list: grid of concept chips with hover-revealed X → inline "Remove? Confirm/Cancel" (no single-click delete).
- Manual add: "Add a concept..." input + Add button.
- AI-Suggested section: dashed border + bg-primary/5; calls `suggest-concepts` edge function (Lovable AI google/gemini-2.5-flash via tool calling) with courseId + existing concepts; each suggestion has Add (inserts to concepts table) + Dismiss.
- Continue requires ≥1 confirmed concept.

Lesson Plan step:
- "Key Concepts to Include" highlighted block REMOVED from week cards (concepts now confirmed upstream in Concept Review).
- Generated from confirmed concepts via `generate-lesson-plan`.

Content Library → Syllabus tab:
- "Approved Syllabus" download card REMOVED. Tab now shows only the syllabus files list.

CourseSetup card locking:
- concept-review locked until upload Complete.
- lesson-plan locked until concept-review Complete (≥1 concept exists).
