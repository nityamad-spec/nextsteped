## Plan

Add a new "Weekly Quiz" row to each week card in the lesson plan renderer at `/teacher/content-library` (Lesson Plan tab → `CourseCreation.tsx`).

### UI change
In `src/pages/teacher/CourseCreation.tsx`, after the "Industry-Relevant Exercise & Suggested Articles" `<section>` (ends at line 1619), insert a new `<section>` styled to match the existing week sub-sections:

- Header row: small primary accent bar (`h-5 w-1 rounded-full bg-primary`) + `<Label className="text-sm font-semibold">Weekly Quiz</Label>` (matching the Topics/Resources headers).
- Short helper text below: "Auto-generated 5-question quiz covering this week's concepts."
- A card/box (`rounded-lg border bg-background p-3`) with two buttons, both no-ops (no `onClick`):
  - `<Button size="sm" variant="default">` with `Sparkles` icon — label "Generate Weekly Quiz".
  - `<Button size="sm" variant="outline">` with `FileText` (or `ListChecks`) icon — label "View Quiz Questions".

No imports change (Sparkles, FileText, Button already imported). No state, no handlers, no backend wiring. Pure presentational addition rendered inside the same `weeks.map` loop so it appears for every week.

### Out of scope
- No click handlers, no edge function calls, no DB reads/writes.
- No changes to `ContentLibrary.tsx` (it just embeds `CourseCreation`).
- No tests.
