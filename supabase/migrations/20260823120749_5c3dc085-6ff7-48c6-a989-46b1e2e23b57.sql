ALTER TABLE public.courses
  ADD COLUMN coding_access_status text NOT NULL DEFAULT 'none',
  ADD COLUMN coding_requested_at timestamptz,
  ADD COLUMN coding_reviewed_at timestamptz,
  ADD COLUMN coding_reviewed_by uuid REFERENCES public.profiles(id);

CREATE OR REPLACE FUNCTION public.courses_coding_access_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role (edge functions, wipes) bypasses the guard entirely.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Nothing changed: allow.
  IF NEW.coding_access_status IS NOT DISTINCT FROM OLD.coding_access_status
     AND NEW.coding_requested_at IS NOT DISTINCT FROM OLD.coding_requested_at
     AND NEW.coding_reviewed_at IS NOT DISTINCT FROM OLD.coding_reviewed_at
     AND NEW.coding_reviewed_by IS NOT DISTINCT FROM OLD.coding_reviewed_by THEN
    RETURN NEW;
  END IF;

  -- Admins may perform any transition and set review fields.
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Non-admins (course teachers) may only REQUEST access:
  -- none/rejected -> pending, with requested_at stamped and review fields cleared.
  IF OLD.coding_access_status IN ('none', 'rejected')
     AND NEW.coding_access_status = 'pending'
     AND NEW.coding_reviewed_at IS NULL
     AND NEW.coding_reviewed_by IS NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed to change coding access status this way'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER trg_courses_coding_access_guard
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.courses_coding_access_guard();