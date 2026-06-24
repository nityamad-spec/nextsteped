## Update CSV template to include university

Change the roster CSV template and parser on `/teacher/setup/enrollment` to use three columns: `email`, `full_name`, `university`.

### Changes to `src/pages/teacher/EnrollmentSettings.tsx`
- Template download: header row `email,full_name,university` with one example row.
- `parseCsv()`: detect a `university` column (alongside existing email/full_name detection) and capture it per row. Keep email validation and dedupe behavior.
- Preview/list UI: show the university column next to name for uploaded entries.

### Changes to `course_roster_allowlist` table
- Add a nullable `university text` column via migration (existing rows stay valid; enforcement logic is unchanged — still matches on email).

### Not changing
- Signup allowlist check still keys on `(course_id, email)`. University is stored as metadata only; it does not gate enrollment.
- Edge functions are untouched.

### Risks
- Existing uploaded rows will have `university = null` — acceptable since it's metadata.
- If a teacher's old CSV has only two columns, parsing still works (university left blank).