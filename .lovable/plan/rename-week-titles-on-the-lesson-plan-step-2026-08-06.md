# Rename week titles on the lesson plan step

Professors can currently edit a week's overview, topics, and resources, but the week name (the text after "Week 3 — ") is only changeable by regenerating the week with AI. This adds direct inline renaming.

## What changes

- Each week header gets a pencil (Edit) button next to the title.
- Clicking it swaps the title text for an inline input pre-filled with the current name.
- Enter or the check button saves; Escape or blur-cancel discards. Clicking inside the input does not expand/collapse the week or start a drag.
- Empty name is allowed and falls back to just "Week N" (same as today's display rule).
- The edit is applied to the in-memory plan and picked up by the existing draft auto-save, so it persists on reload and on publish (`lesson_plan_weeks.week_name`).
- Exam weeks can be renamed too — the exam badge stays.

## Technical notes

All in `src/pages/teacher/CourseCreation.tsx`, following the existing overview-edit pattern (`startEditOverview` / `saveOverview`, lines 868-877):

- Add `editingWeekNameId` / `editWeekNameValue` state plus `startEditWeekName(w)` and `saveWeekName()` helpers that map over `weeks` and set `week_name`.
- In the week header (around line 1594), conditionally render an `Input` instead of the `<p>` title when that week is being edited; wrap in a `stopPropagation` container so the header's click-to-toggle and the drag handle are unaffected.
- Call `setPublished(false)` on save so the "Publish"/re-publish state stays accurate, consistent with other edits.
- No database or edge function changes — `week_name` already round-trips through the draft, `upsertPublishedWeeks`, and the student-facing `useLearningPlan` hook.
