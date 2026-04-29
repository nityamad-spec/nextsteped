## Goal

Persist each lesson-plan week's visibility (`locked` / `is_exam_week`) to the database, and enforce server-side that students can only read **visible** weeks. Today the lock state lives only in the published JSON in storage and is filtered client-side in `StudentHome.tsx` / `AIChat.tsx` — a curious student could fetch the raw `published-plan.json` and see every week, including locked ones the professor hasn't released yet.

## Root cause of current leak

- `published-plan.json` contains every week with `locked: true/false` baked in.
- Storage RLS lets enrolled students read the whole file.
- The "hide locked weeks" rule is enforced **only in React** (`isWeekVisible` in `StudentHome.tsx` line 74; `visibleDays` filter in `AIChat.tsx` line 351). Anyone with the URL or browser devtools sees the full plan.

## Proposed architecture

Move week metadata into a relational table the database can filter by RLS, and serve students a **view** that already excludes hidden weeks. Storage continues to hold the full plan for teachers; students never read the raw JSON anymore.

### 1. New table: `lesson_plan_weeks`

One row per week per course. Fields needed for both the listing UI and the visibility rule:

```text
id              uuid pk
course_id       uuid not null
week_number     int  not null     -- 1..total_weeks
week_name       text not null
overview        text
is_exam_week    bool not null default false
locked          bool not null default true     -- professor toggle
concepts        jsonb not null default '[]'    -- [{id,name,brief_description}]
resources       jsonb not null default '[]'    -- [{id,type,title,description,url}]
created_at      timestamptz default now()
updated_at      timestamptz default now()
unique (course_id, week_number)
```

Plus a helper column on `courses`:
```text
lesson_plan_overall_outcomes  text   -- replaces the same field in the JSON for student-facing reads
```

### 2. RLS policies

```text
-- Teachers / collaborators: full CRUD on weeks of courses they own
policy "Teachers manage own weeks"
  for all using (is_course_member(course_id, auth.uid()))
  with check (is_course_member(course_id, auth.uid()));

-- Students: read ONLY visible weeks of courses they're enrolled in
-- "Visible" = not locked OR auto-revealed by current course week.
policy "Students read visible weeks"
  for select using (
    exists (
      select 1 from enrollments e
      join courses c on c.id = e.course_id
      where e.course_id = lesson_plan_weeks.course_id
        and e.student_id = auth.uid()
        and (
          locked = false
          or (
            c.start_date is not null
            and week_number <= greatest(
              1,
              least(
                coalesce(c.total_weeks, 16),
                floor(extract(epoch from (now() - c.start_date)) / (7*24*3600))::int + 1
              )
            )
          )
        )
    )
  );
```

The auto-reveal math is the same one currently in `StudentHome.tsx` line 109 — moved into SQL so the database, not the client, decides what a student sees. Locked weeks past the current course week simply don't appear in the result set.

### 3. Publish flow rewrite (`src/pages/teacher/CourseCreation.tsx` `handlePublish`)

In addition to writing `published-plan.json` (kept for backwards-compat / teacher reads), upsert one row per week into `lesson_plan_weeks`:

```text
1. Delete existing rows for this course_id (clean slate)
2. Insert weeks.map(w => ({course_id, week_number: w.week, week_name, overview,
                          is_exam_week, locked, concepts, resources}))
3. Update courses.lesson_plan_overall_outcomes = overallOutcomes
4. Update courses.lesson_plan_published_at = now()
```

Wrap in a single batch; if it fails, surface the same "Publish failed" toast that already exists.

### 4. Lock toggle persistence

`toggleLock` in `CourseCreation.tsx` (line 376) currently only mutates local state. Add an `update lesson_plan_weeks set locked = !locked where course_id=... and week_number=...` call so visibility flips for students immediately, without requiring a full republish. Same pattern for `TeachingPlan.tsx` `toggleLock` (line 274) once that editor is wired to the table.

### 5. Student reads (`src/pages/student/StudentHome.tsx`, `src/pages/student/AIChat.tsx`)

Replace the storage download + JSON parse + client-side filter with:

```ts
const { data: weeks } = await supabase
  .from("lesson_plan_weeks")
  .select("week_number, week_name, overview, is_exam_week, concepts, resources")
  .eq("course_id", enrolledCourseId)
  .order("week_number");
```

The RLS policy guarantees `weeks` already excludes locked/future weeks. Map these rows through the existing `NormalizedWeek` shape so the renderer is unchanged. Drop `isWeekVisible` and the storage download path entirely from the student code.

`AIChat.tsx` `fetchVisibleTopics` does the same thing — query the table, take the returned weeks as the source of truth for exam-mode topic constraints. Now a student literally cannot see (and therefore cannot ask the AI about) topics from locked weeks.

### 6. Backfill for already-published courses

The migration includes a one-shot SQL that copies existing `published-plan.json` rows into `lesson_plan_weeks` is **not** doable from SQL (storage isn't queryable from Postgres). Instead, on first teacher visit to `CourseCreation` after this ships, detect "course has `lesson_plan_path` but zero rows in `lesson_plan_weeks`" and run the publish-time upsert silently from the loaded JSON. Ship a banner on the teacher view explaining: "We've upgraded lesson-plan visibility — your existing plan has been migrated."

## Files

- New migration: `lesson_plan_weeks` table + RLS + `lesson_plan_overall_outcomes` column on `courses`
- Edited: `src/pages/teacher/CourseCreation.tsx` (publish writes table; `toggleLock` persists; backfill on load)
- Edited: `src/pages/teacher/TeachingPlan.tsx` (publish + toggleLock mirror to table)
- Edited: `src/pages/student/StudentHome.tsx` (read from table, drop storage download + `isWeekVisible`)
- Edited: `src/pages/student/AIChat.tsx` (`fetchVisibleTopics` reads from table)
- New helper: `src/lib/lessonPlanWeeks.ts` with `upsertPublishedWeeks(courseId, weeks)` and `setWeekLocked(courseId, weekNumber, locked)` to keep both editors DRY

## Out of scope

- Removing `published-plan.json` writes entirely. Kept for now so teacher tooling and `course_material_files` indexing don't break; can be deprecated in a follow-up once nothing reads it.
- Per-resource locking inside a week (still all-or-nothing per week, matching current UX).
- Making the AI Chat backend (`supabase/functions/chat`) aware of the table — current relevance filter is client-side; tracked separately.

## Verification

1. As teacher: lock Week 3, save → row in `lesson_plan_weeks` shows `locked=true`. Open `/student/home` as enrolled student → Week 3 missing entirely from network response.
2. Hit the table directly from the student JWT (`supabase.from('lesson_plan_weeks').select('*').eq('course_id', ...)`) → only unlocked + auto-revealed weeks return; RLS denies the rest.
3. Set `courses.start_date` to 4 weeks ago → Weeks 1–4 auto-reveal even if `locked=true`.
4. AI Chat exam mode: ask about a topic from a locked future week → falls outside `visibleTopics`, gets refused.
5. Re-publish from teacher → table reflects edits within one round-trip; no stale locked rows survive.
