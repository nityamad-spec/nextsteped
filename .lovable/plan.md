## Goal

Order the **Concept Exploration Map** on `/teacher/courses/dashboard` to follow the **lesson plan sequence** (week 1 → final week, top-to-bottom within each week).

## What changes

Only `src/pages/teacher/CourseDashboard.tsx`.

1. **Fetch lesson plan weeks alongside concepts**
   - In the existing concept-fetch `useEffect`, run a second query in parallel:
     ```
     supabase
       .from("lesson_plan_weeks")
       .select("week_number, concepts")
       .eq("course_id", courseId)
       .order("week_number", { ascending: true })
     ```
   - `concepts` jsonb is an array of `{ id, name, ... }`. The `id` is a lesson-plan-local string (e.g. `i_1780465691343_h2lc`), **not** a `concepts.id` UUID — so matching is done by **name → `concepts.concept_code`** (case-insensitive, trimmed).

2. **Build an order index**
   - Walk weeks in order; for each week walk its concepts array in order; record the first occurrence of each normalized name with an incrementing index.
   - Result: `Map<normalizedName, number>`.

3. **Sort the fetched concepts list**
   - For each row, look up its `concept_code` in the index.
   - Sort:
     - matched concepts first, by index ascending;
     - unmatched concepts (not referenced in any week) last, ordered alphabetically by `concept_code`.
   - Replace the current `weight desc` order.

4. **Loading / empty / error**
   - Treat lesson-plan fetch failure as non-fatal: fall back to alphabetical order on the concepts list (don't block the card). Concepts-table error keeps existing error state.
   - Loading state unchanged — still gated on the concepts fetch.

## Out of scope

- No week labels/headers in the map (just ordering).
- No schema changes.
- No change to mocked mastery stats or any other card.

## Files touched

- `src/pages/teacher/CourseDashboard.tsx` — extend the concept-loading effect with a parallel lesson-plan query and apply lesson-plan-based ordering.
