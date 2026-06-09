## Goal

On `/teacher/setup/exam-mode`, clicking **Generate Questions** on an exam card calls a new edge function that uses Gemini to generate exam questions. The questions are saved to `assessment_questions` with `mode = 'exam'` and linked to the specific exam via a new `exam_id` column. Generation is per-exam, MCQ + True/False only, distributed across concepts by weight, with no adaptive tiers (all students see the same set).

---

## 1. Database migration

Add `exam_id` to `assessment_questions` so generated questions are tied to one schedule item.

```sql
ALTER TABLE public.assessment_questions
  ADD COLUMN exam_id text;

CREATE INDEX idx_assessment_questions_course_exam
  ON public.assessment_questions (course_id, mode, exam_id);
```

- `text` (not uuid) because `ExamScheduleItem.id` is a client-generated string stored inside `course_ta_settings.exam_schedule` JSONB — not a FK target.
- Nullable so existing rows (weekly-quiz, legacy) are unaffected.
- No new RLS needed; existing policies on `assessment_questions` already cover by `course_id` / `teacher_id`.

## 2. New edge function: `generate-exam-questions`

Located at `supabase/functions/generate-exam-questions/index.ts`. Patterned on `generate-weekly-quiz` but without tiers.

**Input (POST JSON):**
```json
{ "course_id": "uuid", "exam_id": "string", "length_min": 60,
  "question_types": ["mcq","true_false"], "total_questions": 20 }
```

**Authorization:** must be course teacher, collaborator, or admin (same pattern as `generate-weekly-quiz`).

**Flow:**
1. Load `courses.name`.
2. Load all `concepts` for the course (id, concept_code, weight). Use **all course concepts**, ignore lesson-plan week visibility.
3. Compute per-concept question counts using **largest-remainder (Hamilton) method** with `min 0` per concept and totals summing to `total_questions`. Distribution is **pooled across types** (the model decides per-question type, constrained by `question_types`).
4. Compute a difficulty mix from `length_min` (used as complexity guidance):
   - `length_min ≤ 30` → 60% easy / 30% medium / 10% hard
   - `length_min ≤ 60` → 30% easy / 50% medium / 20% hard
   - `length_min ≤ 120` → 20% easy / 50% medium / 30% hard
   - `length_min > 120` → 10% easy / 50% medium / 40% hard
5. Generate in **batches of ~5 questions** (parallel requests, max 3 attempts per batch) against `google/gemini-2.5-flash` with a `submit_questions` tool schema.
6. Validate each question: format ∈ {mcq, true_false}; MCQ has 4 distinct non-empty options; T/F options are `["True","False"]`; answer ∈ options; topic matches a course concept_code; **bloom_level integer 1–4 (capped)**; explanation present.
7. Delete any existing rows for `(course_id, mode='exam', exam_id)` then insert new rows with `tier='standard'`, `mode='exam'`, the supplied `exam_id`, and proper `concept_id`/`topic` linkage.
8. Stream progress: response is `text/event-stream` emitting `{ generated: n, total: T }` events, ending with `{ ok:true, generated, by_type }`. This powers the "Generating 12/18…" spinner.

**System prompt (per batch):**
```
You are an expert assessment designer for the course "<COURSE_NAME>".
Generate exactly N exam questions for a final exam.

ALLOWED FORMATS: <mcq | true_false based on question_types>
DIFFICULTY MIX for this batch (counts): easy=Ne, medium=Nm, hard=Nh
CONCEPT TARGETS (each question's `topic` MUST be one of these exact concept codes; produce the listed count per concept):
  - <concept_code_1>: <count_1>
  - <concept_code_2>: <count_2>
  ...

STRICT RULES:
- MCQ: exactly 4 distinct non-empty options (no "A)" prefixes). `answer` is the FULL TEXT of the correct option.
- True/False: options MUST be exactly ["True","False"]. `answer` must be "True" or "False".
- `difficulty_estimate` ∈ [0,1] aligned with assigned difficulty bucket.
- `bloom_level` integer 1–4 only (Remember/Understand/Apply/Analyze).
- `content_text` ≤ 600 chars, exam-appropriate complexity for a <length_min>-minute exam.
- `explanation`: 1–2 sentences.
- `topic`: exactly one of the concept codes above.
- Do NOT generate short-answer, coding, or essay items.
```

