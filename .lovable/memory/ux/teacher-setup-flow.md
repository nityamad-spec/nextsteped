---
name: teacher-setup-flow
description: 7-step professor setup pipeline. Concept Review is now step 2 (between Materials and Lesson Plan). After onboarding, professors land on /teacher/setup. Syllabus uploads auto-parse to JSON in the background.
type: feature
---

7-step pipeline: Materials → Concept Review → Lesson Plan → Diagnostic → AI Assistant → Exam Mode → Enrollment & Course Settings.

Landing (HARD GATE):
- After teacher onboarding, navigate to `/teacher/setup`.
- On every login, `TeacherRedirect` (App.tsx) calls `useTeacherSetupStatus()`. If setup is incomplete → forced to `/teacher/setup`. If complete → lands on `/teacher/courses/dashboard`.
- `TeacherLayout` enforces the gate: any visit to a non-setup, non-support route while setup is incomplete is auto-redirected to `/teacher/setup`. Sidebar items (Dashboard, Course Assistant, Lesson Plan & Resources) render as locked with tooltip "Complete your Course Setup to unlock this."
- Setup is "complete" only when ALL of: profile (name + department), course basics (name, course_code, term, graduation_year), ≥1 uploaded course material, ≥1 confirmed concept, AND a published lesson plan (`{uid}/lesson-plan/published-plan.json` in `course-materials` storage).
- Centralized in `src/hooks/useTeacherSetupStatus.ts` — reuse this hook for any new gating.
- Per-step "opened / In Progress" state is persisted in the `teacher_setup_progress` table (fields: teacher_id, step_id, opened_at; unique on teacher_id+step_id; RLS: teacher manages own rows, admin manages all). `CourseSetup.tsx` reads via `fetchOpenedSteps(uid)` and writes via `markStepOpened(uid, stepId)` (upsert) — replaces the prior `localStorage` `setup-opened:{uid}` key so In Progress badges follow the professor across devices and logins.

Materials step (`/teacher/setup/upload`):
- FileUploadZone STAGES selected files (does not upload on selection).
- Shows file name, type (extension), size summary.
- Required confirmation checkbox: "I confirm these materials are correct and aligned to my course syllabus." before Upload button enables.
- Delete uses shadcn AlertDialog: "Are you sure you want to delete [name]? This will remove it from your course materials and may affect concept mapping." with Cancel + red Delete.
- **Auto-parse (background, fire-and-forget):** when a file is uploaded with `folderType === "syllabus"`, `FileUploadZone` invokes the `parse-syllabus` edge function with the file's base64 content, writes the structured result to `course-materials/{uid}/syllabus/approved-syllabus.json` (upsert), and `UPDATE`s `courses.syllabus_json_path` for the latest course owned by the teacher. A small inline pill on the syllabus row shows `Parsing… → Parsed ✓ → Parse failed` (non-blocking; failures never gate the Next button). Re-uploads overwrite the JSON. If the last syllabus file is deleted, the JSON is removed and `syllabus_json_path` is cleared.
- If no `courses` row exists yet when parsing finishes, `CourseMaterials.handleNext()` back-fills `syllabus_json_path = "{uid}/syllabus/approved-syllabus.json"` on the lazily-created draft course alongside the existing `course_id` back-fill on `course_material_files`.

Concept Review step (`/teacher/setup/concept-review`):
- Reads/writes `concepts` table (concept_code, weight, course_id).
- Confirmed list: grid of concept chips with hover-revealed X → inline "Remove? Confirm/Cancel" (no single-click delete).
- Manual add: "Add a concept..." input + Add button.
- AI-Suggested section: dashed border + bg-primary/5; calls `suggest-concepts` edge function (Lovable AI google/gemini-2.5-flash via tool calling) with courseId + existing concepts; each suggestion has Add (inserts to concepts table) + Dismiss. Now backed by `courses.syllabus_json_path` (set during upload) instead of NULL — `suggest-concepts` reads the parsed syllabus JSON for higher-fidelity grounding.
- Continue requires ≥1 confirmed concept.

Lesson Plan step:
- "Key Concepts to Include" highlighted block REMOVED from week cards (concepts now confirmed upstream in Concept Review).
- Generated from confirmed concepts via `generate-lesson-plan`.

Content Library → Syllabus tab:
- "Approved Syllabus" download card REMOVED. Tab now shows only the syllabus files list.

CourseSetup card locking:
- concept-review locked until upload Complete.
- lesson-plan locked until concept-review Complete (≥1 concept exists).

Removed / dormant:
- `src/pages/teacher/MaterialQualityCheck.tsx` was deleted; the standalone "Syllabus Review" UI step is no longer in the flow. The `parse-syllabus` edge function is still used (now invoked by `FileUploadZone`), but the `quality-check` edge function is dormant — no UI references it. Leave it deployed for now; revive if a teacher-facing review is reintroduced later.
