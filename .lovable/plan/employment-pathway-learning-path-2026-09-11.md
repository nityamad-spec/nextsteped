# Employment Pathway Learning Path

Give employment-pathway students a stage-based Learning Path that matches the reference design. Academic courses keep the page exactly as it is today.

## What the student sees (employment courses only)

Header: "Your Employment Pathway", with the professor-set target role and total hours underneath, plus a goal banner showing overall percentage complete.

Below it, a vertical list of four stages connected by a track line:

1. **Stage 1 · Foundations** (Technical) — units the professor assigned to Foundations
2. **Stage 2 · Advanced Technical** (Technical) — units assigned to Advanced Technical
3. **Stage 3 · Soft Skills & Interview Prep** — the course's published Soft Skills modules
4. **Stage 4 · Capstone Project** — the course's published Project Lab entries

Each stage row shows a numbered circle (green check when complete, indigo when in progress, grey lock icon when a previous stage is unfinished), a title, a one-line description, a units/modules count, an hours estimate, and a status word (Completed / In progress / Locked).

Tapping a stage expands it inline:

- Stage 1 and 2 expand to the existing horizontal unit rail plus the existing unit detail panel (Study → Practice → Weekly Quiz, or Coding Exercises on coding units). All current mastery, readiness, quiz-attempt, unlock and void behaviour is unchanged.
- Stage 3 expands to the existing Soft Skills modules.
- Stage 4 expands to the course's Project Lab entries, each linking to the Project Lab page.

Locked stages show the lock styling and an "Unlocks when you complete Stage N" note, but they stay clickable and expandable — nothing is actually blocked, matching the current rule.

At the bottom: a "Job-Ready — start applying" banner that highlights once all four stages are complete.

## What the professor sets

In the lesson-plan step, each unit gets a **Stage** selector (Foundations / Advanced Technical) and an **Estimated hours** field. Existing units default to Foundations for the first half and Advanced Technical for the second half until the professor changes them. These fields only appear for employment-pathway courses.

Total pathway hours shown in the header are the sum of unit hours plus optional hours the professor can enter for the Soft Skills and Capstone stages.

## Technical notes

Database (additive only):
- `lesson_plan_weeks.stage` — nullable text (`foundations` / `advanced`)
- `lesson_plan_weeks.est_hours` — nullable integer
- `courses.soft_skills_hours`, `courses.capstone_hours` — nullable integers

New files:
- `src/components/student/employment/PathwayStageList.tsx` — the stage rail and expand/collapse behaviour
- `src/components/student/employment/PathwayStageRow.tsx` — one stage row
- `src/lib/pathwayStages.ts` — derives stages from lesson plan units, soft skills, project labs; computes per-stage completion, counts, hours, and overall percentage; unit tests for the fallback split and completion rules

Changed files:
- `src/pages/student/StudentLearningPath.tsx` — uses `useCourseType`; employment courses render the stage layout, wrapping the existing `UnitPathRail` / `UnitDetailPanel` inside the expanded technical stage; academic courses render the current layout unchanged
- `src/pages/teacher/TeachingPlan.tsx` — stage selector and hours field per unit (employment only)
- `src/hooks/useCourseProjectLabs.ts` reused for Stage 4 content

Verification: typecheck, `pathwayStages` unit tests, and an authenticated browser check of `/student/learning-path` for both an academic and an employment course.
