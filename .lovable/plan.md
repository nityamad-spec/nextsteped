# Fix incomplete weekly quiz generation (17/20 questions)

## What was found

Week 1 of the course stored 5 standard, 5 easy, 5 medium and only **2 hard** questions — exactly the 17 shown in the UI. Week 2 has a similar gap (medium = 3). So this is a recurring shortfall, not a one-off.

Edge function logs for that run are no longer retained, so the exact rejection reasons are unconfirmed. What the code and data do show:

- The hard tier is by far the strictest gate: `difficulty_estimate` must land in 0.85 ± 0.15, Bloom must be 3-4, MCQ options must pass length-parity, and every candidate must survive same-tier and cross-tier duplicate checks. The two hard questions that did land came in at 0.75 and 0.90 — right at the band edges.
- Week 1 has exactly **one** concept ("Foundations of Automata Theory"). Seven distinct, genuinely hard, non-paraphrased questions on a single concept is where the duplicate filter starts rejecting almost everything.
- The retry budget is thin: `maxAttempts: 2` per tier, then a backfill loop with only ~90s reserved out of the 280s wall clock, using `gemini-2.5-pro` at up to 60s per call. One slow call can consume the entire backfill reserve, and the loop bails when under 10s remain.
- When the run finishes short, the function returns `partial: true` and per-tier counts, but the UI ignores both and just prints "17 questions ready".

## The fix

**1. Make short tiers actually get filled**
- Give the backfill loop a real budget: reserve ~120s instead of 90s, and let short tiers run more attempts (backfill calls pass `maxAttempts: 3` and `overGenerate: 0` so effort goes into the missing count rather than a reserve pool).
- Prioritise the still-short tier in the backfill: run only the short tiers, with the full remaining wall clock.

**2. Relax the hard band only when the week is concept-poor**
- If a week has fewer than 3 concepts, widen the hard tier to 0.78 ± 0.20 and the other tiers by ±0.05, and raise the per-tier duplicate tolerance slightly. Weeks with 3+ concepts keep today's strict bands.
- Bloom 3-4 requirement for hard stays unchanged, so hard questions remain clearly harder than medium.

**3. Auto top-up on demand**
- The function accepts an optional `top_up: true` mode: instead of deleting and regenerating the whole week, it reads the existing rows, computes the per-tier shortfall, generates only the missing questions (passing existing questions in the avoid list), and inserts them alongside.
- The lesson plan shows a "Top up 3 missing" button next to the count whenever any tier is short; clicking it runs the top-up pass.

**4. Detailed professor visibility**
- Replace "17 questions ready" with "17/20 ready - 3 hard missing" (amber) when short, and keep the plain green "20 questions ready" when complete.
- The tier breakdown comes from the counts already returned by the function plus a per-tier count query on page load, so the warning survives a page refresh.

## Technical steps

1. `supabase/functions/generate-weekly-quiz/index.ts`
   - Add `conceptScarcity` handling: compute `Object.keys(conceptByCode).length`; when < 3, apply widened difficulty bands per tier before `validateCandidate`.
   - Backfill loop: reserve 120s (`GLOBAL_DEADLINE_MS - 120_000` for the main pass), pass `{ maxAttempts: 3, overGenerate: 0 }`, and keep the 3-pass cap.
   - Add `top_up` request flag: skip the delete step, load existing rows for the week, seed `allQuestions` counts from them, and only insert newly generated rows (with `item_code` suffixed to avoid collisions).
   - Keep returning `by_tier`, `requested`, `partial`, `tier_errors`.
2. `src/pages/teacher/CourseCreation.tsx`
   - Track per-week tier counts (query `assessment_questions` grouped by tier on load, refresh after generation).
   - Render "N/20 ready - X <tier> missing" with amber styling and a "Top up" button that calls the function with `top_up: true`.
3. Deploy `generate-weekly-quiz` and verify by regenerating Week 1 and confirming 5/5/5/5 lands in the database.

## Risks

- Widening the hard band for single-concept weeks makes those hard questions slightly easier on average; the Bloom 3-4 floor limits how much.
- Longer backfill means a full regeneration can now approach the ~5 minute cap; the streaming heartbeat already keeps the connection alive, but the professor waits longer.
- Top-up appends to existing questions, so repeated top-ups on the same week could exceed 5 per tier if the shortfall calculation drifts; the insert is capped at the exact shortfall to prevent this.
- Root cause is inferred from code plus the stored question rows, not from logs. The first implementation step is to add a persistent per-tier generation log line (tier, requested, accepted, rejection reasons) so the next short run is diagnosable directly.
