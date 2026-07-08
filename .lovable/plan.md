# Fix: /admin/students showing enrolled students as "Not enrolled"

## Root cause

`src/pages/admin/AdminStudents.tsx` fetches all enrollments in one query:

```ts
supabase.from("enrollments")
  .select("student_id, course_id, enrolled_at")
  .in("student_id", idFilter)   // 634 student ids
```

PostgREST caps every response at **1000 rows by default**. The `enrollments` table currently has **1016 rows**, so ~16 rows are silently dropped. Whichever students' enrollments happen to fall outside the first 1000 rows show up as "Not enrolled" in the admin table, even though the enrollment (and their diagnostic result) exists in the database.

Confirmed for `pamminasaiswarup@gmail.com`: DB has 2 enrollments and 2 diagnostic results for that profile, but the admin page renders "Not enrolled".

`student_course_mastery` (881 rows) is under the cap today but will hit the same wall soon. `diagnostic_results` isn't queried here, so it's unaffected on this page.

The 634-id `.in(...)` filter is also close to PostgREST's URL length ceiling; keeping it will start failing outright as the student count grows.

## Fix

Update `src/pages/admin/AdminStudents.tsx` `fetch()` only. Two changes:

1. **Paginate the `enrollments` and `student_course_mastery` reads** using `.range()` in a loop until fewer than the page size is returned. Page size 1000, ordered by `student_id` for stable paging. Drop the `.in("student_id", idFilter)` filter — we already restrict downstream by joining against the loaded student profiles, and full-table paging is cheaper than a giant URL with 634 UUIDs.
2. Keep the rest of the aggregation logic (`enrollmentsByStudent`, `masteryMap`, courses lookup) unchanged.

Sketch:

```ts
async function fetchAll<T>(table, columns, orderCol) {
  const pageSize = 1000;
  let from = 0;
  const out: T[] = [];
  while (true) {
    const { data, error } = await supabase
      .from(table).select(columns).order(orderCol).range(from, from + pageSize - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}
```

Use it for `enrollments` and `student_course_mastery`. Filter to loaded student ids in JS after the fetch (cheap Set lookup).

## Out of scope

- No RLS changes (admin already has read access via existing policies).
- No schema changes.
- No UI/design changes.
- The professor-roster RLS plan from earlier is separate and untouched.

## Risk

Two more round-trips per extra page (currently 2 pages for enrollments, 1 for mastery). Negligible on an admin-only page.
