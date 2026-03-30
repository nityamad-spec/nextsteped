

## Plan: Standardise Answer Format Across Diagnostic and Assessment Results

### Current State

**`diagnostic_results.answers`** — Parallel arrays:
- `answers`: `[1, 0, -1, ...]` (selected option index; `-1` for short answer)
- `confidences`: `[100, 50, 0, ...]`
- `question_times`: `[12000, 8500, ...]` (ms)
- `question_ids`: `["uuid-1", "uuid-2", ...]`
- Short answer text is **not stored at all** — only `-1` index is saved

**`assessment_results.answers`** — Flat map: `{ "question-uuid": "B", "question-uuid-2": "typed text" }`
- No topic, correctness, question text, or time metadata
- Topic analytics in `AssessmentAnalytics.tsx` relies on joining back or parsing answer objects that may have a `topic` field

### Problems
1. Diagnostic short answer text is lost — only `-1` is stored
2. Neither format is self-contained; both need joins to interpret
3. Analytics code must handle different shapes per table
4. Parallel arrays in diagnostic can desync

### Proposed Standard Format

Both tables store `answers` as a **JSONB array of self-contained objects**:

```json
[
  {
    "question_id": "uuid-1",
    "question_text": "What is polymorphism?",
    "type": "mcq",
    "topic": "OOP",
    "selected": "B",
    "correct": "B",
    "is_correct": true,
    "time_ms": 12000,
    "confidence": 100
  },
  {
    "question_id": "uuid-2",
    "question_text": "Define encapsulation",
    "type": "short_answer",
    "topic": "OOP",
    "selected": "hiding internal state",
    "correct": "Hiding internal state",
    "is_correct": true,
    "time_ms": 8500,
    "confidence": 50
  }
]
```

- `confidence` and `time_ms` included when available (diagnostic), omitted when not (exam/quiz)
- `question_text` denormalized for historical readability
- `type` field distinguishes MCQ vs short answer for scoring/display

### Changes

**1. `src/pages/student/DiagnosticQuiz.tsx`** — Restructure answer capture
- Replace parallel `newAnswers`, `newConfidences`, `newQuestionTimes`, `newQuestionIds`, `newTextAnswers` arrays with a single array of standardised objects built during `handleNext`
- Each object captures: `question_id`, `question_text`, `type` (format), `topic`, `selected` (letter for MCQ, text for short answer), `correct`, `is_correct`, `time_ms`, `confidence`
- Insert into `diagnostic_results` with new `answers` format; still write legacy columns (`confidences`, `question_times`, `question_ids`) for backward compat

**2. `src/components/AssessmentView.tsx`** — Enrich answer payload
- Change `AssessmentResults.answers` from `Record<string, string>` to standardised array
- In `handleFinish`, build array of objects with `question_id`, `question_text`, `type`, `topic`, `selected`, `correct`, `is_correct`
- Update review screen to consume the new array format

**3. `src/pages/student/AIChat.tsx`** — Pass through new format
- `results.answers` is already passed directly to DB insert; just ensure type alignment

**4. `src/pages/teacher/AssessmentAnalytics.tsx`** — Update topic parsing
- Parse `answers` as array-of-objects with `topic` and `is_correct` fields
- Add backward-compatible fallback: if `answers` is a plain object (old format), skip topic aggregation gracefully

### No Schema Migration Needed
Both `answers` columns are already `jsonb` — the format change is purely in application code.

### Files Modified
- `src/pages/student/DiagnosticQuiz.tsx` — build standardised answer objects
- `src/components/AssessmentView.tsx` — enrich answer payload + update interface
- `src/pages/student/AIChat.tsx` — type alignment
- `src/pages/teacher/AssessmentAnalytics.tsx` — consume new format with backward compat

