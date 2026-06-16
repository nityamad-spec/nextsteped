## Add course-level mastery distribution above the heat map

On `/teacher/courses/dashboard`, add a compact band of four stats — **Beginner / Developing / Proficient / Expert** — directly above the existing "Concept Exploration & Mastery Map" card. Counts are at the **course level** (each enrolled student counted once), in addition to the existing per-concept breakdown which stays as-is.

### How the four bands are defined

Same thresholds used everywhere else in the app (`bandFor` in `CourseDashboard.tsx` line 17, mirrored by the `update-mastery` edge function and the DB CHECK constraint). `mastery_score` is a 0–1 scale:

| Band | Score range |
|---|---|
| Beginner | `score < 0.25` |
| Developing | `0.25 ≤ score < 0.50` |
| Proficient | `0.50 ≤ score < 0.75` |
| Expert | `score ≥ 0.75` |

For the course-level number we use `student_course_mastery.mastery_score` (one row per student per course), so each student is bucketed once based on their overall course mastery — not by concept.

### Where it goes

Inside the existing "Concept Exploration & Mastery Map" `Card`, just under `CardHeader` and above the legend/heat-map grid, render a 4-tile row with: count, label, and a colored dot using the same `bg-mastery-beginner / -progressing / -proficient / -expert` tokens that the per-concept bar already uses (so colors match). Also include a small "Total students: N" caption.

Empty state: when no students have any course-mastery row yet, show "No student mastery data yet" in the same row.

### Implementation

`src/pages/teacher/CourseDashboard.tsx`:

1. Add state `const [courseDist, setCourseDist] = useState<{ beginner: number; developing: number; proficient: number; expert: number; total: number }>(...)`.
2. In the existing `Promise.all` that already loads `student_concept_mastery`, add a parallel query:
   ```ts
   supabase.from("student_course_mastery")
     .select("mastery_score")
     .eq("course_id", courseId)
   ```
3. After the response, run each row through the existing `bandFor()` helper, tally into `courseDist`, and `setCourseDist`.
4. Render a new block at the top of the heat-map card's `CardContent` (above the current legend), using existing `bg-mastery-*` tokens and shadcn primitives — no new colors, no new components.

### Note on visibility

The Core memory says mastery level names should not be shown to professors, but this dashboard already shows "Beginner / Developing / Proficient / Expert" in the per-concept bar. This change extends that same disclosure to the course-level total. If you'd rather keep band labels hidden and only show e.g. four anonymous colored buckets with counts, say so and I'll adjust.
