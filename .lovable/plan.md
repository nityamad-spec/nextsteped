## Goal
In Concept Review → Confirmed Concepts, let the teacher specify a weight (%) when manually adding a missed concept. After insert, proportionally rescale all other confirmed concept weights so the total equals 100%.

## UX changes (`src/pages/teacher/ConceptReview.tsx`, manual add row ~line 763)
- Add a small numeric Input next to the existing name input: `Weight %` (0–100, default empty → treated as 0).
- Layout: `[ name input (flex-1) ] [ weight input w-24 ] [ Add button ]`. Show inline helper text: "Other concepts will be rescaled so total stays 100%."
- Disable Add if name empty, weight invalid (NaN, <0, >100, or =100 when other concepts exist since that would zero them out), or while saving.

## Logic (`handleAddManual`)
Let `W_new` = entered weight as a fraction (0–1), `others` = current confirmed concepts.
1. If `others` is empty → insert new concept with `weight = W_new` (or 1 if blank). Done.
2. Else compute `sumOthers = sum(others.weight)`. Target sum for others after insert = `1 - W_new`.
   - If `sumOthers > 0`: `scale = (1 - W_new) / sumOthers`, new weight for each other = `weight * scale`.
   - If `sumOthers === 0`: distribute `(1 - W_new)` equally across others.
3. Persist:
   - `update` each other concept's `weight` (batched via `Promise.all` of `.update().eq('id', ...)`).
   - `insert` the new concept with `weight = W_new`.
   - On success: update local `concepts` state with rescaled values + new row, `bumpCacheVersion('concepts', courseId)`, clear inputs.
4. Rounding: keep raw fractions in DB (no rounding), display still uses `Math.round(weight*100)%`. This avoids drift; the badge already rounds for display.
5. Errors: if any update fails, toast error and refetch concepts to resync.

## Out of scope
- No edits to recommendation/suggestion add flows (those keep AI-provided weights).
- No editing weights of existing confirmed concepts inline (separate request).
- No schema changes.

## Files touched
- `src/pages/teacher/ConceptReview.tsx` (only)
