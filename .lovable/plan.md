# Lesson plan not restored after re-login — diagnosis & fix

## Diagnosis

The lesson plan **is** persisted correctly. For both of your courses the DB shows:
- `courses.lesson_plan_path` set
- `courses.lesson_plan_published_at` set
- `lesson_plan_weeks` has 16 rows

So publish writes are landing in three places: `lesson_plan_weeks` table, `published-plan.json` in storage, and the courses row pointer. None of these are read on page load.

### Root cause (CourseCreation.tsx, lines 273–291)

The restore effect on `/teacher/setup/lesson-plan` only ever tries two sources, in this order:

1. `localStorage["lessonPlanDraftV2:{courseId}"]`
2. `course-materials/{courseId}/lesson-plan/draft-plan-v2.json` (the **draft** file, not the published file)

If localStorage is cleared (different device/browser, Safari ITP 7‑day purge, cache wipe, incognito) **and** the draft storage download fails or returns nothing, the page silently lands in the `"idle"` phase and looks empty — even though the published plan is intact in the DB.

Your console logs already show flaky Safari network behavior (`TypeError: Load failed` on `setup_progress_log`), which is exactly the condition that makes the draft download fail silently here.

Additional fragility:
- The restore effect runs once at mount with `courseId` possibly `null` (it's resolved asynchronously by `useEffect` at line 125). When `courseId` later resolves and the effect re-runs, `restoringDraft` is no longer reset to `true`, so the persist effect can race with the second restore.
- The `lesson_plan_weeks` table — the actual source of truth used by the student view and Course Dashboard — is never consulted by this screen.

## Fix

Add a DB fallback to the restore path in `src/pages/teacher/CourseCreation.tsx`. No backend changes (rows already exist), no schema changes.

### Behavior

After the existing local→draft attempts, if `weeks` is still empty and we have a `courseId`, hydrate from the database:

1. Read `courses` row: `lesson_plan_published_at`, `lesson_plan_overall_outcomes`, `total_weeks`, `midterm_week`, `final_week`, etc.
2. Read `lesson_plan_weeks` for that course (ordered by `week_number`).
3. If rows exist, map them into the local `weeks` shape used by `applyDraft` (week, week_name, overview, is_exam_week, locked, concepts, resources) and call `applyDraft({ weeks, published: true, publishTimestamp: <from lesson_plan_published_at>, overallOutcomes })`.
4. Also re-seed `localStorage["lessonPlanDraftV2:{courseId}"]` from the hydrated state so subsequent loads are instant.

### Restore-effect hardening

- Reset `restoringDraft = true` at the start of the effect (not just initial state) so the second run (after `courseId` resolves) still blocks the persist effect during hydration.
- Only consider the local/draft attempt "successful" if it actually produced `weeks.length > 0`; otherwise fall through to the DB fallback instead of returning early.
- Order: localStorage → draft storage → **DB (`lesson_plan_weeks` + `courses`)** → idle.

### Defensive bonus (small)

In the existing persist effect (line 332), keep the `weeks.length === 0` guard so a transient empty state never overwrites the good draft in storage. (Already present — verify, no change.)

## Files

- `src/pages/teacher/CourseCreation.tsx` — extend the restore `useEffect` (lines 273–291) with the DB fallback branch and the `setRestoringDraft(true)` reset at the top.

No migrations. No changes to publish, student view, or Course Dashboard.

## Verification

1. Publish a plan as a teacher, confirm `lesson_plan_weeks` has rows (already true).
2. In DevTools, delete `lessonPlanDraftV2:{courseId}` from localStorage and the `draft-plan-v2.json` object from the `course-materials` bucket.
3. Reload `/teacher/setup/lesson-plan` → plan should re-appear, marked as Published with the correct timestamp.
4. Log out, log back in on a different browser → plan visible.
5. Re-publish after edit → still works (persist path unchanged).
