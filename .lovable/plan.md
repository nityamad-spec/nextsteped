## Goal

Make `computeLearnerLevel` in `src/lib/diagnosticBranching.ts` branch-tier aware. The final level should depend on both the Phase A branch tier and the total correct out of 20. Remove the "Expert" tier from client-side computation.

## New rules

Input: `correct` (0–20 total), `branch` (`"easy" | "medium" | "hard"`).

| Branch | correct ≤ 10 | 11 ≤ correct ≤ 20 |
| --- | --- | --- |
| easy | Beginner | Developing |
| medium | Beginner | Developing |
| hard | Developing | Proficient |

"Expert" is no longer produced client-side (server-side `score-diagnostic` is unaffected).

## Changes

### 1. `src/lib/diagnosticBranching.ts`
- Change `LearnerLevel` type to `"beginner" | "developing" | "proficient"` (drop `"expert"`).
- Update `computeLearnerLevel` signature to `(correct: number, total: number, branch: BranchTier | null)`:
  - If `total <= 0` or `branch` is null → `"beginner"` (defensive).
  - Apply the table above using `correct <= 10` as the split.
  - `total` param kept for signature stability but no longer drives banding.

### 2. `src/pages/student/DiagnosticQuiz.tsx`
- Update the call site that invokes `computeLearnerLevel(correct, total)` to pass the chosen `branch` tier (already tracked in component state for Phase B / persistence).

### 3. Tests — `src/lib/diagnosticBranching.test.ts`
- Rewrite the `computeLearnerLevel — final cutoffs` block against the new table:
  - easy + 0, 5, 10 → beginner; easy + 11, 20 → developing
  - medium + 10 → beginner; medium + 15 → developing
  - hard + 10 → developing; hard + 11, 20 → proficient
  - null branch or total 0 → beginner
- Update the end-to-end "two-phase diagnostic flow" assertion that expects `["developing","proficient","expert"]` — remove `"expert"` and pass `branch` through.
- Update the persistence-shape tests (`submitMock`) to pass `branch` into `computeLearnerLevel`.

### 4. Callers/consumers
- Search for any other reader of `LearnerLevel` that hard-codes `"expert"` (e.g. heatmap legend, admin diagnostics view). If found and used for client-computed level, drop the expert branch; if it reads server-side `diagnostic_results.learner_level`, leave untouched (server still emits expert).

## Out of scope

- No changes to `pickBranchTier`, Phase A/B counts, or `isAnswerCorrect`.
- No changes to server-side `score-diagnostic` mastery/level logic.
- No UI copy or heatmap-color changes beyond removing dead "expert" handling that came from the client computation path.
