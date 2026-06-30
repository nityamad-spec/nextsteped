## Goal
On `/admin/courses` → course profile dialog → "Enrollment & Diagnostic" section: show a "Pending diagnostic" stat alongside "Diagnostic done", and make both numbers clickable to open a list of student names + emails.

## Changes (all in `src/components/admin/CourseProfileDialog.tsx`)

### 1. Fetch student names/emails
Extend the profiles fetch to also pull `name, email` (currently only `id, university_id`). Store in `RawData.profiles`.

### 2. Compute done/pending student lists
In the `stats` memo (respecting the active university filter), derive two arrays of `{ id, name, email }`:
- `diagnosticDoneStudents` — enrolled students who appear in `raw.diagnostics`.
- `diagnosticPendingStudents` — enrolled students who don't.

Sort alphabetically by name (email fallback).

### 3. Replace the single "Diagnostic done" stat with two clickable stats
Grid becomes 4 columns (Enrolled · Diagnostic done · Pending diagnostic · Avg diagnostic), or stays 3-col with done+pending stacked — go with a 4-column grid (`grid-cols-2 sm:grid-cols-4`) for clarity.

- **Diagnostic done**: `{n}/{enrolled}` · `pct%` — button styling, opens "Done" list.
- **Pending diagnostic**: `{enrolled - n}` — button styling, opens "Pending" list. When 0, render as non-clickable muted text.

Add a small `Stat` variant or wrap existing Stat in a `<button>` with hover underline and chevron icon for affordance.

### 4. Sub-dialog for the student list
Add local state `rosterView: { kind: "done" | "pending" } | null`. Render a second `<Dialog>` inside the component:
- Title: "Diagnostic done — {course name}" / "Pending diagnostic — {course name}".
- Body: `ScrollArea` with a simple list of rows showing name (bold) + email (muted). Empty state: "No students".
- Respects current `universityFilter` (uses the derived arrays from stats).
- Closeable independently of the parent dialog.

### 5. No backend / schema changes
Profiles already readable by admin via existing RLS. No edge function, no migration. Only the profiles `select` columns expand to include `name, email`.

## Out of scope
- Other sections of the dialog.
- Server-side aggregation; everything stays client-derived from data already loaded.
- Adding similar drill-downs to mastery/completion/chat (can be a follow-up).
