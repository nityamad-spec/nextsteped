
-- courses: add INSERT + DELETE for admins
CREATE POLICY "Admins can insert courses" ON public.courses
FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete courses" ON public.courses
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- course_material_files: full admin manage
CREATE POLICY "Admins can manage all course_material_files" ON public.course_material_files
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- assessment_results: admin UPDATE + DELETE
CREATE POLICY "Admins can update assessment_results" ON public.assessment_results
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete assessment_results" ON public.assessment_results
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- diagnostic_results: admin UPDATE + DELETE
CREATE POLICY "Admins can update diagnostic_results" ON public.diagnostic_results
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete diagnostic_results" ON public.diagnostic_results
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- enrollments: admin UPDATE + DELETE
CREATE POLICY "Admins can update enrollments" ON public.enrollments
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete enrollments" ON public.enrollments
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- student_feedback: admin UPDATE + DELETE
CREATE POLICY "Admins can update student_feedback" ON public.student_feedback
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete student_feedback" ON public.student_feedback
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- signin_attempts: admin INSERT + UPDATE + DELETE
CREATE POLICY "Admins can insert signin_attempts" ON public.signin_attempts
FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update signin_attempts" ON public.signin_attempts
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete signin_attempts" ON public.signin_attempts
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- signup_attempts: admin INSERT + UPDATE + DELETE
CREATE POLICY "Admins can insert signup_attempts" ON public.signup_attempts
FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update signup_attempts" ON public.signup_attempts
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete signup_attempts" ON public.signup_attempts
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- profiles: admin DELETE
CREATE POLICY "Admins can delete profiles" ON public.profiles
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- cache_versions: admin ALL
CREATE POLICY "Admins can manage cache_versions" ON public.cache_versions
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- teacher_applications: tighten WITH CHECK on existing ALL policy
DROP POLICY IF EXISTS "Admins can manage teacher applications" ON public.teacher_applications;
CREATE POLICY "Admins can manage teacher applications" ON public.teacher_applications
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
