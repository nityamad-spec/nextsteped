-- Ensure created_at is always populated even if NULL is explicitly sent by clients
CREATE OR REPLACE FUNCTION public.set_created_at_if_null()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Apply to lookup tables used in onboarding
DROP TRIGGER IF EXISTS set_universities_created_at ON public.universities;
CREATE TRIGGER set_universities_created_at
BEFORE INSERT ON public.universities
FOR EACH ROW
EXECUTE FUNCTION public.set_created_at_if_null();

DROP TRIGGER IF EXISTS set_degrees_created_at ON public.degrees;
CREATE TRIGGER set_degrees_created_at
BEFORE INSERT ON public.degrees
FOR EACH ROW
EXECUTE FUNCTION public.set_created_at_if_null();

DROP TRIGGER IF EXISTS set_branches_created_at ON public.branches;
CREATE TRIGGER set_branches_created_at
BEFORE INSERT ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.set_created_at_if_null();

-- Enforce non-null created_at at schema level
ALTER TABLE public.universities ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.degrees ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.branches ALTER COLUMN created_at SET NOT NULL;