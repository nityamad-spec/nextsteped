
-- Create universities table
CREATE TABLE public.universities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create degrees table
CREATE TABLE public.degrees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create branches table
CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  degree_id uuid REFERENCES public.degrees(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name, degree_id)
);

-- Add foreign keys to profiles
ALTER TABLE public.profiles
  ADD COLUMN university_id uuid REFERENCES public.universities(id),
  ADD COLUMN degree_id uuid REFERENCES public.degrees(id),
  ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- RLS for universities (public read, no public write)
ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view universities" ON public.universities FOR SELECT TO authenticated USING (true);

-- RLS for degrees (public read)
ALTER TABLE public.degrees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view degrees" ON public.degrees FOR SELECT TO authenticated USING (true);

-- RLS for branches (public read)
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view branches" ON public.branches FOR SELECT TO authenticated USING (true);
