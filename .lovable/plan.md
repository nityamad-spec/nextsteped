## Goal

Replace the time-based fake step indicator (`setInterval` bumping `genStep` every 8s) with **real progress events** streamed from the `generate-lesson-plan` edge function, so the UI reflects what the backend is actually doing.

## Approach: SSE (Server-Sent Events) from the edge function

Edge functions support streaming `Response` bodies. We'll emit newline-delimited JSON progress events over a `text/event-stream`-style stream. The client reads the stream incrementally with `fetch` (not `supabase.functions.invoke`, which buffers).

### Backend: `supabase/functions/generate-lesson-plan/index.ts`

1. **Wrap the handler in a `ReadableStream`** instead of returning a single JSON `Response`.
2. **Add an `emit(event)` helper** that enqueues `data: ${JSON.stringify(event)}\n\n` to the stream controller.
3. **Instrument each pipeline phase** with progress events:
   - `{ type: "phase", step: "load", message: "Loading approved concepts…" }`
   - `{ type: "phase", step: "estimate", message: "Estimating concept complexity…" }` (before LLM A)
   - `{ type: "phase", step: "allocate", message: "Distributing concepts across weeks…" }`
   - `{ type: "phase", step: "author", message: "Authoring weekly themes & resources…" }` (before LLM B)
   - `{ type: "phase", step: "validate", message: "Verifying coverage & deduping…" }`
   - `{ type: "log", level: "info", message: "Allocator placed 23 concepts across 12 weeks" }` (granular logs, optional)
   - `{ type: "warning", message: "..." }` for each validator warning
   - `{ type: "done", payload: { weeks, overall_course_learning_outcomes, meta } }` final event
   - `{ type: "error", message, code? }` on failure
4. **Heartbeat**: emit a `{ type: "heartbeat" }` every ~15s during long LLM calls so connection-level timeouts don't kill the stream and the UI knows we're alive.
5. **Response headers**: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, plus existing CORS headers.
6. **Auth**: keep existing JWT validation; just do it before opening the stream.

Existing logic (allocator, validator, LLM calls) is **not changed structurally** — we only add `emit(...)` calls between phases.

### Frontend: `src/pages/teacher/CourseCreation.tsx`

1. **Replace `supabase.functions.invoke` call in `runGeneration`** with a direct `fetch` to the function URL using `import.meta.env.VITE_SUPABASE_URL` + the user's session access token (from `supabase.auth.getSession()`).
2. **Stream parser**: read `response.body.getReader()`, decode chunks, split on `\n\n`, parse `data: {...}` lines.
3. **Drive UI from real events**:
   - Maintain `genPhase: "load" | "estimate" | "allocate" | "author" | "validate" | "done"` state.
   - Maintain `genLogs: { ts, message, level }[]` for an optional collapsible log panel.
   - Remove the `setInterval` fake step bumper; keep the 1s elapsed timer for the "Elapsed" text.
   - On `done`, hydrate weeks exactly like today.
   - On `error`, set `genError` and stop.
4. **Update `genSteps` array** to 5 entries matching the backend phases, so the visual checklist mirrors reality.
5. **Add a "Live activity" collapsible** under the step list showing the last ~10 log/warning messages (small muted text), so the user sees motion even mid-phase.
6. **Keep heartbeat handling**: just resets a "stalled" timer; if no event for ~30s after last heartbeat, show "Connection slow…" hint (non-fatal).

### Why SSE-style streaming (not WebSocket / polling)

- Edge functions natively support streamed `Response` bodies — zero infra changes.
- One open connection, no DB writes, no extra table.
- Survives the 150s idle timeout because **bytes flowing on the response count as activity** (the timeout is for *idle* connections).

### Out of scope

- `regenerate-lesson-plan-week` (much faster, single LLM call — not worth streaming yet).
- Persisting progress to a DB table for resume-after-refresh (would need a separate job-queue design).
- Changing the underlying generation logic, models, or validator behavior.

## Files to edit

- `supabase/functions/generate-lesson-plan/index.ts` — wrap in `ReadableStream`, add `emit()` calls at each phase, add heartbeat, switch response to event stream.
- `src/pages/teacher/CourseCreation.tsx` — swap `invoke` for streaming `fetch`, parse events, drive `genPhase` + `genLogs` from real events, update `genSteps` to 5 phases, add live-activity panel.

## Acceptance

- Opening the generate flow shows phase transitions in real time (no more 8-second fake jumps).
- A live activity feed shows allocator counts and validator warnings as they happen.
- If the function errors mid-pipeline, the UI shows the actual failing phase + message instead of a generic "Generation failed" after 150s.
- No 504/idle-timeout under normal load because the stream emits at least every ~15s.
