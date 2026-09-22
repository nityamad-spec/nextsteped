# Plan: "Generate DSA questions" setup step

A new, skippable step in the teacher setup flow (right after Lesson Plan) that bulk-generates a dedicated daily-practice coding question bank for the whole course. The student Daily DSA card switches to this new bank.

## What the teacher sees

1. A new setup step "DSA Questions" between "Lesson Plan" and "Diagnostic Qs" in the progress bar, at `/teacher/setup/dsa-questions`.
2. The step only appears when relevant: the course's lesson plan has at least one coding week AND coding access is approved. Otherwise it is skipped automatically (Continue from Lesson Plan jumps straight to Diagnostic).
3. On the page: a short explainer, a total quantity picker (e.g. 10–40 questions), a language selector, optional guidance text, and one "Generate question bank" button. Generation streams progress live and distributes questions across the course's coding weeks automatically.
4. Generated questions land as drafts in a review list on the same page — same pattern as coding exercises: edit, delete, per-question AI validation, "Needs review" badges, and a Publish button that requires all questions reviewed.
5. "Skip for now" and "Continue" buttons; Continue marks the setup step complete.

## Student-facing change

- The Daily DSA card on /student/home picks from the new daily bank instead of the weekly coding-exercise bank.
- Same rules as now: one unattempted question per day (progress-ordered), solved day = all test cases pass, streak + history unchanged.
- "No bank yet" state now means "your professor hasn't published daily practice questions".

## Technical details

- **New table** `daily_dsa_questions` (mirrors coding_exercises: course_id, week_number, position, title, problem_statement, language, input/output spec, constraints, examples, standard_test_cases, starter_code, published, reviewed_at, bloom_level, teacher_id) plus `daily_dsa_private` for reference solution + hidden test cases + validation report. RLS: teachers manage their courses' rows; students read only published rows for enrolled courses. GRANTs included.
- **New edge function** `generate-daily-dsa-questions`: one teacher-initiated call (not scheduled), NDJSON stream with heartbeat frames like generate-coding-exercises, bounded to the requested count (cap 40), grounded in the week's concepts/materials, writes drafts. Uses the default model per project convention.
- **Reuse**: `runExerciseValidation` extended (or mirrored) for the new tables; `runCodeAgainstTestCases` reused as-is in the student terminal.
- **Setup flow**: route added in App.tsx; SetupProgressBar gains the step; Lesson Plan's Continue routes here when relevant, otherwise to Diagnostic; step completion recorded in teacher_setup_progress.
- **Student side**: `useDailyDsa` reads the new tables (published rows only); `coding_exercise_progress`/attempts stay as the solved/attempt records, keyed to the new question ids.
- **Tests**: unit tests for the picking logic against the new bank; typecheck passes.
