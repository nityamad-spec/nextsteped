# Add demo content to "Skill Training Test"

## Why the page is empty

The course has no lesson plan at all: no weeks saved, the plan was never published, and there are no soft skills modules or capstone projects. The Learning Path page is behaving correctly.

## What I'll add

Sample content for this one course only, so the employment pathway is fully visible:

- **6 units** with names, short overviews and a few concepts each
  - Units 1-3 assigned to Stage 1 (Foundations), 8 hours each
  - Units 4-6 assigned to Stage 2 (Advanced Technical), 10 hours each
- **3 soft skills modules** (communication, teamwork, interview readiness), published, 12 hours for the stage
- **2 capstone projects** in Project Lab, published, 20 hours for the stage
- **Target role** set to "AI Engineer"
- Mark the lesson plan as published so students can see it

## Technical notes

- Data-only: rows inserted into `lesson_plan_weeks`, `course_soft_skills`, `course_project_labs`, plus an update of `courses` (`target_role`, `soft_skills_hours`, `capstone_hours`, `lesson_plan_published_at`) scoped to course `af6c9a6e…d81a`.
- No schema or application code changes.
- The professor can edit or replace everything from the normal setup screens; republishing the plan preserves the stage and hour values.
