

## Plan: Add Short Answer Support to Diagnostic Quiz

### Problem
The quiz currently filters to only `mcq` and `true_false` formats, excluding 28 `short_answer` questions. Students see 32 of 60 in-test questions.

### Changes (single file: `src/pages/student/DiagnosticQuiz.tsx`)

**1. Update QuizQuestion type** — add `format` field (`"mcq" | "true_false" | "short_answer"`) and `correctAnswer` (string) to the interface.

**2. Remove format filter from DB query** — delete `.in("format", ["mcq", "true_false"])` so all in-test questions load.

**3. Add text answer state** — new `textAnswer` state (string) alongside the existing `selected` (number) state.

**4. Update question mapping** — store `format` and `answer` (raw correct answer string) on each mapped question.

**5. Render short answer UI** — when `question.format === "short_answer"`, show a `<Textarea>` instead of MCQ option buttons. The confidence slider appears once the student types something.

**6. Update scoring logic** — for short answer questions, do a case-insensitive trimmed comparison of the student's text against the stored correct answer. Store the text answer (or a sentinel like `-1`) in the answers array to keep array alignment consistent. The `handleAnswer` function checks `format` to decide whether to use `selected` (MCQ/TF) or `textAnswer` (short answer).

**7. Update submit button disabled state** — disabled when MCQ has no selection OR short answer textarea is empty.

**8. Reset `textAnswer` on navigation** — clear it alongside `selected` when moving between questions or going back.

### Scoring Detail
- MCQ/TF: unchanged (`selected === correctIndex`)
- Short answer: `textAnswer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase()`
- The answers array stores `selected` index for MCQ or `-1` for short answer (with a parallel `textAnswers` string array for the actual text)

### UX
- Short answer questions show a text input area with placeholder "Type your answer..."
- Same confidence slider appears after typing
- Question type badge shown (e.g. "Short Answer") so students know what's expected

