## Goal

When a saved/pasted Google Sheet URL fetches successfully but has no data rows (only a header, or empty file), the current toast reads:

> "Nothing new to add — 0 already on roster, 0 duplicate, 0 invalid."

This is confusing (it reads like a duplicate-detection result). Replace it with an explicit "no data rows" message so teachers immediately know the sheet itself is empty.

## Change

One file: `src/pages/teacher/EnrollmentSettings.tsx`, inside `handleSheetImport`.

Add one branch right after the parse loop, before the existing "Nothing new to add" toast:

- If `dataLines.length === 0` → toast.info: **"Sheet has a header but no data rows — nothing to import."**
- Else if `valid.length === 0 && already === 0 && duplicates === 0 && invalid === 0` (all rows were blank cells in the email column) → same toast as above.
- Else keep the existing "Nothing new to add — X already on roster, Y duplicate, Z invalid" toast unchanged (that message is correct when the sheet had rows but none were new).

No changes to parsing, validation, upsert, dedupe logic, UI layout, or the save/sync buttons. No new state, no new components, no schema changes.

## Not doing

- No change to duplicate detection (it already works — the reported sheet genuinely had zero rows).
- No change to the toast wording for the "had rows but nothing new" case.
- No new error UI, no last-synced timestamp, no logs surface.

## Verification

1. Sync a sheet with only a header row → new "header but no data rows" toast fires.
2. Sync a sheet whose email column values are all blank → same toast fires.
3. Sync a sheet where every email is already on the roster → existing "Nothing new to add — N already on roster…" toast still fires (unchanged).
4. Sync a sheet with new emails → existing success toast still fires (unchanged).
