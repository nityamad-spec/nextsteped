# Fix duplicate coding exercises from one "Generate" click

## What happened (confirmed)
The 3 "Classify Support Ticket Priority" exercises in Week 3 were all saved at the same moment (2026-09-12 11:56:21) from a single "Generate exercises" click with a quantity of 3. The generator asks the AI for each exercise separately, all at the same time, and sends the exact same instructions every time. Each request only knows about exercises that already existed before the click, not about the others being written alongside it, so the AI returned the same idea three times. Nothing checks for duplicates before saving.

## Fix
1. **Give each exercise its own angle.** Before writing anything, work out a short list of distinct themes (for example ticket triage, log parsing, CSV cleanup), one per requested exercise. Each exercise gets its own theme plus a list of the others to stay away from.
2. **Duplicate check before saving.** Compare the new drafts with each other and with the week's existing exercises by normalised title and problem statement. If one is too close, regenerate it once with a stronger "must differ" instruction. If it is still a duplicate, drop it.
3. **Honest count.** The message after generating will say how many unique exercises were added, for example "2 of 3 added — 1 skipped as a duplicate."
4. **Existing duplicates stay put.** I won't delete anything on your course. You can remove the two extra copies with the trash button, or tell me to remove them.

## Technical details
- `supabase/functions/generate-coding-exercises/index.ts`: add a planning call (gpt-6-astra, low reasoning) that returns `count` distinct themes. Pass `theme` and `siblingThemes` into each `generateOne` prompt. After `Promise.allSettled`, dedupe on normalised title plus token overlap of the description (Jaccard ≥ 0.6) against each other and against `existing`, retry once per collision, and return `{ generated, skipped_duplicates }`.
- `src/components/teacher/CodingExercisesSection.tsx`: include `skipped_duplicates` in the success message.
- Test: generate 3 on a scratch week through the function and confirm 3 distinct titles. No test writes will touch the live Python or SK101 weeks.
