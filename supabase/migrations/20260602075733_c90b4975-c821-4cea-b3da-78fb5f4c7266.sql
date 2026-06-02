CREATE TABLE public.edge_function_model_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  stage text,
  model text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE UNIQUE INDEX edge_function_model_overrides_fn_stage_idx
  ON public.edge_function_model_overrides (function_name, COALESCE(stage, ''));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edge_function_model_overrides TO authenticated;
GRANT ALL ON public.edge_function_model_overrides TO service_role;

ALTER TABLE public.edge_function_model_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage model overrides"
ON public.edge_function_model_overrides
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
