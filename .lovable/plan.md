# Bulk suspend on Admin → Students

Add row checkboxes, a select-all header checkbox, and a bulk action bar that lets an admin suspend (or reactivate) many students in one go. Delete stays single-row for safety.

## UX

- New leftmost column with a `Checkbox` per student row (click doesn't open the profile drawer).
- Header checkbox reflects tri-state for the currently **filtered** list: unchecked / all-selected / indeterminate. Clicking it selects or clears all filtered rows.
- When one or more rows are selected, a sticky bar appears above the table:
  - "N selected" + "Clear"
  - "Suspend access" button (primary destructive)
  - "Reactivate access" button (shown when any selected row is currently suspended)
- Selection persists across filter/search changes but hidden (filtered-out) rows aren't acted on — the bulk buttons operate on `selected ∩ filtered`.
- Confirmation `AlertDialog` before bulk suspend, listing count and names (first few + "…and X more"). No free-text confirm for bulk (matches the single-row suspend flow, which also has no typed confirm).
- Toast on completion with success/failure counts; per-row errors are collected and surfaced.

## Behavior

- Calls the existing `admin-set-student-suspension` edge function once per selected student in parallel (bounded concurrency of ~5) with `{ user_id: primaryProfileId, suspended: true | false }`.
- Optimistically updates `suspended_at` on success; on failure keeps prior state and reports the row.
- Admin cannot suspend their own account — the function already blocks this; we also filter it client-side so the bar doesn't offer it.
- Bulk delete is intentionally out of scope.

## Technical notes

- File: `src/pages/admin/AdminStudents.tsx` only. No backend changes — reuses `admin-set-student-suspension`.
- New state: `selected: Set<string>` keyed by `StudentGroup.key`.
- Add `Checkbox` (`@/components/ui/checkbox`) in a new first `TableHead`/`TableCell`; stop click propagation so row-click still opens the profile drawer.
- Header checkbox uses `data-state="indeterminate"` when `0 < selectedInFiltered < filtered.length`.
- Bulk action bar rendered above the `<Table>` when `selected.size > 0`.
- Concurrency: simple `Promise.all` over chunks of 5 to avoid hammering the function.
- Clear selection after a successful bulk action.
