## Goal
Turn the static "Upload additional roster" tile on `/teacher/setup/enrollment` into a working CSV uploader, persist the allowed students per course, and gate student signup so only emails on the roster can join.

## Backend

**New table `course_roster_allowlist`** (one row per allowed email per course):
- `course_id` (FK → courses), `email` (lowercased, trimmed), `full_name` (nullable), `added_by` (teacher uuid), `source` (`csv` | `manual`), timestamps.
- Unique on `(course_id, email)`.
- RLS:
  - Teachers (`is_course_member`) can SELECT/INSERT/DELETE rows for their course.
  - `service_role` full access (used by signup edge function).
  - No `anon`/`authenticated` read for other users.
- GRANTs per project rules.

**New column `courses.roster_enforcement`** (`boolean default false`) — only enforce allowlist when a roster has been uploaded / teacher toggles it on. Avoids breaking courses that rely purely on enrollment code.

**Edge function update — `student-pending-signup`**:
After validating the enrollment code, if `course.roster_enforcement = true`, look up `course_roster_allowlist` by `(course_id, lower(email))`. If no match → return 403 with message "Your email isn't on this course's approved roster. Please contact your instructor." Allowlist check runs before staging the pending signup.

## Frontend (`src/pages/teacher/EnrollmentSettings.tsx`)

Replace the static `student_roster_fall2025.csv` card and the dummy upload tile with:

1. **Roster card** showing live count from `course_roster_allowlist` for the current course, plus a "View / manage" expandable list (email + name, with per-row delete).
2. **Real CSV upload** — hidden `<input type="file" accept=".csv">` triggered by the dashed tile.
   - Parse client-side (simple split, no extra dep): expect headers `email` and optional `name`/`full_name`. Skip blank rows, lowercase + trim emails, validate with regex, dedupe.
   - Show preview: "X valid emails, Y skipped (invalid/duplicate)" before confirming.
   - On confirm: upsert into `course_roster_allowlist` in batches via supabase client. Toast success/failure counts.
3. **Enforcement toggle** (`Switch`) — "Only allow listed emails to enroll" → updates `courses.roster_enforcement`. Default off; auto-suggest enabling after first successful upload.
4. **Download template** link (`email,full_name\n`).

No changes to enrollment code logic — it stays as the primary join mechanism; the allowlist is an additional gate.

## Risks to flag to the user

- **Lockout risk**: turning enforcement on with an incomplete roster blocks legitimate students. Mitigation: toggle defaults off; warning copy on the switch; teachers can add rows manually.
- **Case / alias sensitivity**: emails are matched case-insensitively on the normalized address, but Gmail "+aliases" and dots are treated as distinct. We won't normalize aliases — document this in helper text.
- **CSV trust**: teacher-uploaded CSVs are treated as authoritative. A teacher with course access can grant signup to any email. Acceptable because teachers already control the enrollment code.
- **PII**: roster stores student emails before they sign up. RLS limits visibility to course teachers + service role; no anon read.
- **Existing students**: students already enrolled before enforcement is turned on are unaffected (check is at signup only). New `enroll-additional-course` flow should get the same check — included in the edge changes.
- **Rate limit / abuse**: allowlist check happens after per-email signup rate limit, so it doesn't widen the attack surface.
- **No email verification of roster entries**: typos in CSV silently block real students. UI surfaces the parsed list so the teacher can spot-check.

## Files touched
- `supabase/migrations/<new>.sql` — table, column, RLS, grants.
- `supabase/functions/student-pending-signup/index.ts` — allowlist check.
- `supabase/functions/enroll-additional-course/index.ts` — same check.
- `src/pages/teacher/EnrollmentSettings.tsx` — UI rewrite of the roster section.
