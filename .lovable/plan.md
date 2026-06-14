## Goal

Make every step of a diagnostic-question generation run traceable from the admin dashboard, with the reasoning behind each success, drop, or failure visible at a glance.

Today we only persist one row per `(run, tier)` in `diagnostic_generation_runs` (final status, accepted count, error_code). When a tier "fails as incomplete" there is no way to see *which* questions were rejected, *why*, what the model returned, or where the deadline was spent. We will add a fine-grained event log + an admin viewer.

## 1. New table: `diagnostic_generation_events`

One row per meaningful step inside a run. Append-only, scoped to a `run_id`.

Columns:
- `id uuid pk`
- `run_id uuid` (matches `diagnostic_generation_runs.run_id`)
- `course_id uuid`
- `tier text null` (null for run-level events like `run_started`, `preseed_loaded`, `run_finished`)
- `attempt int null`
- `step text` — enum-like string, see catalog below
- `status text` — `info` | `ok` | `warn` | `error`
- `message text` — short human-readable summary
- `reason text null` — long explanation / model snippet / validator output
- `data jsonb null` — structured payload (counts, ids, ms, prompt size, gateway request_id, rejected question excerpt, etc.)
- `gateway_call_id uuid null` — FK-style link to `ai_gateway_call_log.id` when the event wraps a model call
- `duration_ms int null`
- `created_at timestamptz default now()`

Indexes: `(run_id, created_at)`, `(course_id, created_at desc)`, `(tier)`, `(status)`.

RLS: admin-only read (via `is_admin(auth.uid())`); service_role full access. Edge function writes with service role.

## 2. Step catalog (what gets logged inside `generate-diagnostic-questions`)

Run-level
- `run_started` — params: course_id, requested tiers, single-tier flag, deadline_ms, gateway_retries
- `preseed_loaded` — per tier: existing accepted count pulled from bank, ids
- `specs_built` — final per-tier quotas after subtracting preseed
- `run_finished` — totals per tier, overall outcome, duration

Per tier / attempt
- `tier_started` — spec, remaining needed, maxAttempts
- `attempt_started` — attempt #, retry hint, time remaining vs deadline
- `gateway_request` — model, count requested, prompt char length, gateway attempt
- `gateway_response` — http status, ms, request_id (link to `ai_gateway_call_log.id`), parsed candidate count, raw text length; on error: `outcome`, snippet
- `validation_summary` — accepted N / rejected M with breakdown by reason
- `validation_reject` (status=warn) — one row per dropped candidate: `reason` = which rule failed (difficulty band, bloom level, category band, dedupe, missing concept_id, malformed options, etc.), `data` = the candidate JSON excerpt
- `concept_cap_hit` — per-concept quota saturated
- `tier_partial` — accepted < requested after all attempts, with reason summary
- `tier_complete` — accepted == requested
- `tier_skipped` — deadline / credits exhausted, with remaining budget
- `db_replace` — delete count + insert count for that tier
- `deadline_check` (status=warn) — when remaining budget < estimated next call

All existing `console.log/warn/error` paths get a parallel event insert. `updateRunRow` keeps writing the coarse summary; events are additive, not a replacement.

Writes are best-effort (fire-and-forget like `ai_gateway_call_log`); insert failures only `console.warn`, never break the run.

## 3. Admin UI: new tab "Diagnostic Runs"

Add to `AdminLayout` sidebar nav: `Diagnostic Runs → /admin/diagnostics-runs`, icon `Activity`. Page is admin-gated like the other admin routes.

Layout (two panes):

```text
┌─────────────────────────────────────────────────────────────┐
│ Filters: course • tier • status • time range • search       │
├──────────────── Runs list (left) ───────────────────────────┤
│ ▸ 2026-06-14 19:44  course X  hard  failed (incomplete) 0/10│
│ ▸ 2026-06-14 10:00  course X  all   partial  27/40          │
│ ...                                                         │
├──────────────── Run timeline (right, on select) ────────────┤
│ 19:44:13  info  run_started      4 tiers, deadline 130s     │
│ 19:44:13  info  preseed_loaded   easy:6 medium:4 hard:0     │
│ 19:44:14  info  tier_started     hard  needs 10 in 3 atts   │
│ 19:44:14  info  attempt_started  #1 budget 128s             │
│ 19:44:14  info  gateway_request  flash, 15 asked, 9.4KB     │
│ 19:44:31  ok    gateway_response 200 17234ms req=ab12…      │
│ 19:44:31  warn  validation_reject difficulty=medium (band)  │
│ 19:44:31  warn  validation_reject bloom_level=2 < 3         │
│ 19:44:31  info  validation_summary accepted 3 / rejected 12 │
│ ...                                                         │
│ 19:45:58  error tier_partial     0/10 — all attempts under  │
│ 19:45:58  info  run_finished     hard failed, others n/a    │
└─────────────────────────────────────────────────────────────┘
```

Behaviour:
- Runs list: newest first, polls every 15s (like `AiGatewayCallsTab`), shows run_id, course name, tiers, final accepted/requested, error_code, total duration.
- Selecting a run loads its events ordered by `created_at`, grouped collapsibly by tier.
- Each event row shows time, status badge (color-coded), step, one-line message; expandable to show `reason` + pretty-printed `data` + a "View gateway call" link when `gateway_call_id` is set (jumps to existing `AiGatewayCallsTab` row).
- Top-of-page mini-stats: last 24 h run count, success rate, partial rate, avg ms per tier.
- "Copy as JSON" button on a run for support handoff.

## 4. Minimal code touchpoints

- Migration: create `diagnostic_generation_events` with GRANTs + RLS (admin select, service_role all).
- `supabase/functions/generate-diagnostic-questions/index.ts`: add a single `logEvent(ctx, step, {...})` helper sitting next to `updateRunRow`, then call it at the catalog points above (no logic changes).
- `src/pages/admin/AdminDiagnosticRuns.tsx`: new page, paginated list + timeline detail.
- `src/App.tsx` route + `src/layouts/AdminLayout.tsx` nav entry.

## Out of scope

- Editing the generation algorithm itself (covered by the existing hard-tier plan).
- Surfacing the log to teachers — admin-only for now.
- Long-term retention/archival; events stay in the table until we decide a TTL.

## Validation

1. Trigger a tier-only "Regenerate hard" run → admin page shows a new run within 15s with full timeline incl. each rejected candidate's reason.
2. Force a deadline (set tiny deadline locally) → `deadline_check` warn appears before `tier_skipped`.
3. Cause a gateway 429 → `gateway_response` event status=error with linked `ai_gateway_call_log` row.
4. Successful full generation → every tier ends with `tier_complete` + `db_replace` showing insert count == 10.

## Files

- New: `supabase/migrations/<ts>_diagnostic_generation_events.sql`
- New: `src/pages/admin/AdminDiagnosticRuns.tsx`
- Edit: `supabase/functions/generate-diagnostic-questions/index.ts` (add `logEvent` + call sites)
- Edit: `src/App.tsx`, `src/layouts/AdminLayout.tsx` (route + nav)
