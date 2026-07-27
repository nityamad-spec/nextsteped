# Plan: Per-Exam Exam Prep Panel

## Goal

On `/student/chat` in Exam Prep mode, replace the single "next exam" summary with a list of all published exams. Each exam must show its professor-defined label, configured number of questions, time limit, and completion status. Students can click a specific exam to start it.

## Decisions from clarification

- **Selection behavior**: Allow choosing — each exam is clickable/Start-able individually.
- **Labeling**: Use professor-defined `course_exams.label` (e.g., "Midterm", "Final"), auto-numbering only as fallback.
- **Question count source**: Use the configured `course_exams.breakdown` total.
- **Completed exams**: Show them in the list with a "Completed" badge and disabled Start.

## Current state (verified)

- `course_exams` already stores `id`, `label`, `length_min`, `breakdown`, `position`, `published_at`, `archived_at`.
- `assessment_results.exam_id` already links student attempts to exams.
- `AIChat.tsx` currently keeps `availableExamIds: string[]` and `nextExamIndex: number` and rotates via `consumeNextExamId`.
- `ExamPrepPanel.tsx` currently shows one combined banner + one global Start button. The settings panel is already disabled ("Settings are fixed by your professor").
- `handleStartExamWithSettings` accepts `ExamCustomSettings`; for professor-authored exams it ignores the custom cap and serves all questions for the consumed `examId`.

## Proposed changes

### 1. Data layer — fetch full exam metadata

**File**: `src/pages/student/AIChat.tsx`

Replace the `availableExamIds` / `nextExamIndex` state with a richer array:

```ts
interface StudentExamInfo {
  id: string;
  label: string;
  lengthMin: number;
  questionCount: number;
  position: number;
  isCompleted: boolean;
  bestScore?: number | null; // latest attempt score, if completed
}
```

Refactor `loadAvailableExamIds` into `loadAvailableExams`:

- Query `course_exams` for active, published rows, selecting `id, label, length_min, breakdown, position`.
- Query `assessment_results` for this student's exam attempts (group by `exam_id`, take latest `score`).
- Query `assessment_questions` for generated `exam_id`s to know which exams actually have questions.
- Build `StudentExamInfo[]`:
  - `questionCount = sum(breakdown values)` (with a fallback to `0` and a "Not configured" UI state if the object is empty).
  - `isCompleted = exam_id exists in attempts`.
  - `bestScore = latest attempt score`.
- Sort by `position` ascending, then `created_at` ascending.

Optionally extract this into a new `useStudentExams(courseId)` hook in `src/hooks/useStudentExams.ts` to keep `AIChat.tsx` focused.

Remove:

- `availableExamIds` state
- `nextExamIndex` state
- `rotationKey` / `consumeNextExamId` / localStorage rotation persistence
- Unused `handleStartExam` (it is already dead code)

### 2. UI layer — list all exams

**File**: `src/components/ExamPrepPanel.tsx`

Replace the single summary/start row with a scrollable/card list:

- Keep the top combined banner text, updating it to:
  > **Professor Recommended Settings: These simulate the exam.** Select an exam below to begin.
- Render each exam as a row/card containing:
  - Professor label (e.g., "Midterm")
  - Auto-number fallback if label is missing/empty (e.g., "Exam 1")
  - Badge: `{questionCount} questions`
  - Badge: `{lengthMin} min`
  - Status badge:
    - `Available` → primary Start button
    - `Completed` → secondary badge, Start button disabled, optionally show `Score: X%`
    - `Not ready` (no generated questions) → muted badge, Start disabled
- Remove the disabled global "Edit Settings" button and the global time/question badges, since each exam now carries its own metadata.
- Keep the **Performance** button if `onShowDashboard` is provided.

Layout options (choose during build):

- **Cards**: more visual, better for 1–3 exams.

I recommend a simple bordered list; it scales to 5+ exams and matches the existing panel style.

### 3. Start exam flow

**Files**: `src/pages/student/AIChat.tsx`, `src/components/ExamPrepPanel.tsx`

- Change `ExamPrepPanelProps`:
  - Replace `examCount?: number` and `nextExamIndex?: number` with `exams: StudentExamInfo[]`.
  - Change `onStart` signature to `onStart(examId: string)`.
- In `AIChat.tsx`, update `handleStartExamWithSettings`:
  - Accept `examId: string` directly.
  - Skip rotation logic.
  - Fetch questions for that exact `examId`.
  - Create the chat session title using the exam label (e.g., "Midterm Practice — Jul 27") instead of an auto-incremented number.
  - Set `currentExamId` to the chosen `examId`.
- Preserve existing behavior:
  - Professor-authored exams still serve all generated questions.
  - AI-generated fallback still applies visible-topic filter and cap.
  - Diagnostic gate still prevents entering exam mode without a completed diagnostic.

### 4. Type / prop updates

**File**: `src/components/ExamPrepPanel.tsx`, possibly `src/types/index.ts`

- Define `StudentExamInfo` in `src/types/index.ts` so both `AIChat.tsx` and `ExamPrepPanel.tsx` can import it.
- Update `ExamPrepPanelProps` to use the new type.

### 5. Edge cases & validation

- **Empty breakdown**: show `0 questions · Not configured` and disable Start.
- **No generated questions**: show `Not ready` status even if breakdown is non-zero.
- **All exams completed**: show a friendly empty state pointing to Performance dashboard.
- **No published exams**: keep the existing "Your professor hasn't published a practice exam yet" toast/empty state.
- **RLS**: reads from `course_exams` are already allowed for enrolled students; no policy change needed.

## Risks & constraints


| Risk                                                                                            | Mitigation                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `breakdown` sum may not match actual generated questions if generation failed or is incomplete. | Disable Start and show `Not ready` when `assessment_questions` count for that `exam_id` is zero. Optionally show a small mismatch warning if counts differ. |
| Removing rotation changes student behavior from sequential to free-choice.                      | This is the requested behavior; completed exams remain visible so students know what they have/haven't taken.                                               |
| Dead `handleStartExam` removal is safe because it is unreferenced.                              | Verify with a project-wide search before deleting.                                                                                                          |
| `course_exams.label` may be empty or duplicated.                                                | Fallback to "Exam {index+1}" and sort by `position` to keep order stable.                                                                                   |
| The existing `ExamCustomSettings` slider/input UI becomes unused.                               | Remove it from `ExamPrepPanel`; per-exam `length_min` is the source of truth.                                                                               |


## Implementation steps

1. **Refactor state & data fetch** in `AIChat.tsx` (or new `useStudentExams.ts`).
2. **Update types** in `src/types/index.ts`.
3. **Rebuild `ExamPrepPanel.tsx**` as a per-exam list.
4. **Wire start flow** so `onStart(examId)` launches the chosen exam.
5. **Type-check and test** with a course that has 0, 1, and 2+ published exams, including one completed attempt.

No database migration is required — all needed columns already exist.