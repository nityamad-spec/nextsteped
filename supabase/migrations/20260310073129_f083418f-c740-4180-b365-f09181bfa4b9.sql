
ALTER TABLE public.diagnostic_results
  ADD CONSTRAINT diagnostic_results_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
