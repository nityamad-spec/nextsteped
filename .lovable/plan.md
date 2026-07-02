## Goal

On `/teacher/setup/exam-mode`, the "Edit Question — Exam Mode" dialog currently captures: Question, Assign to Exam, Difficulty, Concept, Question Type, options/answer. The underlying `assessment_questions` table stores more per-question metadata that's already used by mastery scoring, weekly-quiz generation dedup, and the student-facing question view — but it isn't editable here.

## Missing parameters (audited against `assessment_questions` schema)


| Column                                             | Editable today? | Recommendation                                                                                                                          |
| -------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `bloom_level` (int 1–6)                            | No              | **Add dropdown** (user request)                                                                                                         |
| `explanation` (text)                               | No              | **Add textarea** — already shown to students post-answer and set by AI-generated questions; teacher-authored ones currently save `null` |
| `difficulty_estimate` (0.00–1.00)                  | No              | Add in UI                                                                                                                               |
| `bloom_justification` / `difficulty_justification` | No              | Add in UI                                                                                                                               |
| `tier`                                             | No              | Skip — only meaningful for weekly quizzes, not exams (always `standard` here)                                                           |
| `item_code`, `in_test`, `is_distractor`            | No              | Skip — system-managed                                                                                                                   |


So two additions: **Bloom's level** and **Explanation**.

## Changes (frontend only — no schema migration)

**File:** `src/pages/teacher/ExamMode.tsx`

1. **State**
  - Add `formBloom: number` (1–6, default `2`) and `formExplanation: string` (default `""`).
2. **Reset / hydrate**
  - `openAddDialog`: reset `formBloom = 2`, `formExplanation = ""`.
  - `openEditDialog`: hydrate from the loaded question. Extend the question fetch (the query that populates `questions`) to also select `bloom_level, explanation` so edit prefills correctly.
  - Extend the local `EditableQuestion` type with `bloom_level?: number | null; explanation?: string | null`.
3. **Save (`handleSaveQuestion`)**
  - Include `bloom_level: formBloom` and `explanation: formExplanation.trim() || null` in the insert/update `row`.
  - Mirror the same fields into the optimistic `setQuestions` update so the list stays in sync without a refetch.
4. **Dialog UI** (inserted right after the existing Difficulty select, before Concept)
  - **Bloom's Level** `Select` with items:
    - `1 — Remember`
    - `2 — Understand`
    - `3 — Apply`
    - `4 — Analyze`
    - `5 — Evaluate`
    - `6 — Create`
    - Helper text: "Cognitive level assessed by this question."
  - **Explanation** `Textarea` (rows=2), optional. Helper text: "Shown to students after they submit an answer."
  - `difficulty_estimate: Floating point textbox`
  - `bloom_justification: Textarea`
  - `difficulty_justification: Textarea`
5. **View dialog** (`src/components/ExamQuestionsViewDialog.tsx`) already displays `Bloom {n}` — no change needed; teacher-edited values will now appear there too.

## Out of scope

- No changes to weekly-quiz or diagnostic dialogs.
- No changes to AI generation prompts — they already set `bloom_level` and `explanation`.
- No DB migration; all fields already exist and are `NOT NULL` with defaults (`bloom_level = 1`) or nullable (`explanation`).

## Verification

- Open an existing AI-generated exam question → confirm Bloom and Explanation prefill from DB.
- Change Bloom from 3→5, save, reopen → value persists; also visible in "View Questions" dialog badge.
- Add a new manual question with Bloom 4 and an explanation → row in `assessment_questions` shows both values.