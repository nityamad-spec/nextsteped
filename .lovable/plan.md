
# Restrict professor access to their students' data

## Goal
Professors (course owners and collaborators) should be able to see the profile info (name, email, roll number, etc.) of students enrolled in their courses — and nothing beyond what course membership already grants them.

## Current state (audit)
Course-scoped tables already gate teacher reads on `is_course_member(course_id, auth.uid())`, which covers both the owning teacher and any collaborator in `course_teachers`:

- `enrollments` — Teachers can view course enrollments
- `assessment_results` — Teachers can view results for their courses
- `diagnostic_results` — Teachers can view diagnostic results for their courses (via enrollments join)
- `student_concept_mastery` — course teachers read concept mastery
- `student_course_mastery` — course teachers read course mastery
- `student_feedback` — Teachers can view feedback for their courses
- `course_roster_allowlist` — Course members can view roster

These are correct and need no change.

The single gap is `profiles`: the only teacher-relevant SELECT policy is `"Authenticated users can view teacher profiles" USING (role = 'teacher')`. Teachers currently have NO row-level access to student `profiles` rows, so any UI that shows a student's name/email today is either working via the admin auto-login bypass or returning nulls.

`chat_sessions` / `chat_messages` stay owner-only per your decision.

## Change (one migration)

Add a SELECT policy on `public.profiles`:

```sql
CREATE POLICY "Teachers can view profiles of their enrolled students"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  role = 'student'
  AND EXISTS (
    SELECT 1
    FROM public.enrollments e
    WHERE e.student_id = profiles.id
      AND public.is_course_member(e.course_id, auth.uid())
  )
);
```

Notes:
- Uses the existing `is_course_member` SECURITY DEFINER function, so it covers owners + `course_teachers` collaborators with no recursion risk.
- Scoped to `role = 'student'` so this policy never widens visibility of teacher/admin rows.
- Any enrollment row qualifies (per your answer), matching how every other course-scoped policy works today.
- No GRANT changes needed — `profiles` already has the right grants; RLS is the only gate.
- No changes to INSERT/UPDATE/DELETE on `profiles` — teachers still cannot modify student profile rows.

## Explicitly out of scope
- `chat_sessions` and `chat_messages` — remain owner-only + admin.
- Any table not listed above.
- Edge functions using `SERVICE_ROLE_KEY` (they bypass RLS by design and are not affected).
- No app/UI/edge-function code changes; this is RLS only.

## Risks
1. **Email exposure to professors.** Student email becomes readable to any teacher who has that student enrolled in any of their courses. This conflicts with the existing `mem://privacy/student-anonymity` note ("Student data anonymized for professors"). If anonymity from professors is still a hard requirement, we should instead expose a view that omits `email` and lock the base table — say the word and I'll switch the plan to that shape.
2. **Cross-course leakage on shared students.** If a student is enrolled in courses taught by professors A and B, both A and B can read that student's single profile row. This is inherent to a shared `profiles` table and matches how `student_concept_mastery`/`student_course_mastery` already behave — but worth naming.
3. **Historical enrollments count.** A student who was ever enrolled (even dropped) is visible to that course's teachers, because `enrollments` has no active flag today. If you later add one, this policy should be updated in the same pass.
4. **Policy performance.** `EXISTS` on `enrollments` with `is_course_member` is fast given existing indexes on `enrollments(student_id)` and course-teacher lookups; no new index needed, but worth monitoring if the roster grows large.
5. **No effect on admin bypass session.** With `AUTH_BYPASS` on in dev, the app signs in as an admin, so you won't be able to *verify* the new teacher policy just by browsing — you'd need to sign in as a real teacher account (or temporarily disable the bypass) to confirm the policy works end-to-end.
