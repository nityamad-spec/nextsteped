---
name: lesson-plan-generation
description: Lesson plan AI output format and generation gating. Generation is now MANUAL — professor must fill Course Schedule (Total Weeks + Midterm + Final, all 3 required) and click "Generate Lesson Plan". After plan exists, "Regenerate" is replaced with "Update Plan" which only enables when schedule has changed since last generation.
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

## Generation gating (manual, schedule-driven)

`CourseCreation.tsx` has 3 phases: `idle` → `generating` → `plan`.
- **idle** (no plan exists): renders only the Course Schedule form (Total Weeks, Midterm Week, Final Week — all 3 required) + a disabled "Generate Lesson Plan" button. Button enables once all 3 fields are set; clicking it triggers `runGeneration()` and switches to `generating`.
- **generating**: shows the 3-step progress indicator. Errors offer Retry / Go to Concept Review / Back to Materials.
- **plan**: shows the full editable plan. The schedule card and the "Weekly Breakdown" header both expose a single "Update Plan" button (replaces the old "Regenerate" buttons). Update Plan is disabled unless ALL of: schedule complete AND `lastGeneratedSchedule` differs from current values. Clicking it opens a confirm modal ("This will replace your current weeks and any edits…") which calls `runGeneration()` directly.

`lastGeneratedSchedule` snapshot (`{ total_weeks, midterm_week, final_week }`) is set after each successful generation and persisted in the draft (`LessonPlanDraft.lastGeneratedSchedule`) so the change-detection survives reloads. Existing professors with a draft/published plan from before this change skip the empty state — `applyDraft` flips phase to `plan` immediately.

The previous auto-trigger effect (`if (phase === "generating" && !weeks.length && totalWeeks) runGeneration()`) has been REMOVED. Generation only happens via explicit user click.
