# Bring the Skill Training Test course back into view

## What's actually going on

Two separate things, neither caused by the Resources work:

1. **The course is missing from your student course list.** "Skill Training Test" is currently marked as not published. Students can only see published courses, so it disappears from the course picker even though your student account is still enrolled in it. Your other courses (Python, Cloud Engineering, etc.) are published, which is why only those show.
2. **Learning Path is empty on that course.** The skilling course has no lesson plan weeks and no concepts saved against it, so there is nothing for the Learning Path to display. Python still has all 17 weeks and 13 concepts — nothing was deleted.

Also worth knowing: while testing the Companies page I switched your student test account's selected course. That's why the view looked different when you came back.

## Proposed fix

1. **Publish the skilling course** so it reappears in the student course picker, using the professor Publish step in teacher setup (the normal flow, not a database edit).
2. **Point your student account back** at whichever course you want open by default.
3. **Fill the Learning Path** — the skilling course needs its lesson plan generated and published and its concepts saved, done through the teacher setup steps. Until that happens, Learning Path will stay empty by design.
4. **Guard against the silent disappearance** — when a student is enrolled in a course that is no longer published, show it in the picker greyed out with a short "Not published yet" note instead of hiding it completely, so it never looks like the course vanished.

## Technical notes

- `courses.published = false` for `Skill Training Test` (SK101, employment). The student-side SELECT policy on `courses` is `published = true`, so the inner join in `StudentCourseSwitcher` drops the row entirely.
- Item 4 changes `StudentCourseSwitcher` to also read enrollments whose course row is not visible, rendering them as a disabled entry. This needs a small read path that returns the course name for enrolled-but-unpublished courses (a security-definer function or an added policy scoped to `is_active_enrollment`), so no unpublished course leaks to non-enrolled users.
- `lesson_plan_weeks` and `concepts` counts for that course are both 0; no migration or data repair is involved, the content simply needs to be created in teacher setup.
