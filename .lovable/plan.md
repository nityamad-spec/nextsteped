# Plan: Difficulty & Bloom's level controls for coding questions in the Practice Pool

Scope: professor side only, at `/teacher/setup/practice-pool`. Non-coding questions are unchanged.

## What you'll see

- When generating **coding** practice questions, two new selectors appear next to the count/week controls:
  - **Difficulty:** Easy / Medium / Hard — defaults to **Medium**
  - **Bloom's level:** 1–6 — defaults to **3 (Apply)**
- The chosen values are sent with the generation request, so the AI writes the exercise at that difficulty and Bloom's level, and each generated question is saved with those values stamped on it.
- Each coding question card in the review list shows its difficulty and Bloom's level as badges.
- Before approving, the professor can **change difficulty and Bloom's level on each individual question** (small dropdowns on the card) — e.g. generate a batch at Medium/3, then bump one question to Hard/5.
- Non-coding questions keep their existing behavior (no changes).

## Technical details

1. **`src/pages/teacher/PracticePoolSetup.tsx`**
   - Add difficulty + Bloom's selects to the coding generation form (defaults Medium / 3), included in the `generate-practice-pool` request body.
   - Show difficulty/Bloom badges on coding question cards; add per-card dropdowns to edit both before approval (updates the draft row).

2. **Edge function `generate-practice-pool`**
   - Accept `difficulty` and `bloom_level` in the request; validate values.
   - Pass them into the generation prompt so the exercise (problem statement, constraints, test complexity) matches the requested level.
   - Stamp `difficulty` and `bloom_level` on inserted `practice_pool_questions` rows.

3. **Database**
   - The pool table already stores per-question metadata; confirm `difficulty` / `bloom_level` columns exist on `practice_pool_questions` — add them via a small migration only if missing (nullable, no impact on existing rows).

4. **Verification**
   - Typecheck + existing test suite.
   - No live generation runs against your real course unless you ask — read-only on live data.

## Not in scope

- Student-side changes (Part 1 — best attempt / solution reveal after attempts run out) — deferred.
- Changing how difficulty/Bloom affect which questions students are served (serving already prioritizes weak concepts/unseen; difficulty-based serving can be a follow-up if you want it).
