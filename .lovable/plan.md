Plan: Reformat mastery level display in the admin student profile dialog

Goal: In /admin/students, when a student profile dialog is opened, the per-course overview should put "Starting mastery level" and "Final mastery level" on the same line, and show the mastery percentage next to each label.

Current state: `src/components/admin/StudentProfileDialog.tsx` shows "Mastery score", "Final mastery level", and "Starting mastery level" each in separate 2-column grid cells. Starting mastery already shows a percentage next to its badge, but final mastery does not.

Changes needed in `src/components/admin/StudentProfileDialog.tsx`:

1. Replace the current "Final mastery level" and "Starting mastery level" grid cells with a single combined row that spans both columns.
2. Layout: put both levels side by side, each with its label and a percentage value, formatted as:
   - "Starting mastery level: <Badge level> <X>%"
   - "Final mastery level: <Badge level> <X>%"
   where the percentage is displayed next to the badge when the score is available, and shown as "—" when not available.
3. Remove the separate "Mastery score" cell, since its value is now shown next to the final mastery level label.
4. Keep the existing mastery level badge colors and capitalization styling from `masteryClass()`.
5. Keep the 2-column grid for other stats (course progress, quizzes, exams, proficient concepts) so the overall card layout remains compact.

No database, edge function, or schema changes are needed. The data is already fetched (`masteryScore`, `masteryLevel`, `startingMasteryScore`, `startingMasteryLevel`).

Acceptance criteria:
- Starting and final mastery levels appear on one line in the per-course overview.
- Each level displays the badge and, when available, the matching percentage (e.g., "Expert 87%").
- If a score is missing, the percentage is shown as "—".
- The badge colors and capitalization match the existing design.