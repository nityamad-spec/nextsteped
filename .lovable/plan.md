# Sync generated exams to student exam prep

## Goal
When a professor generates exam questions on `/teacher/setup/exam-mode`, students taking that course see them in `/student/chat` Exam Prep mode. If multiple exams are generated, each "Start Exam" click rotates through them; if only one, the same exam is replayed.

## Changes

### 1. `supabase/functions/generate-exam-questions/index.ts` — Normalize casing
Currently writes lowercase `"mcq"` / `"true_false"` into `assessment_questions.question_type`. Update to write the legacy/canonical casing the student code already expects:
- `"mcq"` → `"MCQ"`
- `"true_false"` → `"True/False"`

System-prompt JSON schema and validation kept lowercase internally, but the row insert maps to the canonical strings. No frontend mapping changes needed (legacy "MCQ"/"True/False"/"TF" branch in `fetchDBQuestions` already handles them).

### 2. `src/pages/student/AIChat.tsx` — Per-exam fetching + rotation
`fetchDBQuestions("exam")` currently pools every row with `mode='exam'` regardless of `exam_id`. Replace exam logic with:

- **New helper** `fetchAvailableExamIds(courseId)` → returns sorted `string[]` of distinct `exam_id` values (non-null) the professor has generated questions for, ordered by exam date if available in the course's `exam_schedule` JSONB (else by `exam_id` string).
- **State**: `availableExamIds: string[]`, `nextExamIndex: number` (persisted in `localStorage` under key `examPrepRotation:{courseId}:{userId}` so rotation survives reloads).
- **On mode switch to "exam"**: load `availableExamIds` and read the saved index.
- **On Start Exam click** (both `handleStartExam` and `handleStartExamWithSettings`):
  1. If `availableExamIds.length === 0` → keep current fallback behavior (legacy un-linked exam rows, then mock bank).
  2. Else pick `examId = availableExamIds[nextExamIndex % availableExamIds.length]`, fetch only rows where `exam_id = examId`, then advance and persist `nextExamIndex`.
  3. Apply existing `filterByVisibleTopics`, seeded shuffle, type-mix filter, and `count` slice on that single-exam pool.
- The seeded-shuffle seed gains the `examId` so each exam shuffles independently.

### 3. `src/components/ExamPrepPanel.tsx` — UI note about published exams
Add a small info line above the Start Exam button:

- `0 exams` → `"Your professor hasn't generated any exam practice yet — you'll get a sample set."`
- `1 exam` → `"1 practice exam available — you can retake it as often as you like."`
- `N > 1 exams` → `"N practice exams available — each click on Start Exam rotates to the next one (currently: Exam {nextExamIndex+1} of N)."`

To compute this without duplicating queries, lift `availableExamIds` and `nextExamIndex` into AIChat and pass them as props to `ExamPrepPanel` (alongside existing `taSettings` / `onStart` / `onShowDashboard`).

## Out of scope
- Realtime subscription (user said no).
- AI chat RAG cache bump (user said no).
- Letting the student manually pick which exam to take (rotation is automatic).
- Tracking which exams a student has already completed via `assessment_results` (rotation index is local per browser; sufficient for v1).

## Files touched
- `supabase/functions/generate-exam-questions/index.ts` — casing normalization in DB insert
- `src/pages/student/AIChat.tsx` — exam-id-aware fetch + rotation state + localStorage
- `src/components/ExamPrepPanel.tsx` — props + info note
