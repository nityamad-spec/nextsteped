Preserve presentation order so the weekly quiz always shows the 5 standard questions first, followed by the 5 adaptive questions.

Change (`src/components/WeeklyQuizDialog.tsx`)
- Remove the final `seededShuffle([...standard, ...adaptive], seed + ":order")` step.
- Keep the per-tier seeded shuffles (so within-tier order still varies deterministically per student), then concatenate `standard` then `adaptive` and return as-is.

Verification
- Reload `/student/home`, open a week's quiz, confirm questions 1–5 are `tier = standard` rows and questions 6–10 are the chosen adaptive tier.