-- Role x company-tier fresh-grad compensation matrix (India, LPA)

CREATE TABLE public.comp_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  examples TEXT,
  accent TEXT NOT NULL DEFAULT 'emerald',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.comp_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  blurb TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.comp_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.comp_roles(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES public.comp_tiers(id) ON DELETE CASCADE,
  low_lpa NUMERIC,
  high_lpa NUMERIC,
  mid_lpa NUMERIC,
  base_note TEXT,
  bonus_note TEXT,
  equity_note TEXT,
  note TEXT,
  not_typical BOOLEAN NOT NULL DEFAULT false,
  is_manual BOOLEAN NOT NULL DEFAULT false,
  sources TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role_id, tier_id)
);

CREATE TABLE public.comp_refresh_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  model TEXT,
  sources TEXT,
  message TEXT,
  cells_updated INTEGER NOT NULL DEFAULT 0,
  snapshot JSONB,
  created_by UUID
);

GRANT SELECT ON public.comp_tiers TO anon, authenticated;
GRANT SELECT ON public.comp_roles TO anon, authenticated;
GRANT SELECT ON public.comp_cells TO anon, authenticated;
GRANT SELECT ON public.comp_refresh_runs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.comp_tiers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.comp_roles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.comp_cells TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.comp_refresh_runs TO authenticated;
GRANT ALL ON public.comp_tiers TO service_role;
GRANT ALL ON public.comp_roles TO service_role;
GRANT ALL ON public.comp_cells TO service_role;
GRANT ALL ON public.comp_refresh_runs TO service_role;

ALTER TABLE public.comp_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_refresh_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comp_tiers readable" ON public.comp_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "comp_tiers admin write" ON public.comp_tiers FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "comp_roles readable" ON public.comp_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "comp_roles admin write" ON public.comp_roles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "comp_cells readable" ON public.comp_cells FOR SELECT TO authenticated USING (true);
CREATE POLICY "comp_cells admin write" ON public.comp_cells FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "comp_runs readable" ON public.comp_refresh_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "comp_runs admin write" ON public.comp_refresh_runs FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

COMMENT ON TABLE public.resource_compensation IS 'DEPRECATED: replaced by comp_roles/comp_tiers/comp_cells salary matrix';
