Cause
- `WeeklyQuizDialog` caps the quiz at `numQuestions` (default 5, passed as `taSettings.quizNumQuestions || 5` from StudentHome), and ignores the `tier` field on each row, so it just shuffles all rows and slices the first 5.
- The generator (`supabase/functions/generate-weekly-quiz/index.ts`) actually creates 20 rows per week: 5 each of `tier` = `standard`, `easy`, `medium`, `hard`.
- The intended student quiz is 10 questions: 5 `standard` (common to everyone) + 5 adaptive (one of `easy` / `medium` / `hard` chosen by the student's level).

Fix (`src/components/WeeklyQuizDialog.tsx`)
1. Stop using `numQuestions` to cap the quiz. Always target 10 questions: 5 standard + 5 adaptive.
2. After fetching rows, also fetch the student's `learner_level` from `student_course_mastery` for `(student_id, course_id)` and map it to a tier:
   - `beginner` → `easy`
   - `developing` → `medium`
   - `proficient` → `medium`
   - `expert` → `hard`
   - missing/unknown → `medium`
3. Split rows by `tier`, seeded-shuffle each bucket with the existing `(studentId + courseId)` seed, take 5 standard + 5 from the chosen adaptive tier, then seeded-shuffle the combined list for presentation order. If the chosen adaptive tier has fewer than 5 rows, fall back in order: medium → easy → hard to top up.
4. Keep the `id`-keyed `questionMeta` (difficulty + bloom) so mastery updates remain unchanged.
5. Remove the now-unused `numQuestions` prop (and the StudentHome call site) since the count is fixed at 10 per spec.

Technical notes
- `assessment_questions.tier` is already selected by `select("*")`, no schema change needed.
- Use existing `seededShuffle`.
- Add the `learner_level` fetch in the same async block; on error, default to `medium`.

Verification
- Reload `/student/home`, open a week's quiz, confirm exactly 10 questions render and that 5 of them are `standard`-tier rows in the DB while the other 5 match the student's adaptive tier.