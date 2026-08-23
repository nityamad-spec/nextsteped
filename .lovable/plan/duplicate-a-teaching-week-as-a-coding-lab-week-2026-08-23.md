# Duplicate a teaching week as a coding/lab week

One-click action in the lesson-plan editor (`/teacher/setup/lesson-plan`) that clones a teaching week into a new coding/lab week inserted immediately after it.

## What changes

**`src/pages/teacher/CourseCreation.tsx`** — the only file touched.

1. **New handler `duplicateWeekAsCoding(weekId)`** next to the existing `duplicateConceptToWeek` / `addWeek` handlers:
   - Finds the source week; builds a new `WeekPlan` with a fresh `id` (`w_new_<ts>`), `is_coding_week: true`, `is_exam_week: false`, `exam_type: null`, `locked: false`.
   - Copies `week_name` and `overview` as-is (professor edits after); copies `concepts` with **fresh local ids** via `makeId()` (same pattern as `duplicateConceptToWeek` — dnd-kit sortable ids must be unique; the underlying concept records stay shared since everything keys off name).
   - **Resources are NOT copied** — coding weeks use their own lab/exercise resources, not the teaching week's readings.
   - Splices the new week into the array immediately after the source week, then renumbers all weeks with the existing renumber helper (the same `map((w, i) => ({...w, week: i + 1}))` used by drag-reorder at ~line 134).
   - Calls `setPublished(false)` (marks plan dirty, requires re-publish) and expands the new week (`setExpandedWeeks`).
   - Toast: "Week N duplicated as coding/lab week — later weeks renumbered."

2. **New button in the week-card header**, next to the week-type Select (~line 1805):
   - Icon button: `Copy` icon, tooltip/aria-label "Duplicate as coding/lab week".
   - Visible only when: `codingApproved` (same gate as the Coding/lab option in the type dropdown) AND the week is a teaching week (`!w.is_exam_week && !w.is_coding_week`) — duplicating an exam week as coding makes no sense.
   - `onClick` stops propagation so it doesn't toggle the card's expand/collapse.

No database changes. No Concept Review changes (per your choice). No edge-function changes.

## Behavior notes

- **Immediate-insert renumbering:** the new coding week becomes Week N+1 and every later week shifts down one number. This matches how drag-reorder already renumbers, and the draft/publish flow persists `week_number` on save.
- **Already-published plans:** inserting mid-plan shifts week numbers for later weeks, which affects week-number-keyed surfaces (auto-reveal by course date, student unit progress, weekly-quiz `quiz_day`). This risk already exists for drag-reorder today and behaves identically; flagged here so you're aware when editing a live course.
- **Concept copies are dual mappings**, not duplicates of the `concepts` table record — theory week and coding week reference the same concept by name (consistent with the existing per-concept Copy dropdown).
- **Quiz generation:** the new coding week is automatically excluded from weekly-quiz generation by the existing `is_coding_week` guards in both the editor and `generate-weekly-quiz`.

## Verification

- Typecheck + full frontend test suite.
- Manual check in preview: duplicate a teaching week in a coding-approved course, confirm new coding week appears immediately after with copied concepts, later weeks renumbered, Coding/lab badge shown, quiz CTA absent, and the change persists after publish/reload.
