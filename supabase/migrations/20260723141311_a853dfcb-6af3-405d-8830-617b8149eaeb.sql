
create extension if not exists vector;

-- rag_chunks table
create table public.rag_chunks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  file_id uuid not null references public.course_material_files(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  folder_type text,
  chunk_index int not null,
  page_start int,
  page_end int,
  content text not null,
  token_count int,
  source_type text not null default 'pdf_text' check (source_type in ('pdf_text','ocr')),
  embedding vector(3072) not null,
  model_version text not null,
  created_at timestamptz not null default now(),
  unique (file_id, chunk_index)
);

grant select on public.rag_chunks to authenticated;
grant all on public.rag_chunks to service_role;

alter table public.rag_chunks enable row level security;

create policy "Course members can read rag chunks"
  on public.rag_chunks
  for select
  to authenticated
  using (public.is_course_member(course_id, auth.uid()));

create index rag_chunks_course_id_idx on public.rag_chunks (course_id);
create index rag_chunks_file_id_idx on public.rag_chunks (file_id);
create index rag_chunks_embedding_idx
  on public.rag_chunks
  using hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

-- similarity search function
create or replace function public.match_rag_chunks(
  _course_id uuid,
  _query_embedding vector(3072),
  _match_count int default 5,
  _folder_types text[] default null
)
returns table (
  id uuid,
  file_id uuid,
  file_name text,
  folder_type text,
  chunk_index int,
  page_start int,
  page_end int,
  content text,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.file_id,
    c.file_name,
    c.folder_type,
    c.chunk_index,
    c.page_start,
    c.page_end,
    c.content,
    1 - (c.embedding::halfvec(3072) <=> _query_embedding::halfvec(3072)) as similarity
  from public.rag_chunks c
  where c.course_id = _course_id
    and (_folder_types is null or c.folder_type = any(_folder_types))
  order by c.embedding::halfvec(3072) <=> _query_embedding::halfvec(3072)
  limit greatest(_match_count, 1);
$$;

-- status columns on course_material_files
alter table public.course_material_files
  add column if not exists rag_status text not null default 'pending',
  add column if not exists rag_error text,
  add column if not exists rag_indexed_at timestamptz;
