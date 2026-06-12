# Track AI Gateway call statuses on /admin/setup-debug

Today the page only shows `setup_progress_log` (success/failure of `markStep*` writes). We will add a second telemetry stream for outbound calls to `ai.gateway.lovable.dev` so admins can see non-200 responses (429/5xx/timeout/abort) alongside the existing setup writes.

## 1. New table: `ai_gateway_call_log`

Columns:
- `id uuid pk`
- `created_at timestamptz default now()`
- `function_name text` — e.g. `generate-diagnostic-questions`
- `model text` — e.g. `google/gemini-2.5-flash`
- `purpose text` — short label set by caller (e.g. `tier:standard`, `week:3`, `classify`)
- `http_status int` — null on network/timeout/abort
- `outcome text` — `ok` | `retryable` (429/5xx) | `client_error` (4xx) | `timeout` | `network_error` | `aborted`
- `attempt int`, `total_attempts int`
- `duration_ms int`
- `request_id text` — correlate retries within one user request
- `teacher_id uuid null`, `course_id uuid null` — best-effort from JWT/body
- `error_code text null`, `error_message text null` (first ~500 chars of upstream body)
- `context jsonb default '{}'` — tier, week, prompt tokens estimate, etc.

Indexes: `(created_at desc)`, `(function_name, created_at desc)`, partial `(created_at desc) where outcome <> 'ok'`.

RLS:
- Insert: `authenticated` and `service_role` (edge functions write with service role).
- Select: admins only via `public.is_admin(auth.uid())`.
- GRANTs: `INSERT` to `authenticated`, `ALL` to `service_role`, `SELECT` to `authenticated` (gated by RLS).

## 2. Shared logger for edge functions

Create `supabase/functions/_shared/aiGatewayLog.ts` exporting:

```ts
loggedGatewayFetch({
  functionName, model, purpose, requestId, teacherId?, courseId?,
  attempt, totalAttempts, body, timeoutMs, context?
}) → Promise<Response>
```

Responsibilities:
- Wrap the existing `fetch("https://ai.gateway.lovable.dev/...")` call.
- Measure `duration_ms`, classify outcome from status / `AbortError` / network error.
- Insert one row into `ai_gateway_call_log` via a service-role Supabase client (fire-and-forget, never blocks the response — wrap in `try/catch` and `EdgeRuntime.waitUntil` if available).
- Return the original `Response` (or rethrow) so caller logic is unchanged.

## 3. Instrument the high-value callers first

Wire `loggedGatewayFetch` into the functions where 4xx/5xx/timeouts have been biting us:
- `generate-diagnostic-questions` (per tier × attempt)
- `generate-lesson-plan`, `regenerate-lesson-plan-week`
- `generate-exam-questions`, `generate-weekly-quiz`, `generate-practice-questions`
- `classify-question`, `explain-answers`, `quality-check`, `parse-syllabus`
- `chat`, `suggest-concepts`, `suggest-lesson`, `recommend-additional-concepts`, `score-diagnostic`, `generate-teaching-insights`, `extract-lesson-plan`, `extract-youtube-links`

Each call site passes a stable `requestId` (one per inbound request) and a `purpose` tag so retries collapse visually.

## 4. UI changes in `src/pages/admin/AdminSetupDebug.tsx`

Add a third tab **"AI Gateway Calls"** next to the existing two. No changes to existing tabs.

Top strip (last 24h, computed from query):
- counters: OK, 4xx, 5xx/429, timeout, network/aborted
- avg + p95 latency per function (small table)

Main table columns:
`Time · Function · Model · Purpose · Attempt (n/N) · Status · Outcome (badge) · ms · Request · Teacher · Course · Error`

Filters:
- text filter (function / purpose / request_id / teacher / course / error)
- outcome multi-select (OK / retryable / client_error / timeout / network / aborted)
- function dropdown (distinct values from results)
- "Non-200 only" toggle
- time range: 1h / 24h / 7d

Expandable row reveals: full upstream error message, `context` JSON, and all sibling attempts that share the same `request_id` (so a 504 followed by a successful retry is visible as one group).

Auto-refresh every 15s (pausable) and a manual Refresh button matching the existing style.

## 5. Out of scope (call out, do not build now)

- No alerting/webhooks.
- No per-user dashboards — admin-only.
- No retention job yet; we'll revisit once volume is known. Suggest a follow-up to add a daily prune (>30 days) if rows grow large.

## Technical notes

- The logger must never throw into the caller; logging failures only `console.error`.
- `error_message` is truncated to 500 chars to keep rows small.
- `outcome` is derived in the logger, not the caller, so classification stays consistent.
- Reuse the existing `corsHeaders` / Supabase service client pattern from other functions; do not edit `src/integrations/supabase/client.ts`.
- No changes to `setup_progress_log` schema, so the existing tabs keep working unchanged.
