## Root cause

The 95% ceiling is **not** the edge function stalling — it is a hardcoded cap in the client-side progress simulation.

In `src/pages/teacher/DiagnosticQuestionsSetup.tsx`:

- **L61** `ESTIMATED_SECONDS = 75` — a guessed total runtime.
- **L73-81** `tierStatus()` ramps each tier through "Generating → Validating → Finalizing" purely from `elapsed` time. Once `elapsed >= ESTIMATED_SECONDS` it returns the literal `{ label: "Waiting for server…", pct: 95 }`.
- **L83** `overallPct = Math.min(95, (elapsed / ESTIMATED_SECONDS) * 95)` — overall bar is also capped at 95%.
- The component only flips to 100% when `supabase.functions.invoke(...)` resolves (L124) and `setGenerating(false)` runs.

So whenever the edge function takes longer than 75s — which is almost always, because Gemini 2.5 Pro with 4 parallel tiers + retries + DB writes commonly takes 90-130s — **every** tier bar snaps to 95% at the same instant and parks there until the server replies. The bars carry no information about real server progress; they're a stopwatch dressed up as a progress bar.

The screenshot (96s elapsed, "~0s remaining", all 4 tiers at 95%) is exactly the expected output of this simulation, not a server bug.

## Goal

Make the progress bars reflect what the server is actually doing, or at minimum stop lying once the simulation runs out.

## Options (pick one — I recommend B)

**Option A — Honest simulation (smallest change, ~20 LOC)**
- Remove the 95% cap. After `ESTIMATED_SECONDS`, keep ramping slowly (e.g. logistic curve toward 99%) and change the label from "Waiting for server…" to "Still working — tiers run up to ~130s".
- Keep per-tier bars but mark them all "In progress" rather than fake phase transitions.
- Pros: zero backend work. Cons: still fake.

**Option B — Real progress via a status table + polling (recommended)**
- New table `diagnostic_generation_runs(course_id, run_id, tier, status, accepted, requested, attempts, updated_at)` with RLS scoped to course members.
- `generate-diagnostic-questions` writes one row per tier at start, then UPDATEs `status`/`accepted`/`attempts` at each lifecycle event inside `runTier` (start → gateway_call → validating → done/failed).
- Client subscribes (Supabase Realtime) or polls every 2s on the run's rows and computes each tier's `pct` from real state (`accepted/requested`).
- Overall bar = mean of tier pcts.
- Pros: actual truth; surfaces stuck tiers and 402s immediately; reusable for future long-running generation. Cons: ~80 LOC server + small migration + ~40 LOC client.

**Option C — Streaming response (medium)**
- Switch the edge function to a streamed SSE/NDJSON response that pushes `{tier, status, accepted}` events; client reads the stream via `fetch` + `getReader`.
- Pros: no extra table. Cons: `supabase.functions.invoke` doesn't expose the stream — must switch to raw `fetch` with the anon key + auth header; harder to reason about with the existing AbortController/credits-exhausted path we just added.

## Recommended plan (Option B)

### Migration
```sql
CREATE TABLE public.diagnostic_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  tier text NOT NULL CHECK (tier IN ('standard','easy','medium','hard')),
  status text NOT NULL CHECK (status IN ('pending','calling_model','validating','done','failed','skipped')),
  requested int NOT NULL DEFAULT 0,
  accepted int NOT NULL DEFAULT 0,
  attempts int NOT NULL DEFAULT 0,
  error_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, tier)
);
GRANT SELECT ON public.diagnostic_generation_runs TO authenticated;
GRANT ALL ON public.diagnostic_generation_runs TO service_role;
ALTER TABLE public.diagnostic_generation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "course members read runs"
  ON public.diagnostic_generation_runs FOR SELECT TO authenticated
  USING (public.is_course_member(course_id, auth.uid()));
```

### Edge function (`generate-diagnostic-questions/index.ts`)
- Generate `runId = crypto.randomUUID()` at request entry; return it immediately in the JSON response and also include it in the initial seed rows.
- Before launching tiers: `INSERT` 4 rows `(run_id, course_id, tier, status='pending', requested=<quota>)`.
- Inside `runTier`, after each lifecycle transition, `UPDATE` the row (`status='calling_model'` → `'validating'` → `'done'`, plus `accepted` and `attempts`).
- On `CreditsExhaustedError`: mark all non-done rows as `failed` with `error_code='credits_exhausted'`.
- On `DeadlineExceededError`: mark remaining as `skipped`.

### Client (`DiagnosticQuestionsSetup.tsx`)
- Remove `tierStatus`, `overallPct`, and `ESTIMATED_SECONDS`.
- When user clicks Generate: call the edge function but **don't await** the body for progress — instead, immediately subscribe to `diagnostic_generation_runs` filtered by `course_id` (latest run_id wins) and render each tier's bar from real `(accepted/requested)*100` plus a status label.
- When the invoke promise resolves (success, partial 422, or 402), do the existing toast/refetch logic.
- Keep the existing 130s deadline; tiers that come back `failed/skipped` render in red rather than parked at 95%.

### Net effect
- Bars move when real work happens, not on a stopwatch.
- A stuck tier shows itself (status stays `calling_model` for >35s → user can see which tier is the problem).
- 402 / deadline / partial-success states are reflected in the bars, not just the toast.

---

Pick **A**, **B**, or **C** and I'll implement.