# Pre-generated practice question pool (Upskilling pathway)

## What changes
- **Professor, /teacher/setup** — a new optional step called "Practice Question Pool" goes right after "Generate DSA Questions". It only appears for employment/upskilling courses.
  - Dropdown: **Non-coding** (MCQ / True-False / Short answer) or **Coding exercise** (small runnable problems with visible and hidden test cases).
  - Pick the weeks or concepts, how many questions (1–40 per run) and the difficulty mix, then click Generate.
  - New questions start as **Draft**. The professor can review, edit, approve or delete each one, and bulk-approve. Only approved questions reach students.
  - Coding items reuse the existing checks: the reference solution must pass all its tests, and the duplicate check applies. They also get a "Regenerate solution" button.
  - A coverage summary shows approved questions per concept and type, so gaps are easy to spot.
- **Student, Practice** — no questions are generated per student any more. Clicking Practice gives a set of 10 questions from the approved pool:
  - Only weeks that have been revealed so far count.
  - Weak concepts come first (low or no mastery), and questions the student has already seen are skipped.
  - Non-coding questions play in the current practice widget. Coding questions open the code terminal with Run and Submit, using unlimited attempts and no cap (the attempt cap stays specific to coding-lab weeks).
  - If there aren't enough unseen approved questions, the rest are filled with AI-generated ones, as happens today. These are labelled "AI-generated" and are not added to the pool.
- Academic (non-upskilling) courses keep today's behaviour.

## Risks
1. **Thin pool = repeated AI cost + ungated content.** Topping up with AI brings back the unreviewed questions this feature is meant to replace. We will log how often top-up happens and warn the professor on the coverage summary.
2. **Coding items are much more costly** to generate and validate (Judge0 runs for each test case). Large batches will be slow and may hit rate limits, so generation runs in small batches with progress shown.
3. **Answer leakage.** Pool answers are shared by every student. Answers and hidden tests live in a private table and are graded only on the server. If the client ever receives them, the whole class can share them.
4. **Mastery changes.** Pool questions get the same concept, Bloom level and difficulty tags, so mastery scoring still works. Mixing coding and non-coding questions in one set needs one clear score rule: coding counts as accuracy on test cases.
5. **Stale pool after lesson-plan or concept edits.** Questions tied to deleted or renamed concepts are hidden automatically and flagged for the professor. They are never silently served.
6. **Overlap with weekly coding exercises and the daily DSA bank.** Coding practice items are a separate bank so they don't count toward coding-lab progress or streaks. The duplicate check will also compare against those banks.
7. **Existing practice history** still works. Old sessions keep their stored questions.
8. **No questions until the professor acts.** Until approved questions exist, every student relies on the AI fallback.

## Technical details
- Migration: `practice_pool_questions` (course_id, kind `non_coding|coding`, format, concept_id, week_number, bloom_level, difficulty, question, options, language, starter_code, visible tests, status `draft|approved|archived`, created_by, timestamps) plus `practice_pool_private` (answer, explanation, hidden tests, reference solution), with `practice_pool_seen` (student_id, question_id, seen_at). Grants and RLS: course members get full access to their course's rows; enrolled students can SELECT approved public rows only; private rows go through the service role only. The existing topic and format-shape validation triggers apply.
- Edge functions:
  - `generate-practice-pool`: teacher-only. Reuses the grounded prompts from `generate-practice-questions` and the validation and dedup from `generate-coding-exercises`.
  - `serve-practice-set`: picks the questions by weakness, recent-seen and revealed-week rules, records what was seen, and tops up by calling the existing generator.
  - Grading: non-coding answers are checked on the server against the private answer. Coding uses `submit-coding-solution` with a new `bank: "practice"` (no cap, no progress row).
- UI: new `PracticePoolSetup.tsx` page and route, a card in `CourseSetup.tsx` (gated by course type), `PracticeQuestionsWidget` switches to `serve-practice-set` for upskilling courses, and a coding item hands off to `CodingTerminalWidget`.
- Tests: serving selection (weak-first, unseen, revealed weeks, top-up), RLS privacy of the private table, widget pool path, and a terminal practice-bank submit.
