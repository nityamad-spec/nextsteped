

## Plan: Fix Exam Mode Settings Persistence

### Root Causes Identified

**1. `defaultTASettings` is missing many fields**
The `defaultTASettings` object in `mockData.ts` is missing `examPresentation`, `customStudyPrompt`, `customExamPrompt`, `quizNumQuestions`, `quizQuestionMix`, `quizDifficulty`, `quizTimeLimit`, `examApproved`, `quizApproved`, `examManualQuestions`, `examManualCount`. When the ExamMode component initializes with `useState(taSettings)` before the DB fetch completes, these fields are `undefined`. Since the `useEffect` uses `taSettings.examApproved || false`, this works on load — but the initial render with defaults causes issues.

**2. `examQuestionMix` default is a display string, not a valid value**
The default `examQuestionMix` in `mockData.ts` is `"40% MCQ, 30% Short Answer, 30% Coding"` — a human-readable string that does NOT match any `<SelectItem>` value (e.g. `"mixed"`, `"mcq_short"`). This causes the Question Types Select to render empty, and the `questionEstimate` function to produce 0 questions (no matching case in the breakdown logic).

**3. `saveTASettings` uses `||` instead of `??` for boolean/numeric fields**
In `useTASettings.ts`, lines like `exam_approved: settings.examApproved || false` are safe, but in `ExamMode.tsx` the `useEffect` uses `taSettings.examManualQuestions || false` which is fine for booleans. However, `taSettings.quizNumQuestions || 5` would replace `0` with `5` if a teacher ever sets 0 questions. More critically, `examManualCount` defaults depend on a stale `estimate.total` during the effect.

### Changes

**1. `src/data/mockData.ts`** — Add all missing fields to `defaultTASettings`
- Set `examQuestionMix` to `"mixed"` (valid Select value)
- Add `examPresentation: "all_at_once"`, `customStudyPrompt: ""`, `customExamPrompt: ""`, `quizNumQuestions: 5`, `quizQuestionMix: "mixed"`, `quizDifficulty: "Medium"`, `quizTimeLimit: 10`, `examApproved: false`, `quizApproved: false`, `examManualQuestions: false`, `examManualCount: null`

**2. `src/pages/teacher/ExamMode.tsx`** — Fix state initialization and estimate reference
- Move `examApproved`, `quizApproved`, `examManualQuestions`, `examManualCount` state declarations **above** the `useEffect` (currently they are declared after it, which works in JS but makes the code fragile)
- In the `useEffect`, use `?? false` instead of `|| false` for booleans, and `?? 5` instead of `|| 5` for numbers to properly handle explicit `0` values
- Remove the stale `estimate.total` reference in the useEffect — use `taSettings.examManualCount ?? null` instead

**3. `src/hooks/useTASettings.ts`** — Use `??` for safety on boolean/numeric fields
- Change `exam_approved: settings.examApproved || false` to `settings.examApproved ?? false`
- Same for `quiz_approved`, `exam_manual_questions`

### Files Modified
- `src/data/mockData.ts` — complete `defaultTASettings` with valid defaults
- `src/pages/teacher/ExamMode.tsx` — fix state ordering and nullish coalescing
- `src/hooks/useTASettings.ts` — use `??` for boolean/numeric fields in save

