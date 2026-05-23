## Goal

On `/teacher/setup/lesson-plan`, expand the Course Schedule form so the professor must specify class cadence before generating a plan. Today the form asks only for Total Weeks, Midterm Week, and Final Week; the generator silently defaults to 2 sessions/week × 60 min. That's hidden, and it makes the AI's per-concept session estimates and pacing decisions invisible to the teacher.

Add two new required inputs:
1. **Classes per Week** (sessions_per_week)
2. **Duration per Class (minutes)** (session_length_minutes)

## What changes (UI/UX)

In `src/pages/teacher/CourseCreation.tsx`, inside the Course Schedule card (the "idle" empty state and the same card shown above the published plan):

- Change the grid from `sm:grid-cols-3` to a layout that fits 5 fields cleanly (e.g. two rows: row 1 = Total Weeks / Classes per Week / Duration; row 2 = Midterm Week / Final Week — or `sm:grid-cols-2 lg:grid-cols-3`).
- **Classes per Week**: numeric input, min 1, max 7, placeholder "e.g. 2", helper "1–7 classes/week".
- **Duration per Class**: numeric input in minutes, min 30, max 180, step 5, placeholder "e.g. 60", helper "30–180 min".
- Both marked required with the same `*` styling as the other three.
- Load existing values from `courses.sessions_per_week` and `courses.session_length_minutes` (already selected in the load effect — just extend the select list and local state).
- Persist via the existing `persistSchedule` helper (extend its patch type and the underlying `courses` update).

## Gating

- "Generate Lesson Plan" button: currently enabled when `totalWeeks && midtermWeek && finalWeek`. Update to also require `sessionsPerWeek && sessionLength`.
- "Update Plan" change-detection (`lastGeneratedSchedule`): extend the snapshot to include `sessions_per_week` and `session_length_minutes` so editing either of the new fields enables Update Plan and triggers the confirm modal.

## What does NOT need to change

- DB schema: `courses.sessions_per_week` and `courses.session_length_minutes` already exist.
- `generate-lesson-plan` edge function: already reads both columns and uses them in the LLM-A prompt and allocator. Once the UI writes real values, the generator's pacing and per-concept session estimates immediately reflect them.
- `regenerate-lesson-plan-week`: already selects the same two columns.
- No memory updates required beyond a small addendum to `mem://features/lesson-plan-generation` noting that cadence is now required input, not a silent default.

## Files touched

- `src/pages/teacher/CourseCreation.tsx` — add two local state vars, extend load effect, extend `persistSchedule` signature, render two new inputs in both Course Schedule cards (lines ~756–828 and ~1015–1085 region), extend `canGenerate` and `scheduleChanged` checks, extend `lastGeneratedSchedule` snapshot written after successful generation.
- `mem://features/lesson-plan-generation` — short note that the schedule form now requires 5 fields (Total Weeks, Classes/Week, Duration, Midterm, Final) and that change-detection includes cadence.

## Out of scope

- No changes to student-side rendering.
- No edge-function prompt rewrites — existing prompt already includes "Sessions/week: X, Session length: Y min".
- No migration; columns already exist with sane defaults so existing courses won't break (they'll show whatever value is stored, falling back to placeholder if null — teacher must fill before generating).
