---
name: teacher-setup-flow
description: 7-step professor setup pipeline. Concept Review is now step 2 (between Materials and Lesson Plan). After onboarding, professors land on /teacher/setup.
type: feature
---

7-step pipeline: Materials → Concept Review → Lesson Plan → Diagnostic → AI Assistant → Exam Mode → Enrollment & Course Settings.

Landing:
- After teacher onboarding, navigate to `/teacher/setup` (Course Setup), not the dashboard.
- Returning professors with ≥1 course also land on `/teacher/setup` via TeacherRedirect.

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
