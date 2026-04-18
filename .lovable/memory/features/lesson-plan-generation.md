---
name: lesson-plan-generation
description: Lesson plan AI output format — week_name + overview + topics + 1 industry exercise + 1-2 articles + key concepts + overall course outcomes. Auto gap-mode when materials uploaded.
type: feature
---

`generate-lesson-plan` edge function emits per-week:
- `week_name` (3–6 word theme), `overview` (1–2 sentences)
- `concepts[]` (Topics Covered) — 2–5 items; last 1–2 surface as "Key Concepts to Include"
- `resources[]` capped: exactly 1 `coding-exercise` + 1–2 `article`
- top-level `overall_course_learning_outcomes` (one paragraph)

Renderer in `CourseCreation.tsx` shows: Week N — <week_name>, Overview, Topics Covered, Industry-Relevant Exercise & Suggested Articles (combined section), Key Concepts to Include (highlighted callout from last 1–2 concepts), and a closing "Overall Course Learning Outcomes" card.

NEVER render "Learning Outcomes by Week" or "Additional Tips".

Gap mode: auto-on when teacher uploaded any `lesson-plans` files. System prompt instructs AI to emit only NEW additions/gaps, mark all items `ai_suggested=true`. UI shows banner: "Since you've uploaded existing teaching materials, the plan below highlights gaps and additions not already covered in what you've shared."
