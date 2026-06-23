## How mastery is calculated and stored

- The `update-mastery` edge function computes a per-concept EMA in the range **0..1** (clamped via `clamp01`), then derives the course's `mastery_score` as a weighted average of concept scores — also **0..1**.
- Both values are upserted into `student_concept_mastery` and `student_course_mastery` as numerics between 0 and 1 (e.g. Jayanvi's stored `mastery_score = 0.9764`, `learner_level = expert`).
- `learner_level` ("expert", etc.) is derived from the same 0..1 score by `bandFor()`.

## Why the dialog shows 0%

`StudentProfileDialog.tsx` displays `Math.floor(d.masteryScore)` with a `%` suffix. Since the stored value is `0.9764`, `Math.floor(0.9764)` = `0`, so it renders "0%" even though the level is Expert.

## Fix

In `src/components/admin/StudentProfileDialog.tsx`, convert the 0..1 score to a percent before flooring:

- Change the render line to `Math.floor((d.masteryScore ?? 0) * 100)%`, keeping the null check so missing scores still show "—".

No backend / schema / calc changes — only the display conversion.