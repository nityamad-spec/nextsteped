## Goal
Make admin prompt edits take effect on the very next edge-function invocation, with no cold-start dependency.

## Change
Edit `supabase/functions/_shared/resolvePrompt.ts`:

- Delete the module-level `cache` and `inflight` variables.
- On every `resolvePrompt(...)` call, run `loadOverrides()` directly, look up the `(function_name, stage)` key, fall back to `defaultPrompt`, then interpolate.
- Keep the existing try/catch so any DB error falls back to the default prompt (current behavior preserved).
- Keep the `{{placeholder}}` interpolation untouched.

## Cost / behavior
- One extra `select function_name, stage, prompt from edge_function_prompt_overrides` per AI edge-function call. Table is tiny (one row per overridden function/stage, admin-only writes) and hit by service role, so latency is negligible.
- No schema change, no UI change, no change to `set-prompt-override` or `list-prompt-overrides`.

## Deploy
After the edit, redeploy every function that imports `resolvePrompt` so the new shared module ships:
`classify-question`, `explain-answers`, `extract-youtube-links`, `generate-diagnostic-questions`, `generate-lesson-plan`, `parse-syllabus`, `recommend-additional-concepts`, `regenerate-lesson-plan-week`, `suggest-concepts`, `suggest-lesson`.

## Verify
1. In Admin → AI Setup, edit a prompt (e.g. `classify-question`) to include a recognizable marker string, save.
2. Trigger that function from the app.
3. Check `supabase--edge_function_logs` for `classify-question` and confirm the marker appears in the system prompt / behavior — no redeploy or wait required.
