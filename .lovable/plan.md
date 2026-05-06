## Goal
Rename the user-visible "Coding Exercise" label to **"Industry Exercise"** in the lesson plan UI.

## Scope
UI label only. The internal type identifier `"coding-exercise"` stays unchanged across the codebase and the `generate-lesson-plan` edge function (no schema/data migration needed).

## Changes
**`src/pages/teacher/CourseCreation.tsx`** — replace display strings only:
- Line ~1186: `<SelectItem value="coding-exercise">Coding Exercise</SelectItem>` → label text "Industry Exercise"
- Line ~1221: badge text `{r.type === "coding-exercise" ? "Coding Exercise" : "Article"}` → "Industry Exercise"
- Line ~1197: prompt label still keys off `editResourceType === "coding-exercise"` (no change to logic, only verify wording stays sensible — keep "Prompt / task description")

## Out of scope
- Edge function prompt (`generate-lesson-plan/index.ts`) — internal type key `coding-exercise` retained.
- `workshopPlan.ts` mock string ("Interactive Coding Exercise") — separate deprecated mock data, leave as-is unless requested.
- Section heading "Industry-Relevant Exercise & Suggested Articles" already matches.
