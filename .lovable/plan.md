## Goal
In the Collaborators card on the Course Dashboard, replace the single-name search input with a textarea that accepts one teacher email per line, validates each, and adds all valid, existing, non-duplicate teachers in one action.

## Scope
- File: `src/components/CourseCollaborators.tsx` (frontend only)
- No DB, RLS, schema, or edge function changes. `profiles.email` already exists and is used for the lookup.

## UX
- Replace the `Input` + Add button row with:
  - `Textarea` (min 4 rows) with placeholder: `"one email per line, e.g.\nalice@school.edu\nbob@school.edu"`
  - Helper caption: "Enter one teacher email per line."
  - "Add collaborators" button (disabled while empty or submitting).
- On submit, show per-line results as a summary toast (and inline list under the textarea) with counts:
  - Added: N
  - Invalid email: N (list them)
  - Not a registered teacher: N (list them)
  - Already a collaborator: N (list them)
- On success, valid added emails are removed from the textarea; invalid/failed entries remain so the user can fix them.

## Validation & Processing Logic
1. Split textarea by newlines / commas / semicolons; trim; drop blanks; lowercase; de-dupe within the input.
2. Regex validate each: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Invalid → bucket "Invalid email".
3. Skip any email already present in the current `collaborators` list (match against a fetched email map, see below) → bucket "Already a collaborator".
4. Batch lookup remaining: `supabase.from("profiles").select("id, name, email, role").in("email", emails)`.
   - Not returned or `role !== 'teacher'` → bucket "Not a registered teacher".
5. Insert survivors into `course_teachers` with a single `.insert([...])` call (`role: 'collaborator'`), then `fetchCollaborators()`.

## Collaborator email awareness
`fetchCollaborators` currently doesn't store emails. Extend the `profiles` selects (owner + collaborators join) to also select `email`, add `email` to the `Collaborator` type, and use it for duplicate detection in step 3. UI display unchanged.

## Edge cases
- Empty textarea → button disabled.
- All lines invalid → toast "No valid emails to add", keep textarea intact.
- Partial success → success toast with counts + destructive-styled inline list for failures.
- Insert error from Postgres (e.g., unique violation race) → surface the error message via toast; refetch to reconcile.

## Out of scope
- Inviting non-existing users via email.
- Any role other than `collaborator`.
- Owner reassignment.
