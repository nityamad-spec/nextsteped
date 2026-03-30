

## Plan: Pre-load Exam Settings from Database

### Problem
Lines 64-71 in `Assessments.tsx` initialize local state (`examTimeLimit`, `quizNumQuestions`, etc.) from `taSettings` at render time. But `taSettings` starts as `defaultTASettings` and only updates after the async DB fetch completes. There is no `useEffect` to sync the local state when the real values arrive, so the form always shows defaults.

### Fix
Add a `useEffect` that watches `taSettings` and `taLoading` — once loading completes, update all local settings state variables from the fetched `taSettings`.

### Changes

**`src/pages/teacher/Assessments.tsx`**
- Add a `useEffect` after the state declarations (after line 71):
  ```ts
  useEffect(() => {
    if (!taLoading) {
      setExamTimeLimit(taSettings.examTimeLimit || 60);
      setExamManualQuestions(taSettings.examManualQuestions ?? false);
      setExamManualCount(taSettings.examManualCount ?? 20);
      setQuizNumQuestions(taSettings.quizNumQuestions || 5);
      setQuizQuestionTypes(taSettings.quizQuestionMix || "mixed");
      setQuizTimeLimit(taSettings.quizTimeLimit || 10);
    }
  }, [taSettings, taLoading]);
  ```

### Files Modified
- `src/pages/teacher/Assessments.tsx` — add sync effect

