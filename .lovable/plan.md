# Restore the Skill Training Test course and its four-stage Learning Path

## Confirmed cause

You remembered correctly. The course previously had a complete demo pathway:

- 6 technical units: 3 Foundations and 3 Advanced Technical
- 3 Career Readiness modules
- 2 Capstone projects
- AI Engineer target role and about 86 total hours

At **14:18 UTC today**, the professor account ran the syllabus-reset action for **Skill Training Test**. The database audit confirms that action:

- deleted exactly 6 `lesson_plan_weeks`
- removed the uploaded AI Engineer Bootcamp syllabus and saved lesson-plan files
- cleared the published lesson-plan date
- set the course to unpublished
- reset three setup-progress markers

That explains both symptoms: the unpublished course disappeared from the student's course picker, and its six technical units disappeared from Learning Path. The 3 Career Readiness modules and 2 Capstone projects were not deleted and are still present. The Companies/Resources changes did not cause this reset.

## Restore now

1. Recreate the six demo technical units for Skill Training Test:
   - Units 1–3 assigned to Foundations, 8 hours each
   - Units 4–6 assigned to Advanced Technical, 10 hours each
   - Restore their summaries, outcomes, activities, visibility, coding-week settings, and stage metadata as closely as possible from the earlier approved demo structure
2. Restore the course's published lesson-plan state and publish the course again, keeping:
   - target role: AI Engineer
   - Career Readiness: 3 existing published modules, 12 hours
   - Capstone: 2 existing published projects, 20 hours
3. Keep the 16-company Resources library and all current career-readiness work intact.
4. Set the student test account's active course back to Skill Training Test.
5. Verify in the live student view that:
   - Skill Training Test appears in the course picker
   - Learning Path shows all four stages
   - Foundations has 3 units
   - Advanced Technical has 3 units
   - Career Readiness and Capstone still show their existing content
   - Resources still shows the 16 selected companies

## Prevent a repeat

Improve the syllabus-reset confirmation to state plainly that it will remove the published Learning Path and hide an unpublished course from students. Require the professor to confirm the course name before the destructive reset runs.

## Important limitation

The reset intentionally deleted the original saved lesson-plan rows and files. The audit preserves what was deleted and the prior pathway structure, but not a full backup of every sentence inside each unit. The restored path can match the prior six-unit structure, stages, hours, and AI Engineer subject matter; exact deleted wording cannot be guaranteed.
