# Fix: Lesson Plan Invisible to Students Despite Being "Published"

## Root cause

The student "Lesson plan not yet available" message is **not** a UI gating bug — the lesson plan storage object is genuinely unreadable.

For the affected course (`808605a6-6871-4201-8295-3b86728aa679`):

- `courses.lesson_plan_path = '808605a6.../lesson-plan/published-plan.json'`
- `courses.lesson_plan_published_at = 2026-04-26 04:17:34Z`
- `storage.objects` row exists with `size=24465`, version `e4635af3-...`
- Storage list (`/object/list/...`) returns the file with `httpStatusCode:200` metadata.
- But `GET /storage/v1/object/course-materials/.../published-plan.json` returns **HTTP 400 → "404 Not found"** even with the service role key. The signed URL also 404s.
- The companion `draft-plan-v2.json` in the same folder downloads cleanly (HTTP 200).

So the storage row references a backing object/version that no longer exists. The `StudentHome.tsx` loader hits the silent `try/catch`, sets `lessonPlanPublished=false`, and renders the "not yet available" empty state.

The teacher doesn't notice because their `TeachingPlan` editor falls back to the in-memory `defaultPlan` on the same download error and they edit/save the **draft** path, which works.

There are also two contributing weaknesses worth fixing while we're here:

1. The publish path (`TeachingPlan.savePlan`, `CourseCreation` finalize) only checks `upload`'s synchronous error. It does not re-read the file to confirm the bytes are actually retrievable. So a corrupted/lost upload silently looks like success.
2. The student loader treats every download failure as "professor hasn't published yet", masking real errors.

## Fix

### 1. Heal the corrupted course immediately (one-off data migration)

Add a SQL migration that:

- Drops the dangling `storage.objects` row for `course-materials/808605a6.../lesson-plan/published-plan.json` (the metadata pointing to a missing blob).
- Clears `lesson_plan_path` and `lesson_plan_published_at` on that course so the publish state is honest.

After this migration the student page will still say "not yet available", but it will be consistent with reality. The teacher can then re-publish, and step 2 below will make sure the next publish is verified end-to-end.

We are not auto-copying the draft into the published slot from SQL because storage.objects rows are unsafe to forge by hand (the version → S3 path mapping is internal). The teacher's republish using the existing UI is the correct way.

### 2. Make publish self-verifying (`src/pages/teacher/TeachingPlan.tsx` → `savePlan`, and the equivalent finalize block in `src/pages/teacher/CourseCreation.tsx`)

After `storage.upload(...)` succeeds:

```ts
// Sanity-check the upload — re-download immediately and validate JSON parses.
const verify = await supabase.storage.from(LESSON_PLAN_BUCKET).download(publishedPath);
if (!verify.data) throw new Error("Publish verification failed: file is not retrievable.");
const verifyText = await verify.data.text();
JSON.parse(verifyText); // throws if truncated/corrupted
```

If verification throws:

- Surface a destructive toast with the verify error.
- Skip `recordPublishedPath` (don't mark a broken file as the source of truth).

This catches the exact failure mode that caused this bug: the upload reports success, but the resulting object can't be served.

### 3. Make the student loader more honest (`src/pages/student/StudentHome.tsx`)

Today the loader bundles three different states under "not yet available":

- Course has no `lesson_plan_path` (truly unpublished — current message is right).
- Download succeeded but the JSON parsed to an empty array (truly unpublished).
- Download failed / threw / returned no data while `lesson_plan_published_at` is set (this case is what's happening now).

Change the `useEffect` so it explicitly reads `lesson_plan_published_at` along with the path. Then:

- If the column is `null` → show today's "Lesson plan not yet available" message.
- If the column is set but the download failed → show "We're updating the lesson plan — please refresh in a moment. If this persists, let your professor know." The full original error is logged to `console.error` for debugging.
- If the download succeeded with a non-empty array → render normally.

Same change in `src/pages/student/AIChat.tsx` `fetchVisibleTopics` is unnecessary — empty array is a fine default for visible-topic constraint, but add a `console.warn` on download failure so future occurrences are debuggable from the network/console panel.

### 4. (Optional cleanup) drop the `?t=${Date.now()}` cache-buster from `download` calls

The Supabase Storage object endpoint returns `cacheControl: "max-age=0"` for these JSON files, so the cache-buster does nothing useful and just creates a non-canonical URL string in client logs. Strip it from `StudentHome.tsx`, `AIChat.tsx`, and `TeachingPlan.tsx`. (Behavior unchanged; just cleaner traces.)

## Files

- New migration `supabase/migrations/{ts}_heal_corrupt_published_lesson_plan.sql` — delete dangling `storage.objects` row + clear `courses.lesson_plan_path`/`published_at` for the affected course.
- `src/pages/teacher/TeachingPlan.tsx` — verify after publish.
- `src/pages/teacher/CourseCreation.tsx` — verify after publish (same pattern in the publish block at ~line 518–524).
- `src/pages/student/StudentHome.tsx` — distinguish "never published" vs "publish corrupted/in-flight"; remove `?t=` cache buster.
- `src/pages/student/AIChat.tsx` — add a `console.warn` and remove `?t=` cache buster.

## Out of scope

- No schema changes to `courses` or new tables.
- No change to storage RLS policies — the existing `Enrolled students can read course-materials` policy already permits the read.
- Cross-device or background-sync of the lesson plan — students still need to refresh after a republish.

## Verification plan after implementation

1. Run migration → confirm `courses.lesson_plan_path` and `lesson_plan_published_at` are cleared for the affected course; confirm the storage.objects row for that path is gone.
2. As the professor, open Teaching Plan, click Save/Publish → confirm verification succeeds and the toast is the normal success toast; confirm the new file downloads with HTTP 200 via a quick curl.
3. As the student, refresh `/student/home` → lesson plan now renders.
