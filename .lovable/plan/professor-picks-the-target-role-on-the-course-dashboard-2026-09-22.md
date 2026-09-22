# Professor picks the target role on the Course Dashboard

Skilling (employment) pathway only. Today the role students see is a free-text box buried in the Soft Skills setup step, and when it's empty students see the course name instead. This moves the choice to the professor's home page, turns it into a proper picker, and gives students a neutral label until a role is chosen.

## What the professor sees

A "Target role" card at the top of the Course Dashboard, shown only for skilling-pathway courses:

- A dropdown of common roles: AI Engineer, Machine Learning Engineer, Data Scientist, Data Analyst, Backend Engineer, Full-Stack Engineer, Frontend Engineer, Data Engineer, DevOps Engineer, Product Analyst — plus "Other role…" which reveals a text box for a custom name.
- One role only. Saving replaces the previous choice.
- The card states plainly that this is the role students see across their home page, learning path, and career readiness.
- If no role is set yet, the card shows a short prompt to pick one.

### Changing the role later

If a role is already saved and the professor picks a different one, a confirmation appears first:

> Career readiness content (interview rounds, questions, mock types) was drafted for **<old role>**. Changing the role won't rewrite it — you'll need to redraft those sections from the Soft Skills step.

Confirm saves the change; cancel leaves it untouched.

## What students see

- Home page banner: "<Role> Track · toward job-ready"; with no role set it reads "Employment Track · toward job-ready" instead of the course name.
- Learning path track label: the role, or "Employment track" when unset.
- Career readiness: unchanged behaviour, fed by the same role.

## Soft Skills setup

The existing free-text "Target role" field there is replaced by a read-only line showing the current role plus a link to the dashboard card, so there is only one place to set it. The AI drafting for career readiness keeps reading the same stored role.

## Technical notes

- No schema change: keeps using `courses.target_role` (nullable text).
- New `src/components/teacher/TargetRoleCard.tsx`: preset list constant + custom input, saves `target_role` via a `courses` update, `AlertDialog` confirmation when overwriting an existing value, toast on success/failure.
- Mounted in `src/pages/teacher/CourseDashboard.tsx` above the existing stat cards, gated by the existing `useCourseType(courseId).isEmployment`.
- `src/pages/teacher/SoftSkillsSetup.tsx`: drop the editable input and `saveTargetRole`, keep the read-only display.
- Student fallbacks updated in `src/pages/student/StudentHome.tsx` (line ~775) and `src/pages/student/StudentLearningPath.tsx` (line ~575) to the neutral label instead of `courseName`.
- Unit tests for the card: preset selection, custom role, confirmation shown only when a role already exists.
