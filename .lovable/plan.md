## Goal

Enforce orphan-row protection for `diagnostic_questions` at the data layer so application bugs (or future code paths) can never insert rows where `concept_id` is NULL or `topic` does not match the linked concept's `concept_code`.

Scope: database only. No app or edge function changes required (the edge function already enforces this in code; this plan adds a defense-in-depth backstop at the DB level).

---

## Step 1 — Backfill / sanity check existing data

Before adding constraints, verify current rows comply. If any violate, the migration will fail.

Run via `supabase--read_query`:

```sql
-- orphan rows (should be 0)
select count(*) from diagnostic_questions where concept_id is null;

-- mismatched topic vs concept_code (should be 0)
select dq.id, dq.topic, c.concept_code
from diagnostic_questions dq
left join concepts c on c.id = dq.concept_id
where c.id is null or c.concept_code <> dq.topic;
```

If violators exist, decide per row: delete (safest for orphan rows) or repair `topic` to match `concepts.concept_code`. Will surface findings to the user before running the migration.

## Step 2 — Add NOT NULL on `concept_id`

```sql
alter table public.diagnostic_questions
  alter column concept_id set not null;
```

This is the strongest, simplest guarantee against orphan rows. Postgres rejects any insert/update that leaves `concept_id` null.

## Step 3 — Add a real foreign key to `concepts(id)`

Currently `concept_id` is just a uuid column with no FK. Add:

```sql
alter table public.diagnostic_questions
  add constraint diagnostic_questions_concept_id_fkey
  foreign key (concept_id) references public.concepts(id)
  on delete restrict
  on update cascade;
```

`on delete restrict` chosen so a teacher can't silently delete a concept that still has diagnostic questions attached — they must clean up the question bank first. (Alternative: `on delete cascade` if the user prefers questions to disappear with their concept; will confirm in Step 6.)

## Step 4 — Enforce `topic == concepts.concept_code` via trigger

A CHECK constraint can't reference another table, so use a `BEFORE INSERT OR UPDATE` trigger:

```sql
create or replace function public.diagnostic_questions_validate_topic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_code text;
begin
  select concept_code into expected_code
  from public.concepts
  where id = new.concept_id;

  if expected_code is null then
    raise exception 'concept_id % does not exist in concepts', new.concept_id
      using errcode = '23503';
  end if;

  if new.topic is null or new.topic <> expected_code then
    raise exception 'topic (%) must match concepts.concept_code (%) for concept_id %',
      new.topic, expected_code, new.concept_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trg_diagnostic_questions_validate_topic
before insert or update of concept_id, topic
on public.diagnostic_questions
for each row
execute function public.diagnostic_questions_validate_topic();
```

Notes:
- Trigger fires only when `concept_id` or `topic` is touched on UPDATE, minimizing overhead.
- Uses `security definer` + pinned `search_path` per project conventions.
- Error codes match Postgres semantics (`23503` foreign key, `23514` check) so the edge function's existing error handling stays meaningful.

## Step 5 — Index to keep the FK lookup cheap

```sql
create index if not exists idx_diagnostic_questions_concept_id
  on public.diagnostic_questions(concept_id);
```

## Step 6 — Confirm one decision before migrating

One question for the user before running the migration:

- On `concepts` deletion: **RESTRICT** (block deletion if questions exist; teacher must clean up) vs **CASCADE** (auto-delete dependent diagnostic questions). Default proposal: **RESTRICT** — safer, prevents silent data loss.

Will use `questions--ask_questions` to confirm before submitting the migration.

## Step 7 — Validation after migration

- `supabase--read_query`:
  - `select count(*) from diagnostic_questions where concept_id is null;` → 0
  - Inspect `information_schema.table_constraints` and `pg_trigger` to confirm FK + trigger are present.
- Negative tests via `supabase--insert`:
  - Attempt insert with `concept_id = null` → expect error `23502` (not null).
  - Attempt insert with random uuid for `concept_id` → expect FK error `23503`.
  - Attempt insert with valid `concept_id` but wrong `topic` → expect trigger error `23514`.
  - Attempt valid insert → succeeds.
- Re-run the diagnostic generation flow once via `supabase--curl_edge_functions` against the global-economics course to confirm the happy path still works end-to-end with the new constraints.

## Out of scope

- Schema changes to `concepts`, `assessment_questions`, or other tables.
- App / edge function changes (the validation already exists in code; this is purely a DB backstop).
- Backfilling historical mismatches beyond the Step 1 cleanup.

---

## Files / artifacts

- One migration submitted via `supabase--migration` containing Steps 2–5.
- No source files edited.
