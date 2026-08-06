# Update Learning Path Progress Label

## Goal
On `/student/learning-path`, change the progress label under the Course Progress bar from "weekly quizzes" to "unit quizzes".

## Current State
In `src/pages/student/StudentLearningPath.tsx` (line ~235), the progress bar helper text reads:

```text
${passedQuizCount} of ${publishedQuizCount} weekly quizzes passed (>50%)
```

## Change
Replace the word "weekly quizzes" with "unit quizzes" in that single string. No other logic, data model, or behavior changes.

## Files Affected
- `src/pages/student/StudentLearningPath.tsx` — one-line string update.

## Risks
None. This is a cosmetic label change only; the underlying `passedQuizCount` and `publishedQuizCount` values remain unchanged.
