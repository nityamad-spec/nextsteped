

## Plan: Add "Daily Quiz" as a Resource Type in Teaching Plan

### Overview
Add a new "Daily Quiz" resource type to the teacher's "Add Resource" options in the Teaching Plan. When published and viewed by students, clicking this resource redirects them to the daily quiz section in the TA chat.

### Changes

**1. Update resource types — `src/pages/teacher/TeachingPlan.tsx`**
- Add `"quiz"` to the `Resource` type union
- Add a new entry in `resourceTypeOptions`: `{ value: "quiz", label: "Daily Quiz" }`
- Add entries in `typeLabels`, `typeIcons`, and `typeColors` for the `quiz` type
- When adding a quiz resource, auto-populate the title ("Daily Quiz — Day X") and action ("Test your understanding of today's concepts") based on the day number

**2. Update shared type — `src/data/workshopPlan.ts`**
- Add `"quiz"` to the `WorkshopResource["type"]` union

**3. Update student view — `src/pages/student/StudentHome.tsx`**
- Add `quiz` to the `typeLabels`, `typeColors`, and `typeIcons` maps
- When rendering a resource with `type === "quiz"`, make it clickable and navigate to `/student/chat?mode=quiz&day={dp.day}` (same as the existing daily quiz card)
- Style it distinctly (primary border/background) to match the existing daily quiz card appearance

### Behavior
- Teacher side: In the "Add Resource" dropdown for any day, "Daily Quiz" appears as an option. Adding it creates a pre-filled resource card. The teacher can edit the title/description if needed.
- Student side: The quiz resource renders as a clickable card that navigates to the daily quiz in the TA chat for that day. It respects the existing `taSettings.quizEnabled` gating — if quizzes are disabled, it shows a locked state instead.

### Files Modified
- `src/data/workshopPlan.ts` — add `"quiz"` to type union
- `src/pages/teacher/TeachingPlan.tsx` — add quiz to type maps and resource options, auto-fill defaults
- `src/pages/student/StudentHome.tsx` — add quiz type rendering with navigation

