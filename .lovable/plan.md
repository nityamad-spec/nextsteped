# Daily DSA → Concept Mastery (skilling pathway)

Decisions locked in: solved daily problems give a **small, practice-strength** mastery nudge; only **fully passing** submissions count; each question is **tagged with a concept during generation** and confirmed by the professor.

## How it works

Each daily question gets a concept tag. When a student's submission passes all visible test cases **for the first time** on that question, the app records one small practice-strength signal against that concept — the same tier as practice questions, so daily grinding can lift a concept up to Proficient but never to Expert. Exams and quizzes still drive the high end. Failed attempts never move the score. Course mastery updates automatically, since it's the weighted average of concept scores.

## Changes

1. **Database**
   - Add nullable `concept_id` (FK to `concepts`) to `daily_dsa_questions` with an index. Existing questions stay untagged and simply don't feed mastery.

2. **Generation** (`generate-daily-dsa-questions`)
   - The prompt already grounds questions in each week's concepts; the model now also returns the `concept_code` each question tests, resolved to `concept_id` on save. Untaggable questions save with no tag.

3. **Professor review** (`CodingExerciseDialog` + `DsaQuestionsSetup`)
   - The daily-bank editor shows a concept dropdown (course concepts list) so the professor can confirm or change the tag before publishing. Publish does not require a tag — untagged questions are still playable, just mastery-neutral.

4. **Mastery feed** (`CodingTerminalWidget`)
   - On a fully passing daily submission, if this is the student's **first** pass on that question (checked against the attempts just written) and the question has a concept tag, invoke the existing `update-mastery` function with `source: "practice"` and a single weighted item carrying the question's Bloom level and difficulty. No new scoring logic — the existing EMA blend, Beta shrinkage, and practice-only Proficient cap apply unchanged.
   - Skipping re-pass credit keeps re-solving the same problem from farming mastery.

## Technical details

- Migration: additive nullable column + index only; no data changes.
- `update-mastery` already accepts `source: "practice"` with per-item weighted rows — reused as-is; no edge function changes.
- Concept code → id resolution uses the course's `concepts` rows fetched inside the generator.
- Tests: unit tests for first-pass gating and the concept-tag resolution; typecheck; existing daily DSA and mastery tests re-run.

## Verification

- Typecheck + full test suite.
- Browser pass: generate questions on an employment course, confirm tags appear in review, publish, solve today's problem as a student, and confirm the concept's mastery nudges on the home heatmap while a failed submission changes nothing.
