# Plan: Keep-alive streaming for `generate-weekly-quiz`

## Why
The 504 is `IDLE_TIMEOUT (150s)` from the Edge Runtime, not our in-code 280s budget. The runtime kills any request whose response stream stays silent for 150s. Because the function only writes bytes at the very end, Gemini 2.5 Pro tier generation (~50–60s per call plus retries/backfill) easily exceeds 150s of silence and gets cut. Writing periodic bytes to the response resets the idle clock, so we can use the full request duration (up to ~400s on Pro) without hitting `IDLE_TIMEOUT`.

We keep Gemini 2.5 Pro, the 280s wall-clock budget, and the existing tier/validation/backfill logic — only the response shape changes.

## Scope
- Server: `supabase/functions/generate-weekly-quiz/index.ts` — switch handler to return a streamed `Response` that emits heartbeats during generation and a final result frame.
- Client: the single caller that invokes `generate-weekly-quiz` — read the stream and parse the final frame instead of expecting a plain JSON body.
- No DB, schema, RLS, or shared-validator changes. No model change. No changes to other edge functions.

## Server changes (`supabase/functions/generate-weekly-quiz/index.ts`)

1. Replace the terminal `return new Response(JSON.stringify(payload), ...)` with a `ReadableStream`-based response using **NDJSON** (`application/x-ndjson`):
   - `Content-Type: application/x-ndjson`
   - `Cache-Control: no-cache, no-transform`
   - `X-Accel-Buffering: no` (defensive; discourages any intermediate buffering)
   - Keep existing CORS headers.
2. Frame format — one JSON object per line, `\n`-terminated:
   - `{"type":"heartbeat","t":<ms since start>,"stage":"tier:foundational","note":"..."}`
   - `{"type":"progress","tier":"foundational","have":3,"target":5}` (optional, best-effort)
   - `{"type":"result","payload":<the existing response body>}` — exactly the object we return today
   - `{"type":"error","message":"...","code":"..."}` on failure
3. Heartbeat loop:
   - Start a `setInterval` that writes a heartbeat frame every **20s** (comfortably under 150s).
   - Wrap the existing top-level work in `try/finally` and `clearInterval` in `finally`; also clear before writing the final `result`/`error` frame.
   - Enqueue an initial heartbeat immediately after opening the stream so the first byte lands well before 150s even if Gemini stalls on the first call.
4. Preserve the current 280s wall-clock budget and per-call timeouts (Pro at 50s/60s). The stream simply keeps the connection non-idle while that logic runs unchanged.
5. Errors:
   - Catch inside the stream, emit an `error` frame, then `controller.close()`. HTTP status stays 200 because headers were already flushed — the client uses the frame `type` to detect success/failure.
   - Continue to log server-side via `console.error` as today.
6. OPTIONS/CORS preflight branch is unchanged.

## Client changes

Only one caller invokes this function (the weekly quiz dialog flow). Update it to consume the stream:

1. Stop using `supabase.functions.invoke('generate-weekly-quiz', ...)` for this call (it buffers the whole body). Instead use `fetch` against the function URL built from `import.meta.env.VITE_SUPABASE_URL` + `/functions/v1/generate-weekly-quiz`, with the same `Authorization: Bearer <session access_token>` and `apikey` headers `invoke` would send.
2. Read `response.body` as a stream:
   - `const reader = response.body!.getReader();`
   - Decode with `TextDecoder`, split on `\n`, JSON-parse each non-empty line.
   - Ignore `heartbeat` / `progress` frames (optionally surface progress in the existing loading UI — nice-to-have, not required).
   - On `result` frame → resolve with `frame.payload` (same shape the caller uses today).
   - On `error` frame → throw with `frame.message` so existing error toasts still fire.
   - If the stream closes without a `result` or `error` frame → throw a generic "quiz generation was interrupted" error.
3. Keep the caller's outer try/catch and toast behavior; only the transport changes.

## Validation
1. Trigger a weekly quiz generation from the student UI on a course that previously hit `IDLE_TIMEOUT`. Confirm no 504 and that the final quiz payload matches the pre-change shape.
2. Tail edge logs for `generate-weekly-quiz` and confirm heartbeats are logged (or at least that the function runs past 150s when needed).
3. Force a synthetic failure (e.g., temporarily throw inside a tier) and confirm the client surfaces the error toast from the `error` frame.

## Out of scope
- Async job queue + polling (option B).
- Reducing model quality or per-call timeouts (option C).
- Changing tier composition, validators, dedup, or backfill logic.
- Any other edge function.

## Technical notes
- NDJSON is chosen over SSE because we don't need event types/reconnect semantics and NDJSON is trivial to parse with `TextDecoder` + `split('\n')`. Either works; NDJSON is the smaller change.
- 20s heartbeat interval leaves a ~7× safety margin under the 150s idle limit even if one write is delayed by GC or a slow Gemini socket.
- `supabase.functions.invoke` buffers the full response before resolving, which would re-introduce the idle problem on the client side — that's why we switch this one call to `fetch`. All other callers of other functions are unaffected.
