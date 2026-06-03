
## Goal

Replace the hardcoded `conceptMasteryMock` array in `/teacher/courses/dashboard` so the **Concept Exploration Map** lists the concepts that belong to the currently selected course (from the `concepts` table). Mastery/touched/deep/unexplored numbers stay mocked (deterministic per concept) until real analytics land.

## Scope

Only `src/pages/teacher/CourseDashboard.tsx`. No schema changes, no edge functions, no changes to the Teaching Insights card (still mock).

## What changes

1. **Fetch concepts for the current course**
   - Use the existing `useTeacherCourseId()` hook (already imported).
   - Add a `useEffect` that, when `courseId` changes, queries:
     ```
     supabase
       .from("concepts")
       .select("id, concept_code, weight")
       .eq("course_id", courseId)
       .order("weight", { ascending: false })
     ```
   - Store result in local state `concepts` (typed `{ id, concept_code, weight }[]`).
   - Track `loading` and `error` flags.

2. **Derive display rows from real concepts + static mock stats**
   - Build a small pure helper `mockStatsFor(conceptId: string)` that returns `{ touched, deeplyExplored, notExplored, masteryPct }`.
   - Implementation: seeded pseudo-random from a hash of `conceptId` so numbers are stable across renders and look varied across concepts (no flicker, no Math.random in render). Keep ranges similar to today's mock (touched 5–35, deep 1–25, unexplored 5–50, mastery 30–90).
   - Map fetched concepts → `{ concept: concept_code, ...mockStatsFor(id) }`.

3. **Render states in the existing card**
   - Loading: show 4 `Skeleton` rows (reuse `@/components/ui/skeleton`) inside the CardContent, keep the legend.
   - Empty (course has no concepts yet): muted message "No concepts defined for this course yet. Add them in Concept Review." with a subtle link/hint — no row list.
   - Error: small inline error text, keep legend.
   - Loaded: render the same row markup that exists today (legend, bars, expandable mastery detail) but driven by the fetched list.

4. **Keep all existing UI behavior**
   - Legend, hover/expand, color thresholds (≥70 emerald, ≥50 amber, else destructive), and dot logic unchanged.
   - Section selector, Course Progress card, Stats row, Teaching Insights, Collaborators — untouched.

## Out of scope

- Real mastery analytics (chat-derived touched/deep counts). Mastery stays static per memory rule (`mastery levels hidden from student/professor` does not apply here — this is aggregate exploration, but the numbers themselves remain mocked).
- Pagination/virtualization (concept lists are small, typically < 50).
- Filtering by section (selector already exists but doesn't filter today; leaving as-is).

## Technical notes

- `concept_code` is the human label shown today (e.g. "Variables & Types"). Display it directly; no extra join needed.
- Hash helper can be a 6-line `djb2` style function kept inside the component file.
- No new dependencies.
- RLS already allows teachers/collaborators to read concepts for their courses, so the client query works without an edge function.

## Files touched

- `src/pages/teacher/CourseDashboard.tsx` — remove `conceptMasteryMock`, add fetch + helper + loading/empty/error states.
