

## Plan: Add Short Answer Support to AssessmentView

### Problem
`AssessmentView` only renders MCQ radio buttons. When a question has `type: "short_answer"`, the student sees the question text but **no input field** — they cannot answer it. Additionally, scoring uses strict equality which fails for minor variations in text answers.

### Changes

**1. `src/components/AssessmentView.tsx`** — Add text input for short answer questions
- After the MCQ `RadioGroup` block (line ~262), add a conditional block for `short_answer` type:
  - Render a `Textarea` input bound to `answers[currentQ.id]`
  - On change, call `handleAnswer(currentQ.id, value)`
- Update `handleFinish` scoring: for short answer questions, use **case-insensitive, trimmed** comparison (matching the diagnostic quiz approach)
- In the review screen, show the student's typed answer vs the correct answer

**2. `src/components/AssessmentView.tsx`** — Add true/false support (optional, since `assessment_questions` supports it)
- If `type === "true_false"`, render two styled buttons for True/False (reuse the radio pattern with fixed options)

### Scoring Logic
```
// Short answer: case-insensitive, trimmed match
if (q.type === "short_answer") {
  isCorrect = userAnswer?.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
} else {
  isCorrect = userAnswer === q.correctAnswer;
}
```

### Files Modified
- `src/components/AssessmentView.tsx` — add textarea input for short answer, update scoring logic

