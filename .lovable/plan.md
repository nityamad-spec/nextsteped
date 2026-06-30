## Add bulk manual email entry to Enrollment & Course Settings

Add a textarea-based manual entry form alongside the existing CSV upload so professors can paste/type multiple emails at once without preparing a file.

### UI changes (`src/pages/teacher/EnrollmentSettings.tsx`)
Inside the Student Enrollment card, between the Roster summary block and the CSV upload zone, add an "Add emails manually" section:
- A `Textarea` for emails (placeholder: "Paste or type emails — one per line, or separated by commas/semicolons/spaces")
- Helper text: "Names/universities aren't supported here — use the CSV upload for those."
- "Add to roster" button (disabled while empty or submitting)
- Inline summary after submit: "Added X, skipped Y duplicates, Z invalid" via toast

### Parsing & validation
- Split textarea content on any of: newline, comma, semicolon, whitespace.
- Trim + lowercase each token.
- Validate with existing `EMAIL_RE`.
- De-duplicate within the input.
- Skip emails already present in current `roster` state (case-insensitive) — counted as duplicates.
- If no valid new emails remain, toast error and abort.

### Insert logic
- Build rows `{ course_id, email, full_name: null, university: null, added_by: user?.id, source: "manual" }`.
- Batch upsert into `course_roster_allowlist` with `onConflict: "course_id,email"` (mirrors CSV path, 500/batch).
- Guard on `effectiveCourseId`.
- On success: clear textarea, call `loadRoster()`, and (if enforcement is off) show the same "Tip: turn on Restrict signups…" info toast used by the CSV flow.

### Out of scope
No schema changes, no edge function changes. CSV upload zone and template download remain unchanged.
