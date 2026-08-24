# Coding exercise review flow — auto-open review dialog + required reviewed flag

## Goal

On `/teacher/setup/lesson-plan`, after "Generate exercises" runs for a coding/lab week, the teacher is walked through every generated exercise in an editable review dialog showing all fields (problem statement, input/output specs, constraints, examples, reference solution, standard + hidden test cases with expected outputs). Publishing is blocked until every exercise for the week is explicitly marked reviewed.

## Current state (verified)

- Generation writes exercises to `coding_exercises` (+ `coding_exercise_private`) as unpublished drafts; result payload is `{ generated, total_for_week }` (no ids).
- `CodingExerciseDialog.tsx` already edits every required field; it opens only via the pencil icon.
- Publish gating today checks only `exerciseMissingFields` — there is no reviewed flag.
- `coding_exercises` has no review-tracking column.

## Changes

### 1. Database — add review tracking (migration)

- `ALTER TABLE public.coding_exercises ADD COLUMN reviewed_at timestamptz;` — null = not reviewed. (Column add only; existing table grants unchanged.)
- One-time backfill (via run_sql, after migration): set `reviewed_at = published_at` for rows already published, so existing live exercises aren't retroactively blocked. Existing unpublished drafts stay unreviewed.

### 2. `src/lib/codingExercises.ts`

- Add `reviewed_at: string | null` to `CodingExercise`.
- Add `markExerciseReviewed(id)` — sets `reviewed_at = now()`.
- Extend `updateExercise(id, draft, opts?: { markReviewed?: boolean })`: saving edits sets `reviewed_at` to `null` (edits invalidate prior review) unless `markReviewed: true`, in which case it sets `reviewed_at = now()` in the same update.

### 3. `CodingExerciseDialog.tsx` — become the review dialog

Extend (not replace) the existing dialog with optional review-mode props:

- New optional props: `exercises: CodingExercise[]`, `index: number`, `onNavigate(index)` — when provided, the dialog shows "Exercise i of N", Prev/Next buttons, and a Reviewed / Not reviewed badge in the header.
- Footer in review mode: **Save** (saves edits, clears reviewed flag), **Save & mark reviewed** (saves + sets flag), and **Mark reviewed & next** (saves, marks reviewed, advances to the next unreviewed exercise; on the last one it closes).
- Standalone edit mode (pencil icon) keeps today's behavior, except saving now also clears `reviewed_at`.

### 4. `CodingExercisesSection.tsx` — wire the flow

- After a successful generation, reload exercises and auto-open the review dialog on the first **unreviewed** exercise, with the queue = all unreviewed exercises for the week (newly generated rows are unreviewed by construction, so no function-payload change is needed).
- Each exercise row gets a status badge: amber "Needs review" when `reviewed_at` is null, subtle "Reviewed" otherwise (in addition to the existing Draft/Published badges).
- Add a "Review" button per unreviewed row that opens the review dialog in navigation mode.
- Publish gating in `handlePublishToggle`: keep the missing-fields check, and additionally block publishing while any exercise has `reviewed_at = null`, with a toast naming how many still need review.
- No edge-function changes.

## Behavior notes / decisions

- Edits always invalidate review: any save without "mark reviewed" resets `reviewed_at`, so changed content must be re-reviewed before publish.
- Already-published exercises stay live if edited (current behavior), but the row will show "Needs review" again until re-reviewed.
- Deleting/regenerating exercises is unaffected; the review queue simply recomputes from unreviewed rows.

## Risks / constraints

- **Review is teacher-honored, not enforced for students directly**: a teacher with DB-level access could still flip `published` — acceptable; gating lives in the UI like the existing missing-fields check. If hard enforcement is ever wanted, a trigger can block `published = true` when `reviewed_at is null` (out of scope here).
- **Backfill timing**: the migration and the published-row backfill must both land before the new UI ships, or already-published exercises would appear "Needs review" and block re-publishing. Plan executes them in order.
- **Dialog size**: review mode adds Prev/Next to an already large dialog — kept as header/footer chrome only, no layout rework.

## Verification

- `bunx vitest run` — extend existing coding-exercise tests: dialog review-mode navigation, save-clears-review, publish blocked while unreviewed.
- Manual: generate 2 exercises on a coding week → review dialog auto-opens at exercise 1 → step through with "Mark reviewed & next" → rows flip to "Reviewed" → "Publish exercises" succeeds; edit one exercise afterward → its badge returns to "Needs review" and publish is blocked again.
