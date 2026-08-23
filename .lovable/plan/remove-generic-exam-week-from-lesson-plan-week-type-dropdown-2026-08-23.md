# Remove generic "Exam week" from lesson-plan week type dropdown

On `/teacher/setup/lesson-plan`, remove the generic "Exam week" (`other`) option from the per-week type dropdown. Keep the explicit "Midterm exam" and "Final exam" options, plus "Teaching week" and the gated "Coding/lab week".

## What changes

1. **Teacher editor (`src/pages/teacher/CourseCreation.tsx`)**
   - Remove the `<SelectItem value="other">Exam week</SelectItem>` line from the week type dropdown.
   - Update the `setWeekType` handler to exclude `"other"` from its allowed values.
   - Keep the existing generic-exam badge logic (`w.exam_type === null && w.is_exam_week` renders "Exam") so any grandfathered rows still display correctly.

2. **Backward compatibility**
   - Existing rows already saved with `is_exam_week = true` and `exam_type = null` remain valid; they simply cannot be newly created via the dropdown.
   - If the user changes a grandfathered exam week to another type, the only way to get it back is via Midterm/Final, which is intended.

## What does NOT change

- `lesson_plan_weeks.exam_type` column stays nullable.
- Midterm and Final exam types remain selectable.
- Exam-week behaviour (disable regenerate, hide quiz section, exam badge) is unchanged.
- No database migration is required.

## Risks / constraints

- Grandfathered generic exam weeks will look slightly inconsistent with the new UI (they can exist but not be re-selected). This is accepted per the user's preference.
- If `setWeekType` type is narrowed, any test or helper that passes `"other"` will need a matching update.

## Verification

- Manual check: the dropdown for a teaching week shows only Teaching / Midterm / Final / Coding-lab (when approved).
- Existing generic exam weeks still render the "Exam" badge.
- No typecheck or test regressions.
