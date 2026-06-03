# Concept Mastery Map — UI refactor

Scope: `src/pages/teacher/CourseDashboard.tsx`, the "Concept Exploration Map" card only. UI-only, no backend changes.

## Data note (flag)
`conceptRows` currently carries `touched / deeplyExplored / notExplored` per concept (derived from chat interactions). The four mastery-level counts (Beginner / Developing / Proficient / Expert) are **not** tracked in the backend today. Per the request, I'll keep it static: derive four deterministic per-concept counts client-side from the existing `total` (students) so each row still adds up to its real student total and stays stable across renders. No DB / edge function changes.

If you later want these driven by real data, that's a separate backend task (new aggregation over `assessment_results` / mastery records keyed by concept). I'll flag and ask before doing that.

## Changes

1. **Rename** card title `Concept Exploration Map` → `Concept Mastery Map`. Description → `Aggregate anonymous view — student mastery distribution per concept`.

2. **Legend (four entries):** replace the three exploration chips with four flat-color squares + labels:
   - Beginner → `bg-mastery-beginner`
   - Developing → `bg-mastery-progressing` (existing token; label shown as "Developing")
   - Proficient → `bg-mastery-proficient`
   - Expert → `bg-mastery-expert`
   These tokens already exist in `index.css` and are flat HSL colors — reused so no new tokens needed.

3. **Remove** the trailing "Mastery level — click a row for details" block (the three dots + caption) from the legend area.

4. **Per-row bar:** replace the two-segment `bg-primary` / `bg-primary/40` bar with a four-segment stacked bar using the same four mastery tokens, widths proportional to each level's count over the row total. No gradients.

5. **Per-row right-side counts:** replace `X deep / Y touched / Z unexplored` with four counts in legend order, each colored with its mastery token, e.g.
   `8 Beginner   14 Developing   20 Proficient   11 Expert`.

6. **Remove click affordance:** drop `cursor-pointer`, `hover:bg-muted/40`, the `onClick`, the `expandedConcept` state, the leading colored dot (`dotColor`), and the entire `isExpanded` mastery-details sub-block (lines ~325–346). Rows become static.

7. **Static per-concept distribution:** add a small pure helper that, given a concept name and total students, returns `{ beginner, developing, proficient, expert }` summing to total. Use a deterministic hash of the concept name as seed so values don't reshuffle on re-render. Keeps the visual variety while being obviously placeholder.

## Out of scope
- No changes to `conceptRows` fetch, `useConceptRows`, or any other card on the dashboard.
- No changes to the student-side "Concept Exploration & Mastery Map" on `/student/home`.
- No new design tokens; reusing existing `mastery-*` tokens from `index.css`.

## Question before I build
The spec says **Developing**, but the existing mastery scale in this codebase uses **Progressing** (token `mastery-progressing`, used in Student Insights and `StudentProfile` type). Two options — pick one:

- **A (recommended):** Show the label "Developing" in this card only, keep the underlying token name `mastery-progressing`. Zero ripple.
- **B:** Rename the scale project-wide from "Progressing" → "Developing" (token, types, other views). Larger change, touches Student Insights, types, and any persisted enum values.

Confirm A or B and I'll implement.
