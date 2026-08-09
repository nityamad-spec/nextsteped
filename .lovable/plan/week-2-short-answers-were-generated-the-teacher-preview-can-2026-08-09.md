# Week 2 short answers were generated — the teacher preview can't display them

## What the data shows

Week 2 of Automata Theory & Compiler Design was regenerated at 16:52 UTC and stored 19 questions: 7 multiple choice, 8 short answer, 4 true/false — 2 short answers in every tier (standard, easy, medium, hard). Every short-answer row has a populated model answer and word budget. The generator log for that run confirms the same breakdown.

So generation followed your 40% mix. The problem is the Week Quiz Review dialog on the lesson plan page: it only knows about two formats. It labels every question either "MCQ" or "True / False", and it renders the answer purely as a list of options. Short-answer rows carry no options, so they show up as an empty "MCQ" card with no visible answer — which reads as "no short-answer questions were generated".

## Fix

Update the weekly quiz review dialog so short answers render properly:

- Label short-answer items "Short Answer" instead of falling back to "MCQ".
- For short-answer items, replace the empty options list with the reference answer, the model answer, and the suggested word limit.
- Add a small format summary at the top of the dialog (e.g. "7 multiple choice, 8 short answer, 4 true/false") so the mix is verifiable at a glance without scrolling.
- Keep MCQ and true/false rendering exactly as it is today.

## Technical notes

- Single file: `src/components/WeeklyQuizReviewDialog.tsx`. The query already selects `format`; it needs `model_answer` and `answer_max_words` added to the select, a third branch in the `fmtLabel` derivation, and a conditional body that skips the options list when `format === "short_answer"`.
- No database, generation, or student-side changes. `generate-weekly-quiz` is behaving correctly as of the 16:52 run.
- Weeks generated before today's generator fix still hold MCQ/true-false only and need individual regeneration to pick up the mix.
