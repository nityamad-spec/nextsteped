# Generate Weekly Quiz on the Lesson Plan page

Today the "Generate Weekly Quiz" button on `/teacher/setup/lesson-plan` (rendered by `CourseCreation.tsx`, around line 1634) is a static button with no handler. Students already read weekly quiz questions from `assessment_questions` filtered by `mode='daily_quiz'` and `quiz_day=<week>` (`WeeklyQuizDialog.tsx`). We need to actually populate that table.

Generation mirrors the diagnostic flow (`supabase/functions/generate-diagnostic-questions/index.ts`) but is scoped to a single week's concepts, restricted to MCQ + True/False (no short answer / problem solving), and produces 10 questions in the same 5-standard + 5-adaptive shape.

## New edge function: `generate-weekly-quiz`

Inputs (POST JSON):
- `course_id` (uuid, required)
- `week_number` (integer, required) — maps to `assessment_questions.quiz_day`

Auth: requires the caller to be a course member (teacher or collaborator). Uses service role for inserts but verifies `auth.uid()` against `courses.teacher_id` / `course_teachers`.

Behavior:
1. Load the week's concepts from `concepts` (filtered by `course_id` and `week_number`). If none, return 400 "No concepts for this week".
2. Load `courses.name` for the prompt.
3. For each of 4 tiers, generate via Lovable AI Gateway (`google/gemini-2.5-pro`, same retry/validation pattern as diagnostic):
   - `standard`: 5 questions, difficulty 0.5
   - `easy`: 5 questions, difficulty 0.2
   - `medium`: 5 questions, difficulty 0.5
   - `hard`: 5 questions, difficulty 0.85
   
   Total 20 rows persisted per week. At quiz time the student takes the 5 standard, then the runtime picks the 5 adaptive from the matching tier based on score (<2 correct → easy, 2–3 → medium, 4–5 → hard — same thresholds we'll add to `WeeklyQuizDialog` separately if needed; quota of 5/tier guarantees enough).
4. Format restriction: prompt + tool schema only allow `format ∈ {"mcq","true_false"}`. MCQ requires exactly 4 distinct options; true/false requires exactly `["True","False"]` with the answer being one of them. Reuse the diagnostic validator with this relaxation, dropping the bloom/difficulty-justification CATEGORY ceremony (overkill for weekly quizzes) — keep just `difficulty_estimate`, `bloom_level`, `explanation`, `topic`.
5. Idempotency: before inserting, `delete from assessment_questions where course_id=? and mode='daily_quiz' and quiz_day=?` so re-clicking "Generate" overwrites cleanly.
6. Insert rows with: `mode='daily_quiz'`, `quiz_day=week_number`, `tier` ∈ {standard|easy|medium|hard}, `question_type` = `'MCQ'` or `'TF'`, `format` = `'mcq'` or `'true_false'`, `options` (jsonb array), `answer` (full text), `correct_index`, `concept_id`, `topic` = concept_code (validation trigger requires match), `teacher_id` = `courses.teacher_id`, `item_code` = `${week_number}-${tier}-${i}`.
7. Response: `{ ok: true, generated: <count>, by_tier: {...} }`.

`supabase/config.toml` already deploys functions with `verify_jwt = false`; no config change needed.

## Frontend changes — `src/pages/teacher/CourseCreation.tsx`

1. Add per-week generation state: `const [generatingQuizFor, setGeneratingQuizFor] = useState<Set<string>>(new Set())` keyed by `WeekPlan.id`, and `const [quizGenerated, setQuizGenerated] = useState<Record<number, number>>({})` (week_number → question count).
2. On mount (or when `courseId` resolves), one `select count` query against `assessment_questions` grouped by `quiz_day` for the course to populate `quizGenerated` so already-generated weeks show "Regenerate" + count.
3. Wire the "Generate Weekly Quiz" button (line 1634) to a new `handleGenerateWeeklyQuiz(week)`:
   - Guard: require `week.concepts.length > 0`, else toast "Add concepts to this week first".
   - Set loading; call `supabase.functions.invoke('generate-weekly-quiz', { body: { course_id, week_number: week.week } })`.
   - On success: update `quizGenerated[week.week]`, toast "Generated N questions for Week X".
   - On error: toast destructive with the error message.
   - Show `<Loader2 className="animate-spin"/>` and disable while pending.
4. Button label flips to "Regenerate Weekly Quiz" when `quizGenerated[week.week] > 0`, with a small "20 questions ready" muted caption next to "View Quiz Questions".
5. "View Quiz Questions" is out of scope for this task (leave as-is, non-functional placeholder).

## Out of scope

- Changing how `WeeklyQuizDialog` picks the adaptive 5 (it currently just loads the first 10 of `daily_quiz` rows for the week). A follow-up task can branch by score across the new `tier` column; for this task we just ensure 20 well-tiered rows exist so the runtime change is trivial.
- Editing/manual override of generated questions.
- Question-bank UI ("View Quiz Questions" button stays a placeholder).
- Backfill for existing courses — generation is on-demand per click.

## Technical notes

- Reuse `BLOOM_CATEGORY_BY_LEVEL` / hamilton allocation from diagnostic? No — weekly quotas are simpler (one concept list for the week, distribute by concept weight). Implement a lean version inline.
- True/false validation: `options` must equal `["True","False"]` exactly; `answer ∈ options`; `correct_index` = 0 or 1.
- The existing `assessment_questions_validate_topic` trigger enforces `topic = concepts.concept_code`, so the function must pass the concept code (not the human name) in `topic`.
- Tier value is constrained by `assessment_questions_tier_check` to `standard|easy|medium|hard` — matches our generation tiers.
