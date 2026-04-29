I verified the enrollment code shown in the screenshot (`6da6f4c2`) against the backend. The course row exists and `enrollment_open = true`, but `published = false`, so the student onboarding validator correctly rejects it as not open to students.

The likely root cause is the recent collaborator publishing UI: the UI allows collaborators to click Publish, but the backend course update policy still only permits the course owner/admin to update the `courses` row. Because the current update call does not request the updated row back, a blocked/no-op update can appear successful in the UI while the database remains unpublished.

Plan to fix:

1. Add backend permission for collaborators to update course publish/enrollment status
   - Create a database migration adding a `courses` UPDATE policy for authenticated course members using the existing `is_course_member(id, auth.uid())` helper.
   - This will make the “collaborators can publish courses” feature real at the database level, not just in the UI.

2. Make publish/enrollment UI verify the database actually changed
   - Update `CourseStatusBanner` so `update()` uses `update(...).select("id, published, enrollment_open, enrollment_code, teacher_id").maybeSingle()`.
   - Only show success and update local state if the backend returns the changed course row.
   - If no row comes back, show a permission/status error instead of optimistically displaying “Published”.

3. Harden the setup completion publish step
   - Update `PublishEnrollment.tsx` so finishing onboarding also requests the updated row back.
   - If publishing fails or returns no updated row, show an error and do not silently navigate as if the course is live.

4. Improve the student-facing validation message
   - Keep the enrollment-code validator requiring both `published = true` and `enrollment_open = true`.
   - Make the “not open” message more precise: if the course is unpublished, tell the student the instructor has not published the course yet; if enrollment is closed, tell them enrollment is closed.

5. Verify the known affected course
   - After the code/policy fix, check the same enrollment code path again.
   - The course `6da6f4c2` will still need to be published once from the teacher dashboard; after that the student onboarding field should show valid status.

Technical details:

```sql
CREATE POLICY "Collaborators can update courses"
ON public.courses
FOR UPDATE
TO authenticated
USING (public.is_course_member(id, auth.uid()))
WITH CHECK (public.is_course_member(id, auth.uid()));
```

This keeps access scoped to teachers who are members of that course and does not make courses publicly editable.