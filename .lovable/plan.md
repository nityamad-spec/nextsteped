

## Plan: Restore Previous Answers on Back Navigation

### Problem
When a student navigates back to a previous question, the answer fields (`selected`, `textAnswer`, `confidence`) are reset to empty. The data exists in the arrays but isn't loaded back into the UI state.

### Root Cause
The Back button handler (line 361) sets `setSelected(null)`, `setTextAnswer("")`, `setConfidence(50)` and truncates the answer arrays. This discards the stored answer instead of restoring it.

### Fix (single file: `src/pages/student/DiagnosticQuiz.tsx`)

**Change the Back button handler** to restore the previous question's saved answer instead of clearing it:

1. When going back to question index `prevQ = currentQ - 1`:
   - Set `selected` to `answers[prevQ]` (or `null` if it was a short answer with value `-1`)
   - Set `textAnswer` to `textAnswers[prevQ]`
   - Set `confidence` to `confidences[prevQ]`
2. Truncate all arrays by removing the last entry (same as now) so the restored answer can be re-submitted when the student clicks Next again

**Updated Back handler logic:**
```
const prevQ = currentQ - 1;
const prevAnswer = answers[prevQ];
const prevText = textAnswers[prevQ];
const prevConfidence = confidences[prevQ];

setCurrentQ(prevQ);
setSelected(prevAnswer === -1 ? null : prevAnswer);
setTextAnswer(prevText || "");
setConfidence(prevConfidence ?? 50);
setAnswers(answers.slice(0, -1));
setTextAnswers(textAnswers.slice(0, -1));
setConfidences(confidences.slice(0, -1));
setQuestionTimes(questionTimes.slice(0, -1));
setQuestionIds(questionIds.slice(0, -1));
setQuestionStartTime(Date.now());
```

### Result
Students see their previously selected MCQ option, typed short answer, and confidence level pre-filled when navigating back. They can change their answer and proceed forward again.

