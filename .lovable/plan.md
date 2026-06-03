## Goal
Replace the hardcoded `conceptMasteryData` array on `/student/home` with the real concepts for the student's enrolled course, rendered in `weight DESC` order. Status is uniform "Not explored" placeholder.

> Note: your initial message said "order they appear in the lesson plan" but you selected `concepts table (by weight desc)`. I'm going with weight desc — flag if you want lesson-plan order instead.

## Changes

**`src/pages/student/StudentHome.tsx`**
1. Remove the static `conceptMasteryData` constant and the `MasteryStatus` helpers' dependency on mock data (keep the helpers — they'll still render).
2. Add state `const [concepts, setConcepts] = useState<{ id: string; name: string }[]>([])`.
3. Extend the existing `loadPlan` effect (already keyed on `enrolledCourseId`) to also fetch:
   ```ts
   supabase
     .from("concepts")
     .select("id, concept_code, weight")
     .eq("course_id", enrolledCourseId)
     .order("weight", { ascending: false })
     .order("concept_code", { ascending: true }); // stable tiebreaker
   ```
   Map rows → `{ id, name: concept_code }` and `setConcepts(...)`. RLS already permits enrolled students.
4. In the Concept Exploration & Mastery Map card:
   - Iterate over `concepts` instead of `conceptMasteryData`.
   - Treat every concept as `status: "not_explored"`, `quizScore: null` → renders gray tile with "—", tooltip "Not explored".
   - Empty state: if `concepts.length === 0`, show "Concepts will appear here once your professor sets them up." (matches existing muted-text style).
5. Update the dynamic "What to Do Next" block that currently reads `unexplored[0].name` / `weakConcepts[0].name`: since everything is "not_explored" placeholder, base the first suggestion on `concepts[0]?.name` and drop the weak-concept branch for now (keep Practice Exam tile).
6. Keep the legend and footer caption unchanged.

## Out of scope
- No mastery computation, no DB schema changes, no RLS changes, no edits to the teacher-side mastery map.
- Real per-concept percentages will be wired in a later pass.

## Verification
- Load `/student/home` as the enrolled Python student → tiles show concepts from `public.concepts` for that course, sorted by weight desc, all gray with "—".
- Student with no concepts seeded → empty-state copy renders, no crash.