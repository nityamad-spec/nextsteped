# Fix: Lesson Plan Invisible to Students — Schema Mismatch Between Publish and Read

## Root cause (verified against live data + network logs)

Storage and RLS are fine. The teacher's republish at `2026-04-29 01:02:09Z` succeeded — the network panel shows `GET .../published-plan.json` returning **HTTP 200** with valid JSON, and the student is correctly enrolled in course `808605a6...`. The student's UI still says "Lesson plan not yet available" because of a **JSON shape mismatch**.

Two different code paths publish to the same `published-plan.json` slot with two different schemas:

| Publisher | File shape | Field names |
|---|---|---|
| `src/pages/teacher/CourseCreation.tsx` (AI lesson-plan flow, line ~515) | `{ "weeks": [...], "overall_course_learning_outcomes": "..." }` | `week`, `week_name`, `overview`, `concepts[]`, `resources[]`, `is_exam_week`, `locked` |
| `src/pages/teacher/TeachingPlan.tsx` (manual editor, line ~199) | `[ ... ]` (top-level array) | `day`, `topic`, `description`, `resources[]` |

The student reader (`src/pages/student/StudentHome.tsx`, line 126):
```ts
const parsed = JSON.parse(await data.text());
if (Array.isArray(parsed) && parsed.length > 0) { /* render */ }
```
fails the `Array.isArray` check on the new shape, falls through, and sets `lessonPlanPublished = false`.

The most recent file in storage for the affected course was written by the AI flow (`{weeks: [...]}`), so the student silently sees the empty state. The AI Chat's `fetchVisibleTopics` has the same bug.

## Fix

Introduce one canonical normalizer and apply it everywhere a lesson plan JSON is read. Stop writing two incompatible shapes; converge on the AI shape (it's the richer one and is what the teacher dashboard already uses).

### 1. New helper: `src/lib/lessonPlanShape.ts`

Pure function `normalizeLessonPlan(parsed: unknown): NormalizedWeek[]` that accepts either shape and returns a uniform array consumed by the student UI:

```ts
type NormalizedWeek = {
  id: string;
  day: number;            // week number (kept name for back-compat with current renderer)
  topic: string;          // week_name OR legacy topic
  description: string;    // overview OR legacy description
  is_exam_week: boolean;
  locked: boolean;
  concepts: { id: string; name: string; brief_description?: string }[];
  resources: { id: string; type: string; title: string; description?: string; url?: string; concept?: string; action?: string }[];
};
```

Logic:
- If `Array.isArray(parsed)` → assume legacy `{day, topic, description, resources}` shape, map straight through (concepts derived from `resources[].concept` distinct values when absent).
- Else if `parsed?.weeks` is an array → map AI shape: `day = w.week`, `topic = w.week_name || \`Week ${w.week}\``, `description = w.overview || ""`, carry `is_exam_week`, default `locked = w.locked ?? false`.
- Else → return `[]`.

Also export `extractOverallOutcomes(parsed): string` so the "Learning Outcomes" panel can fall back to the AI's `overall_course_learning_outcomes` when per-week outcomes are absent.

### 2. `src/pages/student/StudentHome.tsx`

- Replace lines 126–133 with:
  ```ts
  const parsed = JSON.parse(await data.text());
  const normalized = normalizeLessonPlan(parsed);
  if (normalized.length > 0) {
    setLessonPlanPublished(true);
    setLessonPlanError(false);
    setLessonPlan(normalized.filter((d) => isWeekVisible(d, computedWeek)));
    setPlanLoading(false);
    return;
  }
  ```
- The renderer already keys off `dp.day`, `dp.topic`, `dp.resources[]`, etc., so once normalization happens it just works. The "Learning Outcomes" regex on `dp.description` will harmlessly produce empty outcomes for AI-shape entries that store outcomes elsewhere — acceptable for this fix; richer per-week outcomes can come later if needed.
- Remove the unused `course.teacher_id` argument from `resolvePublishedPath(course, course.teacher_id)` on line 112 — it should be `resolvePublishedPath(course, enrolledCourseId)`. Today it works only because `course.lesson_plan_path` is set, but if the column is ever cleared this would build a path under the teacher's UUID and 404. Pure correctness cleanup.

### 3. `src/pages/student/AIChat.tsx`

`fetchVisibleTopics` does the same `Array.isArray` check. Wrap the parsed JSON with `normalizeLessonPlan` and treat the returned array as the source of truth for visible topics. This makes exam-mode topic constraints work on AI-generated plans.

### 4. `src/pages/teacher/TeachingPlan.tsx`

- On load (around line 160), pipe the downloaded JSON through `normalizeLessonPlan` so the manual editor can open AI-generated plans without resetting to `defaultPlan`. Today it silently throws away AI plans because the shape check fails.
- On save (line 199), keep writing the legacy array — but ALSO recognize that downstream consumers (now via the normalizer) handle either shape, so manual edits no longer break AI-generated content.
- (Out of scope for this fix: full convergence on a single write shape; tracked as a follow-up so the editor can round-trip AI-generated plans 1:1.)

### 5. No DB or storage changes

The course row, RLS policies, and storage objects are correct. No migration is needed — the next page load with the new normalizer will render the existing `{weeks: [...]}` file.

## Verification

1. Reload `/student/home` as `akashsinha.ai@gmail.com` → "Lesson Plan" card shows 16 weeks expanded under Week 1, with concepts and resources from the AI-generated plan.
2. Hard refresh AI Chat in exam mode → visible-topic constraint includes Week 1 concepts (Python Data Types, Variables and Expressions).
3. As the teacher, open Teaching Plan → editor populates from the existing AI plan instead of the default Python template.
4. Re-save from the manual editor → student page still renders (legacy array shape now passes through the same normalizer).

## Files

- New: `src/lib/lessonPlanShape.ts`
- Edited: `src/pages/student/StudentHome.tsx`, `src/pages/student/AIChat.tsx`, `src/pages/teacher/TeachingPlan.tsx`

## Out of scope

- Unifying the two writer formats into one canonical shape (worth doing next; this fix makes both readable so the bug is gone immediately).
- Per-week learning-outcomes rendering for AI plans — current renderer parses outcomes out of the legacy `description` field; the AI shape stores them differently. Tracked separately.
