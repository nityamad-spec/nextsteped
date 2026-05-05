## Goal
Replace the free-text "Institution Name" input on `/intro/teacher/profile` with a searchable, DB-backed combobox that reads from the `universities` table and stores the selected university's id on `profiles.university_id`.

## Current state
- `profiles.university_id uuid` already exists (currently unused for teachers).
- `profiles.institution text` is what TeacherOnboarding writes today.
- `universities` table exists with `id`, `name`; RLS allows authenticated SELECT and INSERT.
- No FK constraint exists from `profiles.university_id` → `universities.id` yet.

## Changes

### 1. Database (migration)
- Add FK: `profiles.university_id` → `universities(id) ON DELETE SET NULL`.
- (No data backfill — existing teachers keep their free-text `institution` value; `university_id` stays null until they re-save.)

### 2. New component: `src/components/UniversityCombobox.tsx`
A Popover + cmdk (`Command`) searchable select (same pattern shadcn uses — both `popover.tsx` and `command.tsx` are already in the project).
- Props: `value: { id: string|null; name: string }`, `onChange(value)`.
- On open: fetch all universities (`select id, name order by name`); cache in component state.
- Filter client-side as the user types.
- If no match, show a "Create '<query>'" item that inserts into `universities` and selects the new row.
- Display the selected university name in the trigger button.

### 3. `src/pages/teacher/TeacherOnboarding.tsx`
- Replace the `<Input>` for Institution Name with `<UniversityCombobox>`.
- Track `universityId` + `universityName` in state.
- Hydration: when loading the existing profile, also select `university_id`; if set, look up its name; else fall back to existing `institution` text (display-only, user must pick to save a new id).
- `isValid` requires `universityId` to be set.
- On save, write both `university_id: universityId` and `institution: universityName` to `profiles` (keep `institution` populated for backward compatibility with code that already reads it).

### 4. No other files need changes
- `src/integrations/supabase/types.ts` regenerates automatically.
- Admin pages that display teachers continue to show `institution` text — no change needed.

## Technical notes
- Use the existing `supabase` client; both reads and the create-new insert work under current RLS (`Anyone can view universities`, `Authenticated users can insert universities`).
- Case-insensitive duplicate guard before insert (`ilike` exact match) to avoid near-duplicates like "MIT" vs "mit".
- Trim whitespace on create.
