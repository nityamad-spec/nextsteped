# Increase Gemini API timeout to 300s across all edge functions

## Goal
Ensure every Gemini / Lovable AI Gateway fetch call in `supabase/functions/*` waits up to 300 seconds before aborting, instead of relying on the platform/runtime default.

## Approach
Native `fetch` has no built-in per-request timeout, so add `signal: AbortSignal.timeout(300_000)` to each gateway fetch call. This is one-line, dependency-free, and consistent across all functions.

## Files to update (19 call sites across 18 functions)
For each `fetch("https://ai.gateway.lovable.dev/v1/chat/completions", { ... })` call, add `signal: AbortSignal.timeout(300_000)` to the options object:

- `supabase/functions/parse-syllabus/index.ts` (1)
- `supabase/functions/suggest-lesson/index.ts` (1)
- `supabase/functions/generate-weekly-quiz/index.ts` (1)
- `supabase/functions/suggest-concepts/index.ts` (1)
- `supabase/functions/explain-answers/index.ts` (1)
- `supabase/functions/quality-check/index.ts` (1)
- `supabase/functions/extract-lesson-plan/index.ts` (1)
- `supabase/functions/extract-youtube-links/index.ts` (1)
- `supabase/functions/regenerate-lesson-plan-week/index.ts` (1)
- `supabase/functions/generate-lesson-plan/index.ts` (3 — lines 251, 401, 632)
- `supabase/functions/generate-exam-questions/index.ts` (1)
- `supabase/functions/generate-teaching-insights/index.ts` (1)
- `supabase/functions/recommend-additional-concepts/index.ts` (1)
- `supabase/functions/generate-diagnostic-questions/index.ts` (1)
- `supabase/functions/generate-practice-questions/index.ts` (1)
- `supabase/functions/chat/index.ts` (1)
- `supabase/functions/classify-question/index.ts` (1)

## Error handling
Where each call is already wrapped in `try/catch`, the existing catch will surface `TimeoutError` / `AbortError` as the function's error response — no behavioral change beyond the longer wait. No new branches needed.

## Out of scope
- Platform-level edge function execution limit (Supabase enforces ~150s wall-clock on many tiers). The 300s client timeout is an upper bound; the function may still be terminated earlier by the platform. Not changing platform config here.
- Frontend `supabase.functions.invoke` timeouts — not requested.
- Retry/backoff logic — not requested.

## Verification
- Build passes.
- Spot-check 2–3 functions to confirm `signal: AbortSignal.timeout(300_000)` is present in the fetch options and no syntax errors.
