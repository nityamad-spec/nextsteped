## Goal
Create a temporary diagnostic edge function `test-cloud-run` to probe outbound connectivity from Lovable's edge runtime to a Google Cloud Run service. No frontend wiring, no other files touched.

## What to build

New file: `supabase/functions/test-cloud-run/index.ts`

Behavior:
1. Handle `OPTIONS` preflight with CORS headers (Allow-Origin `*`, Allow-Headers including `authorization, content-type, apikey, x-client-info`, Allow-Methods `POST, OPTIONS`).
2. On any other method, POST to `https://hello-test-634516262946.asia-south2.run.app` with:
   - Header: `Content-Type: application/json`
   - Body: `{"name":"NextStep"}`
   - `AbortSignal.timeout(30_000)` to avoid hanging.
3. Read the response body as text (raw, unparsed).
4. Return JSON: `{ ok: true, status: <number>, statusText: <string>, body: <string> }` with HTTP 200 (so the outer invoke succeeds regardless of upstream status — the caller inspects `status`).
5. Wrap in try/catch. On throw, return `{ ok: false, error: <err.message>, name: <err.name> }` with HTTP 200 for the same reason — distinguishes "call never went out" from "call rejected".
6. Include CORS headers on every response, including errors.

## Not doing
- No `supabase/config.toml` edits (default `verify_jwt = false` is fine for a diagnostic).
- No frontend invocation, no UI, no types changes.
- No schema changes, no secrets.

## Technical notes
- Deno `serve` from `https://deno.land/std@0.168.0/http/server.ts` to match the rest of the project's functions.
- Inline `corsHeaders` const (matches existing project style).
