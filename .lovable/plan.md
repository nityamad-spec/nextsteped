# Lesson plan showing the wrong course's concepts

## What I checked
- **The Python course's own lesson plan is on-topic.** All 17 weeks use Python concepts from its concept list, e.g. Week 1 Functions and Modules, Week 3 Conditional Logic, Week 8 String Manipulation, Week 10 Lists, and so on through Week 16 Exception Handling.
- **The screen you're looking at is not the Python course.** "Python & Data Foundations for AI" and "Machine Learning Fundamentals" are Weeks 1–2 of **Skill Training Test (SK101)**, the AI Engineer demo course. The page's network activity shows the setup screen opening for Python, then the lesson plan page loading SK101. It also saved a draft into SK101 at 21:41.
- **The 5 blank concept rows are a second bug.** SK101's demo weeks store concepts as plain words ("Supervised learning"), but the page expects named entries. So it draws empty rows with only a number.
- **Smaller Python issues found along the way:**
  - Weeks 1 and 2 are both "Functions and Modules".
  - Weeks 3 and 4 are both "Conditional Logic".
  - Week 5 uses "Conditional Statements", which isn't in the concept list.
  - "Python Fundamentals" and "Iteration (Loops)" aren't taught in any week.
  - Week 11 is an empty placeholder titled "Week 10".

## Why the course switches (to be confirmed first)
The setup checklist and the lesson plan page each work out "which course am I on" separately, from a remembered choice in the browser. That value got changed to SK101 partway through. The likely cause is another part of the page resetting it, such as the course switcher or the professor's saved "active course". Step 1 pins down exactly which one before anything is changed.

## Fix
1. **Find the switch.** Reproduce on the professor test account (read-only, no saves). Log every place that changes the current course while moving from the setup checklist to the lesson plan.
2. **One source of truth for the current course.** Make the setup pages and lesson plan use the same course. Only an explicit pick in the course switcher can change it. Background checks must never swap it silently.
3. **Show which course you're editing.** Put the course name and code at the top of the lesson plan page, so a mismatch is obvious at a glance.
4. **Don't save into the wrong course.** The automatic draft save only runs for the course the page opened with. If the course changes mid-page, reload instead of saving.
5. **Render plain-word concepts.** Accept both formats, so SK101's weeks show "Supervised learning" etc. instead of blank rows.
6. **Python plan clean-up (your call, see question).** Flag the duplicate weeks, the unknown concept in Week 5, the two concepts that aren't taught, and the empty Week 11. This would go in a "coverage check" note on the lesson plan page, without changing your plan automatically.

## Technical notes
- `useTeacherCourseId` is used by both `CourseSetup` and `TeachingPlan`. Candidates come from AppContext, then localStorage `currentCourseId`, then a recovery step. I'll audit writers of `currentCourseId` and `setCurrentCourse`: `CourseSwitcher`, `App.tsx` TeacherRedirect (`profile.active_course_id`), and the recovery branch. Only the switcher can persist a change.
- `TeachingPlan.tsx`: capture the course id on mount for draft upserts, and add a course header. Normalise `concepts` entries (`string` → `{ id, name }`) where weeks load.
- The earlier `course_material_files` permission errors on the Python draft (you're a co-teacher there, not the owner) get looked at in step 1 as a related symptom.
- No data is changed. SK101's rows stay as they are.
