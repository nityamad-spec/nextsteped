-- Global resource libraries (admin-managed) + per-course professor picks.

create table public.resource_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  tier text not null default 'mid_tier' check (tier in ('tier_1','mid_tier','startup')),
  roles text[] not null default '{}',
  pay_range text,
  interview_format text,
  focus_areas text,
  dsa_difficulty numeric,
  locations text,
  apply_url text,
  logo_color text not null default 'bg-primary',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resource_compensation (
  id uuid primary key default gen_random_uuid(),
  role_title text not null,
  base_range text,
  bonus_range text,
  equity_range text,
  total_range text,
  notes text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resource_files (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('company','compensation')),
  resource_id uuid not null,
  file_name text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table public.resource_links (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('company','compensation')),
  resource_id uuid not null,
  label text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create table public.course_resource_picks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  resource_type text not null check (resource_type in ('company','compensation')),
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  unique (course_id, resource_type, resource_id)
);

-- Grants
grant select, insert, update, delete on public.resource_companies to authenticated;
grant all on public.resource_companies to service_role;
grant select, insert, update, delete on public.resource_compensation to authenticated;
grant all on public.resource_compensation to service_role;
grant select, insert, update, delete on public.resource_files to authenticated;
grant all on public.resource_files to service_role;
grant select, insert, update, delete on public.resource_links to authenticated;
grant all on public.resource_links to service_role;
grant select, insert, update, delete on public.course_resource_picks to authenticated;
grant all on public.course_resource_picks to service_role;

-- RLS
alter table public.resource_companies enable row level security;
alter table public.resource_compensation enable row level security;
alter table public.resource_files enable row level security;
alter table public.resource_links enable row level security;
alter table public.course_resource_picks enable row level security;

-- Global libraries: any signed-in user can read (professors browse to pick;
-- content is public job-market info). Only admins write.
create policy "Authenticated read companies"
  on public.resource_companies for select to authenticated using (true);
create policy "Admins manage companies"
  on public.resource_companies for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "Authenticated read compensation"
  on public.resource_compensation for select to authenticated using (true);
create policy "Admins manage compensation"
  on public.resource_compensation for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "Authenticated read resource files"
  on public.resource_files for select to authenticated using (true);
create policy "Admins manage resource files"
  on public.resource_files for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "Authenticated read resource links"
  on public.resource_links for select to authenticated using (true);
create policy "Admins manage resource links"
  on public.resource_links for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Picks: course teachers manage; enrolled students read.
create policy "Course members read picks"
  on public.course_resource_picks for select to authenticated
  using (
    public.is_course_member(course_id, auth.uid())
    or public.is_active_enrollment(course_id, auth.uid())
    or public.is_admin(auth.uid())
  );
create policy "Course members insert picks"
  on public.course_resource_picks for insert to authenticated
  with check (public.is_course_member(course_id, auth.uid()));
create policy "Course members update picks"
  on public.course_resource_picks for update to authenticated
  using (public.is_course_member(course_id, auth.uid()))
  with check (public.is_course_member(course_id, auth.uid()));
create policy "Course members delete picks"
  on public.course_resource_picks for delete to authenticated
  using (public.is_course_member(course_id, auth.uid()));

create index idx_resource_companies_position on public.resource_companies(position);
create index idx_resource_compensation_position on public.resource_compensation(position);
create index idx_course_resource_picks_course on public.course_resource_picks(course_id);
