Update the "Concept Exploration & Mastery Map" section on `/student/home` to match the attached screenshot, without changing any database code.

Changes to `src/pages/student/StudentHome.tsx`:

1. Rename the section title from "Concept Exploration & Mastery Map" to "Concept Mastery Map".
2. Replace the existing `CardDescription` with:  
   "Your mastery per concept — grows as you work with the AI tutor, complete quizzes and exams. Separate from lesson completion."
3. Add an "Overall Mastery" display in the header row, aligned to the right, showing the existing `courseMastery` value as a percentage (e.g. "46%"). If `courseMastery` is null, show "—" or hide the value.
4. Add a full-width progress bar directly under the header that reflects the same `courseMastery` value, using the app's existing primary color token.
5. Keep the existing concept tiles grid and the mastery legend below unchanged.

No database changes. The overall mastery score is already loaded into the `courseMastery` state from `student_course_mastery`.