## Goal
In the "Confirmed Concepts" section on `/teacher/setup/concept-review`, allow editing the weightage (percent) of each concept, persisting to the `concepts.weight` column.

## Changes

**File: `src/pages/teacher/ConceptReview.tsx`**

1. **Add a `handleUpdateWeight` function** near the existing `handleDelete`:
   - Signature: `async (id: string, pct: number) => void`
   - Clamps `pct` to 0–100, optimistically updates `concepts` state, then writes `weight: pct / 100` to the `concepts` row via Supabase. On error, reverts and shows a toast. On success, calls `bumpCacheVersion("concepts", courseId)`.

2. **Replace the read-only weight `Badge`** at lines 723–725 with an inline editable number input:
   - Small `<Input type="number" min={0} max={100} step={1}>` (≈ `w-14 h-7 text-xs tabular-nums`) followed by a `%` suffix.
   - Local state per-row not needed — bind directly to `Math.round(Number(c.weight) * 100)`, use an `onChange` to update local concept state immediately, and call `handleUpdateWeight` on `onBlur` and Enter keypress (debounce-free; save on commit).
   - Place inside the existing row, before the delete button. Keep the row layout intact so the number input stays compact and right-aligned on the left cluster.

3. **No DB schema changes** — `concepts.weight` is already a numeric 0–1 field with RLS that lets the course's teacher update.

## Out of scope
- No bulk-edit, no auto-normalization so weights sum to 100, no validation that totals add to 100 (existing flow allows arbitrary weights).
- Suggestions/recommendations sections already support weight editing via `weights` state, unchanged.

## Verification
- Open `/teacher/setup/concept-review`, edit a confirmed concept's percent, blur the field → value persists after refresh.
- Invalid values (negative, >100, non-numeric) clamp to a valid range and the DB write reflects the clamped value.
