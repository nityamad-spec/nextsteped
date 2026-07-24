## Goal
Replace all user-facing "Lesson Plan" terminology with "Learning Path" on the student home page (`/student/home`), while keeping the existing data model and backend labels unchanged.

## Files to change
- `src/pages/student/StudentHome.tsx`

## Changes
1. **Section header** (line ~666)
   - Change CardTitle from `Lesson Plan` → `Learning Path`.

2. **Section description** (line ~668)
   - Update CardDescription to use learning-path language, e.g.:
     "Your personalized learning path with units, outcomes, and activities."

3. **Loading state** (line ~672)
   - Change `Loading lesson plan...` → `Loading learning path...`.

4. **Empty / unpublished states** (lines ~678–684)
   - `Lesson plan is being updated` → `Learning path is being updated`.
   - `Lesson plan not yet available` → `Learning path not yet available`.
   - `Your professor hasn't published the lesson plan yet.` → `Your professor hasn't published the learning path yet.`

5. **Next-action card** (line ~439)
   - `Lesson plan not published yet` → `Learning path not published yet`.
   - Update description to match.

6. **Code comments** (optional but recommended for consistency)
   - Update JSX comment `{/* Lesson Plan */}` and any nearby inline comments to `{/* Learning Path */}` so future maintainers aren't confused.

## Out of scope (unless you ask)
- Teacher-side labels (`/teacher/setup/lesson-plan`, SetupProgressBar, FileUploadZone, etc.).
- URL/route changes (`/teacher/setup/lesson-plan`).
- Database table/column names (`lesson_plan_weeks`, etc.).
- The word "Unit" in descriptions and empty states.

## Verification
- Run `bunx tsc --noEmit` (or project typecheck) to ensure no broken references.
- Optionally run the `StudentHome` test suite to confirm no assertions rely on the old string.
- Visually confirm in preview that the card title and empty states now read "Learning Path".

## Questions before I start
1. Do you want the teacher-facing "Lesson Plan" labels changed as well, or only on `/student/home`?
2. Should the word "Unit" also be reconsidered (e.g., "Module"), or stay as-is?
3. Any preference for the new CardDescription copy, or is the suggested wording acceptable?