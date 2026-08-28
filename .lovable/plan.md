# Course Type: Academic vs Employment Pathway

Add a required course-type choice at course creation that is locked once set, drives a different diagnostic for employment pathways, adds a professor-side Soft Skills setup step plus a student learning-path unit, gives admins visibility and override control, and tags every generated coding exercise with a Bloom level.

## 1. Course type field

- New column on courses: `course_type` with values `academic` | `employment` (default `academic`, not null).
- Required radio/segmented control on the professor's "Create course" form (Course Name, Code, Term, **Course Type**). Submit stays disabled until chosen.
- Locked after creation: the field is read-only everywhere on the professor side (shown as a badge on Course Setup and the course switcher/profile). A database rule blocks professors from changing it; only admins can.

## 2. Employment pathway diagnostic

- The diagnostic generator receives the course type and switches its authoring prompt:
  - Academic: current behaviour, unchanged.
  - Employment: items target workplace readiness — communication, collaboration, problem solving, professionalism, workplace judgement — still anchored to the course's concepts and the same question formats, mix controls, tiers, and scoring.
- Same tables, same review UI, same student flow. Only the prompt and item framing change, so nothing downstream needs rework.

## 3. Soft Skills module

**Professor side** — new optional setup step "Soft Skills" (same pattern as Project Lab):
- Appears in the Course Setup step list and as a nav item only for employment-pathway courses.
- Professor authors soft-skill modules: title, summary, learning outcomes, and ordered activities/prompts; publish toggle per module.
- Stored in a new `course_soft_skills` table (course-scoped, teacher-managed, students read published rows for courses they're enrolled in).

**Student side** — published soft-skills content renders as a separate unit in the Learning Path (its own card, appended after the lesson-plan units), following the existing unit card shell. No changes to academic courses.

## 4. Admin visibility and control

- Course type shown as a column/badge on the admin Courses list, with a filter.
- Admin course profile dialog can change the course type (the only place it can change after creation), with a warning that switching hides or reveals the Soft Skills step and changes future diagnostic generation.

## 5. Bloom level for coding exercises

- Coding exercise generation asks the model for a Bloom level (1-6) plus a one-line justification for each exercise.
- Stored on `coding_exercises` (`bloom_level`, `bloom_justification`), shown as a badge in the professor's exercise list and edit dialog, editable there.
- Advisory only for now — no scoring changes.

## Technical notes

- Migration 1: `courses.course_type` text not null default `'academic'` with a check constraint; extend the existing courses guard trigger so non-admin updates cannot change it.
- Migration 2: `public.course_soft_skills` (course_id, position, title, summary, outcomes, activities jsonb, published, timestamps) with GRANTs, RLS (course members manage; enrolled students select published), and an updated_at trigger.
- Migration 3: `coding_exercises.bloom_level int`, `bloom_justification text`.
- Front end: `NewCoursePage.tsx` (new field), `CourseSetup.tsx` (conditional step), `teacherNav.ts` + `App.tsx` (route/nav), new `SoftSkillsSetup.tsx`, `StudentLearningPath.tsx` (extra unit), `AdminCourses.tsx` + `CourseProfileDialog.tsx` (badge, filter, override), `CodingExercisesSection.tsx` / `CodingExerciseDialog.tsx` (Bloom badge).
- Edge functions: `generate-diagnostic-questions` (branch prompt on course type), `generate-coding-exercises` (Bloom output in schema + persistence).
- Existing courses are all treated as academic; no backfill needed.

## Phasing

1. Course type column, creation field, lock, admin badge/filter/override.
2. Employment diagnostic prompt branch.
3. Soft Skills table, professor step, student learning-path unit.
4. Bloom level on coding exercises.
