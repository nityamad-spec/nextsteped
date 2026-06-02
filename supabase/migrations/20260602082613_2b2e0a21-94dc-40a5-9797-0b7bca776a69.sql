CREATE TABLE public.edge_function_prompt_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  stage text,
  prompt text NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX edge_function_prompt_overrides_fn_stage_idx
  ON public.edge_function_prompt_overrides (function_name, COALESCE(stage, ''));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edge_function_prompt_overrides TO authenticated;
GRANT ALL ON public.edge_function_prompt_overrides TO service_role;

ALTER TABLE public.edge_function_prompt_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage prompt overrides"
  ON public.edge_function_prompt_overrides
  FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER edge_function_prompt_overrides_set_updated_at
  BEFORE UPDATE ON public.edge_function_prompt_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();