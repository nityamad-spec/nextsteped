# Plan: Standalone Select-All Button on /admin/students

## Goal
Add a convenient, standalone "Select all" control above the student table (near the existing filter/export toolbar) that selects every row in the **currently filtered** list. It should work alongside the existing row checkboxes and bulk suspend/reactivate flow.

## Current state (verified)
- `src/pages/admin/AdminStudents.tsx` already has:
  - Row-level checkboxes keyed by `StudentGroup.key`.
  - A tri-state header checkbox that selects/deselects all filtered rows.
  - `filtered`, `selected`, `selectedInFiltered`, `allFilteredSelected`, and `toggleSelectAllFiltered()` helpers.
  - A sticky bulk action bar with suspend/reactivate actions.
- There is **no** standalone button above the table; selection only happens via the table header checkbox.

## Proposed changes
All changes are confined to `src/pages/admin/AdminStudents.tsx`.

### 1. Add a toolbar select-all button
- Place a text button in the filter/export toolbar row, to the right of the filter chips and near the Export button.
- Label adapts to state:
  - If no filtered rows: disabled, label "Select all".
  - If not all filtered rows selected: "Select all N students" (N = filtered count).
  - If all filtered rows selected: "Clear selection" or "Deselect all".
- Use the existing `CheckSquare` / `Square` / `X` icon set from `lucide-react` (or reuse existing icons already imported) to visually reinforce the toggle state.

### 2. Wire the toggle behavior
- Reuse the existing `toggleSelectAllFiltered()` logic:
  - Clicking "Select all N" adds every `filtered` row key to `selected`.
  - Clicking "Clear selection" removes every `filtered` row key from `selected`.
- Selection still persists when filters/search change (hidden rows remain selected), and the bulk action bar continues to operate on `selected ∩ filtered`.

### 3. Keep the header checkbox
- The existing table-header checkbox remains as-is for users who prefer selecting inside the table.
- Both controls stay in sync because they read from the same `allFilteredSelected` / `someFilteredSelected` state.

### 4. Edge cases / UX polish
- If filters reduce the list to zero rows, the button is disabled with a tooltip explaining "No students match the current filters".
- The button respects the existing rule that the admin cannot suspend their own account: the admin’s own row is still selectable (same as today), but the backend blocks self-suspension and the client reports the failure.
- No changes to the bulk action bar, confirmation dialog, concurrency, or edge-function invocation.

## Files changed
- `src/pages/admin/AdminStudents.tsx` only.

## Out of scope
- Backend changes.
- Server-side pagination / "select all pages" behavior (all students are currently loaded client-side).
- Changes to the existing header checkbox or row checkbox behavior.

## Verification
- Manual check: filter the list, click "Select all N students", confirm the bulk action bar shows N selected and the header checkbox becomes checked.
- Manual check: click "Clear selection", confirm the bar disappears and checkboxes clear.
- Manual check: select a few rows individually, then click "Select all N"; confirm the remaining filtered rows are added.
- Run existing tests / typecheck to ensure no regressions.

## Open question for you
Should the button label count update to show the number of **currently selected** students when some but not all filtered rows are selected (e.g., "Select remaining 23")?