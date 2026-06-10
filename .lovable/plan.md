# Wire Concept Mastery Map to real data

Replace the hash-based mock distribution on `/teacher/courses/dashboard` with a real aggregation of `student_concept_mastery` rows so the map updates as students complete weekly quizzes, exams, and practice questions (all of which already write to that table via `update-mastery`).

## Scope (single file)

`src/pages/teacher/CourseDashboard.tsx`

No DB schema changes. RLS already allows course teachers/collaborators to read `student_concept_mastery` for their course (`is_course_member` policy).

## Data fetch

Add a third query alongside the existing `concepts` + `lesson_plan_weeks` fetch:

```ts
supabase
  .from("student_concept_mastery")
  .select("concept_id, mastery_score")
  .eq("course_id", courseId)
```

One row per (student, concept). No PII selected — keeps the anonymized-data guarantee shown in the page banner.

## Bucketing

Use the same thresholds already encoded in `update-mastery` (mirrored in the `mastery_level` CHECK constraint), applied client-side from `mastery_score`:

```text
< 0.25         → beginner
0.25 .. < 0.50 → developing
0.50 .. < 0.75 → proficient
0.75 .. 1.00   → expert
```

Group rows by `concept_id`, count students per band. Concepts with zero rows render with all four counts = 0 and an empty bar (instead of fake distribution).

## Render changes

In the existing concept-row map:
- Drop `mockStatsFor` and the hash-derived `w1..w4` distribution.
- Read `{ beginner, developing, proficient, expert }` from the aggregated map keyed by `concept.id`.
- `total = beginner + developing + proficient + expert`; if `total === 0`, render the row with a muted "No student data yet" label and an empty/striped track instead of percentage widths.
- Keep the existing legend, color tokens (`bg-mastery-*`), sort order (lesson-plan order then concept_code), and loading/error skeletons.

Remove the now-unused `hashStr` and `mockStatsFor` helpers.

## Out of scope (kept as mocks, called out separately)

- "45 Active Students" / "312 Total Sessions" stat cards — still hardcoded. Will flag in the closing message; not part of this change unless requested.
- `insightsMock` Teaching Insights bullets — still hardcoded. Same.
- Section filter (`selectedSection`) — `student_concept_mastery` has no section column today; filter remains visual-only for this map.

## Verification

1. Open `/teacher/courses/dashboard` for a course with no student activity → every concept row shows 0/0/0/0 and an empty bar.
2. Submit one practice set as a student on one concept → that concept's bar shifts into the band matching the resulting `mastery_score`; other concepts remain empty.
3. Submit an exam covering multiple concepts → bars update for each touched concept after refresh.
4. Spot-check via `psql`:
   ```sql
   SELECT concept_code, mastery_score, mastery_level
   FROM student_concept_mastery scm
   JOIN concepts c ON c.id = scm.concept_id
   WHERE scm.course_id = '<course>';
   ```
   Counts per band must match what the UI renders.
