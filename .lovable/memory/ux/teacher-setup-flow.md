---
name: teacher-setup-flow
description: 7-step professor setup pipeline. Materials step requires explicit midterm/final exam choice (week or "No exam"). Lesson plan step auto-creates a draft course if none exists.
type: feature
---

7-step pipeline: Profile → Materials → Lesson Plan → Diagnostic → AI Assistant → Exam Mode → Publish.

Materials step (`/teacher/setup/materials`):
- Schedule + exams + uploads in one page.
- Midterm & Final exam week are REQUIRED selects: any week 1..N OR "No midterm exam" / "No final exam".
- Continue is gated on (≥1 syllabus or lesson plan file) AND both exam selections made.
- If no `currentCourseId` exists, this step auto-creates a draft course (name: "<Department> Course (Draft)" or "Untitled Course (Draft)", term: "Draft") so the lesson plan generator has a course to attach concepts/files to. Teachers can complete full course metadata later.

Lesson Plan step:
- Calls `generate-lesson-plan` edge function with the courseId.
- Edge function auto-extracts concepts into the `concepts` table (no separate concepts page).
