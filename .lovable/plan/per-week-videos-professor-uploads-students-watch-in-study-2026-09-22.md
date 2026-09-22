# Per-week videos: professor uploads, students watch in Study

Skilling (employment) pathway only. Professors attach videos to each week in the Generate Lesson Plan step — as uploaded files or pasted links — and students get watch cards with a built-in player under that unit's Study section on `/student/learning-path`, with watched-state tracking.

## What professors get (Generate Lesson Plan step)

- Each expanded week in `TeachingPlan.tsx` gains a **Videos** block with two add options:
  - **Paste a link** — YouTube or Vimeo URL (validated, same style as the existing YouTube-link validation in Course Materials).
  - **Upload a file** — MP4/WebM/MOV, stored in the existing private `course-materials` storage bucket under a `videos/<course>/<week>/` path.
- Each video row: editable title, optional duration, delete (with confirmation; file uploads also removed from storage).
- Videos save with the week, so publishing/locking the lesson plan behaves exactly as it does for other week content.

## What students see (Learning Path → unit → Study section)

- A **Watch** row of cards inside the unit's Study section, above the other resources:
  - Card: 16:9 thumbnail area (YouTube thumbnail for YouTube links; a branded play-button tile for uploads and Vimeo), title, duration badge, and a green "Watched" check once viewed.
  - Clicking opens an inline player dialog: embedded iframe for YouTube/Vimeo links, a native `<video>` player streaming a signed URL for uploaded files.
- **Watched tracking**: auto-marked when the video ends (or at 90% for uploads); a "Mark as watched" button covers embeds where end-events aren't available. State is stored per student per video, so it survives refresh.
- When every video of a unit is watched, that unit's **Study step counts as done** (same effect as today's study activity). Units with no videos are untouched.
- Locked units show the cards greyed out with the existing lock hint, consistent with the rest of the panel.

## Technical details

- **Migration** — two new tables:
  - `public.course_week_videos`: id, `course_id` FK, `week_number`, title, kind (`file` | `link`), url, `storage_path` (nullable), `duration_seconds` (nullable), position, timestamps. Unique (course_id, week_number, position). GRANTs + RLS: course teachers/admins manage (`is_course_member`), enrolled students read (`is_active_enrollment`).
  - `public.student_video_watches`: id, video_id FK (cascade), student_id, course_id, watched_at, unique (video_id, student_id). Students insert/read their own rows; professors can read aggregate rows for their course.
  - Storage RLS on `course-materials` already covers enrolled-student read of course files; signed URLs (existing pattern in `lessonPlanPath`/`courseMaterialFiles`) are reused for playback.
- **New lib + hook**: `src/lib/weekVideos.ts` (CRUD, URL validation, thumbnail helpers) and `useWeekVideos(courseId, week)` for the student side.
- **Teacher UI**: new `WeekVideosEditor` component mounted in the week editor in `TeachingPlan.tsx`, gated to employment courses like the stage/hours fields.
- **Student UI**: new `WatchVideosRow` + `VideoPlayerDialog` components mounted in `UnitDetailPanel`'s Study section; `UnitDetailPanel` gains optional `videos` / `watchedIds` / `onMarkWatched` props; `StudentLearningPath` fetches videos per open unit and folds "all videos watched" into the Study step state.
- Signed URLs are minted on demand when a student opens an upload (private bucket, no public URLs).

## Verification

- Unit tests for `weekVideos` URL validation/thumbnail helpers and the watched-state aggregation.
- Typecheck, existing learning-path and teaching-plan tests.
- Browser check: professor adds a link and a file to a week; student sees the cards, plays one, watched state persists across refresh, and the Study step completes when all are watched.
