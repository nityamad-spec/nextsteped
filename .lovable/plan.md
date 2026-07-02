## Goal
Fix the `generate-question-metadata` timeout by shrinking the LLM workload (Option B), and add a "Regenerate all" mode that overwrites existing values instead of skipping them.

## Edge function changes — `supabase/functions/generate-question-metadata/index.ts`

Keep `google/gemini-2.5-pro`, but reduce time-to-response:
- **Tighter system prompt.** Replace the verbose rubric with a compact one-paragraph instruction.
- **Tighter user prompt.** Remove the long "Rules:" block; keep just the schema + hard length caps.
- **Shorter outputs (hard caps in the prompt):**
  - `bloomJustification`: 1 sentence, ≤ 140 chars
  - `difficultyJustification`: 1 sentence, ≤ 140 chars
  - `explanation`: 2 sentences, ≤ 320 chars
- **Drop derived fields from the model output.** Model returns 6 fields only; `bloomsLevelName` is derived server-side (already the case — keep it).
- **Truncation safety net.** After parsing, hard-truncate the three string fields to the caps above so a chatty model can't blow past the limit.
- **Timeout.** Lower `AbortSignal.timeout` from 120s → 60s (Pro reasoning with a short prompt/output comfortably fits) and return a clean 504 `{ error: "AI request timed out. Please retry." }` on `AbortError` so the UI toast is meaningful instead of a generic 500.

No response-shape change: the function still returns `{ difficulty, bloomsLevel, bloomsLevelName, difficultyEstimate, bloomJustification, difficultyJustification, explanation }`. No new tables, no queue, no client polling.

## Frontend changes — `src/pages/teacher/ExamMode.tsx`

Add a **regenerate-all** mode to the existing Auto-fill affordance in the Add/Edit Question dialog:

- Split the current single button into a small button group inside the same dashed container:
  - **Auto-fill empty** (existing behavior — only fills fields matching the `initialMetaRef` snapshot).
  - **Regenerate all** (new — overwrites all 6 metadata fields regardless of current values).
- Both buttons share the same disabled/tooltip logic (needs question, ≥2 options for MCQ, correct answer) and both show the `Sparkles` + `Loader2` states.
- `handleAutoGenerateMetadata(mode: "fill-empty" | "regenerate-all")`:
  - Calls the same edge function with the same body.
  - `fill-empty` branch: unchanged snapshot-based write.
  - `regenerate-all` branch: writes all 6 fields unconditionally; shows a confirm (`window.confirm` or an `AlertDialog`) before overwriting when any of the 6 fields already have non-empty/non-default values, so a click doesn't silently destroy hand-edited justifications.
  - Toast copy: `"Filled N field(s)"` vs `"Regenerated all 6 fields"`.

No changes to the question schema, DB, or save path — regeneration only updates the in-form state, and the existing Save button persists.

## Verification
- Deploy edge function; `curl_edge_functions` with a sample MCQ; confirm response < 60s, all 6 fields present and within length caps.
- In the Add and Edit dialogs: (1) Auto-fill empty leaves populated fields alone; (2) Regenerate all overwrites after confirm; (3) both buttons disabled with tooltip until inputs are valid.

## Files touched
- `supabase/functions/generate-question-metadata/index.ts` — prompt shrink, length caps, timeout + 504 mapping.
- `src/pages/teacher/ExamMode.tsx` — second button, regenerate-all handler, confirm-on-overwrite.

Awaiting approval before implementing.
