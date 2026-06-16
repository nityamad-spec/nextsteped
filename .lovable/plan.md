## Problem

In `supabase/functions/chat/index.ts`, `fetchClassMasterySnapshot` emits per-concept lines like:

```
loops: beginner 22, developing 12, proficient 6, expert 2 (avg developing)
functions: ... (avg proficient)
```

The trailing `(avg developing)` / `(avg proficient)` is meant as a summary tag, but the model is parroting that exact phrasing verbatim, producing nonsense like:

> The class seems to be struggling with a few concepts, with the "avg proficient" band appearing most frequently alongside "beginner" and "developing" levels.

So "avg proficient" is not a real band — it's the model copying our snapshot's parenthetical label and treating "avg" as part of the band name. The bands are only the four real ones (beginner / developing / proficient / expert).

## Fix

Single file: `supabase/functions/chat/index.ts`. Two small changes, no other files touched.

### 1. Reword the snapshot to remove the ambiguous "avg X" tag

In `fetchClassMasterySnapshot` (around line 342–355), change the per-concept line so the average is labelled unambiguously and uses a verb the model won't parrot as a band name. Example new shape:

```
Class mastery snapshot (N=42 students):
- Course level distribution: beginner 5, developing 18, proficient 14, expert 5
- Per-concept distribution (weakest first; counts are number of students in each band):
  loops — beginner 22, developing 12, proficient 6, expert 2 (class average band: developing)
  functions — beginner 10, developing 18, proficient 10, expert 4 (class average band: developing)
  ...
```

Key edits:
- Replace `(avg <band>)` with `(class average band: <band>)` so "average" is a clearly separate word and not glommed onto the band name.
- Add the one-line clarification "counts are number of students in each band" so the model doesn't misread the numbers.
- Keep the 4 real band names exactly as the only band tokens used.

### 2. Tighten the PROFESSOR_SECTION instruction (lines 523–526)

Add one sentence to the STUDENT MASTERY DATA block that names the only valid bands and forbids inventing new ones:

> The only mastery bands are beginner, developing, proficient, and expert. Never combine them with other words to form a new band name (e.g. there is no "avg proficient" band — "average" describes the concept's class average, not a band).

This is belt-and-braces with the snapshot rewording.

## Out of scope

- No changes to thresholds, no DB changes, no student-side prompt changes, no UI changes.
- `update-mastery` and cache-invalidation logic stay as they are.

## Verification

- Deploy `chat`.
- Re-ask "What concepts are students in the class struggling with?" on `/teacher/chat` and confirm the response uses only the four real bands (beginner / developing / proficient / expert) and never the string "avg <band>".
- Ask "How is the class doing overall?" and confirm the course-level distribution is read correctly (counts of students per band, not invented bands).
- Confirm a course with no mastery rows still gets a "data not available" answer (snapshot still returns empty string in that case).
