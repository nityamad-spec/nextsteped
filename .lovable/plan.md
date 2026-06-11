## Goal
Let professors edit `courses.objectives` from **Settings → Course Settings** so they never have to use the backend table editor (which fails on multi-line/quoted prose stored as `text[]`).

## Where
`src/pages/teacher/SettingsIntegrity.tsx` — add a new card at the top of the settings list (above "Publish Settings"). No schema change. No backend change.

## UX
- New card titled **"Course Objectives"** with `Target` icon.
- Description: "One objective per line. Saved as a list."
- `Textarea` (8 rows, monospaced-friendly) prefilled from `courses.objectives` joined by `\n`.
- Helper row: live count (`{n} objective{n!==1?'s':''}`) + last saved time.
- Per-card **Save** button (own loading state) — independent of the page-level Save.

## Data flow
1. On mount, resolve `courseId`:
   - Prefer `currentCourse.id` (from `useApp`).
   - Fallback: most recent course where `teacher_id = auth.uid()` (same pattern used for `enrollment_code` in this file).
2. `SELECT id, objectives FROM courses WHERE id = :courseId` → seed textarea.
3. Save handler:
   - Split textarea by `\n`, `.map(s => s.trim())`, drop empty lines → `string[]`.
   - `supabase.from("courses").update({ objectives }).eq("id", courseId)`.
   - On success: toast "Objectives saved", refresh local state.
   - On error: toast the message verbatim so RLS/validation issues are visible.

## Why this works where the table editor failed
- Supabase JS sends `objectives` as a real JS array; PostgREST encodes it as a proper `text[]` — no JSON-string escaping of quotes/newlines like the table-editor input does.
- RLS policy `Teachers can manage own courses` (`auth.uid() = teacher_id`) is already satisfied for the logged-in teacher.
- No new policies, grants, or migrations.

## Out of scope
- No change to `text[]` column type, onboarding form, or NewCoursePage editor.
- No bulk import, no per-objective weights, no reorder UI (single textarea only).

## Verification
- Open `/teacher/settings`, edit objectives, save → toast appears, value persists on reload.
- Confirm via `SELECT objectives FROM courses WHERE id = …` that newlines/quotes round-trip cleanly.
- Re-open the backend table viewer afterwards — value displays correctly (read-only use is fine).