## 3. Frontend wiring (`src/pages/teacher/ExamMode.tsx`)

The existing **Generate Questions** button (line ~526) currently has an empty handler. Changes:

- Add state: `generatingExamId: string | null`, `generationProgress: { current: number; total: number } | null`, `existingExamQuestionCounts: Record<string, number>`.
- On mount and after every successful generation, query `assessment_questions` for `(course_id, mode='exam')`, group by `exam_id`, store counts.
- **Disable Generate Questions** when `existingExamQuestionCounts[exam.id] > 0`. Show "Questions Generated (N)" label and a small **View** button that opens a read-only dialog listing the questions for that exam (no approval flow per request).
- The button is also disabled until `exam.approved === true` (so the estimate is locked).
- Click handler:
  1. Compute `total_questions = sum of exam.breakdown values`.
  2. Map `examQuestionTypes` → `["mcq","true_false"]` keys.
  3. POST to the edge function with `course_id, exam_id, length_min, question_types, total_questions`.
  4. Read the SSE stream and update `generationProgress` to render "Generating 12/18…" inside the button.
  5. On completion: toast success, refresh counts, leave the exam card showing "Questions Generated (N) · View".
  6. On error: toast the error, re-enable the button.

No changes to `useTASettings` (the `exam_schedule` JSON already carries the stable `id` we use as `exam_id`).

## 4. View-questions dialog

A new lightweight `ExamQuestionsViewDialog` component (read-only):
- Fetches `assessment_questions where course_id=? and mode='exam' and exam_id=?`.
- Lists question text, type badge, options with the correct one highlighted, topic (concept code), difficulty, bloom level, explanation.
- No edit/delete/approve actions (per spec: "no approval needed").

## 5. Out of scope

- Regeneration UX beyond the disabled-button rule (user can manually delete rows from Assessments page if needed; we don't add a "Regenerate" button this pass).
- Exposing `exam_id` to students or wiring exam-taking flow — only generation + persistence + teacher view in this pass.
- Changing `ExamScheduleItem.kind` typing, weekly-quiz behavior, or any other page.
- Backfilling `exam_id` on existing rows (there are none for `mode='exam'` yet beyond manual entries; those stay `NULL`).

## Assumptions (please confirm or correct)

1. **`exam_id` is `text`, not a FK** — because schedule items live inside JSONB on `course_ta_settings`, not a relational table. If you'd rather promote `exam_schedule` to a real table, that's a larger refactor.
2. **Disable-when-exists is per exam card** — based on a count query against `assessment_questions` filtered by `exam_id`. No "regenerate" affordance is added; if you want one later, we can add a destructive "Regenerate" button that deletes and re-runs.
3. **Difficulty mix is derived from `length_min`** using the 4-bucket table above; you said "mix" + "lengthMin as guidance". If you want explicit teacher control, we'd need a new UI control — not adding one now.
4. **Bloom cap = 4** (Remember/Understand/Apply/Analyze) since MCQ/TF can't reliably assess Evaluate/Create.
5. **Concept distribution uses `concepts.weight`** across ALL course concepts (not filtered by lesson-plan visibility), via Hamilton/largest-remainder with floor 0. Concepts with weight 0 get 0 questions.
6. **Pooled-across-types distribution** means we allocate question *slots* per concept, and the model picks each slot's format from the allowed types. We do NOT enforce a per-type-per-concept matrix.
7. **Batch size = ~5, max 3 attempts per batch, parallel** — mirrors `generate-weekly-quiz` to stay under the 150s edge timeout. Streaming SSE is needed to drive the "12/18" counter; if you'd rather have a simple indeterminate spinner, the function can return a single JSON response and we drop the SSE plumbing.
8. **Existing un-linked exam questions in `assessment_questions` with `mode='exam'` and `exam_id IS NULL`** are left alone and not shown in the per-exam View dialog. They'll keep appearing on the Assessments page as before.
9. **Re-generation policy**: if rows exist for `(course_id, exam_id)`, generation is blocked at the UI; the edge function itself will also refuse unless an explicit `replace: true` flag is sent (not wired in UI yet).
10. **No course-context enrichment** beyond `courses.name` and the concept list (per your answer to Q16).
