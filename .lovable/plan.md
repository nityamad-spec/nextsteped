## Bug
In `src/components/admin/StudentProfileDialog.tsx`, the weekly-quiz count filters `assessment_results` on `r.mode === "weekly_quiz"`, but quiz attempts are persisted with `mode = "daily_quiz"` (confirmed in `WeeklyQuizDialog.tsx` line 184 and `StudentHome.tsx` lines 173/199, and in the live DB — 117 `daily_quiz` rows, 0 `weekly_quiz` rows). Result: counter is stuck at 0 even after attempts.

## Fix
Single-line change in `src/components/admin/StudentProfileDialog.tsx` (inside `loadDetails`):

- Change `if (r.mode === "weekly_quiz" && r.quiz_day != null)` to `if (r.mode === "daily_quiz" && r.quiz_day != null)`.

No schema, RLS, or UI structure changes. Realtime subscription already listens to `assessment_results`, so once the filter is correct, counts will update live as new attempts arrive.