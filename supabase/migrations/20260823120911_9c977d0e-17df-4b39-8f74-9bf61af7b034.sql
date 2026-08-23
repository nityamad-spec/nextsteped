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

  -- Non-admins (course teachers) may only:
  --   1. REQUEST access: none/rejected -> pending
  --   2. WITHDRAW/decline: pending/rejected -> none
  -- In both cases review fields must stay empty; requested_at is set only on request.
  IF NEW.coding_reviewed_at IS NULL
     AND NEW.coding_reviewed_by IS NULL
     AND (
       (OLD.coding_access_status IN ('none', 'rejected') AND NEW.coding_access_status = 'pending')
       OR (OLD.coding_access_status IN ('pending', 'rejected') AND NEW.coding_access_status = 'none')
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed to change coding access status this way'
    USING ERRCODE = '42501';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.courses_coding_access_guard() FROM PUBLIC, anon, authenticated;