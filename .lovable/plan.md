# Fix: broken article links in Lesson Plan

## Root cause

In `supabase/functions/generate-lesson-plan/index.ts` (and the per-week variant `regenerate-lesson-plan-week/index.ts`), the LLM (Gemini 2.5 pro) is asked to author `resources[]` of type `article` with a `url` field. The prompt says:

> "Articles must be REAL, well-known, freely accessible … with working https URLs. If you are not certain a URL exists, OMIT the url field rather than inventing one."

In practice LLMs do not reliably comply — they confidently fabricate plausible-looking URLs (e.g. `realpython.com/some-article-that-doesnt-exist/`, deep links to docs pages that have moved, or guessed slugs). The output is then stored verbatim in `lesson_plan_weeks.resources` and rendered as a clickable link in `CourseCreation.tsx`, so the user sees a 404 / "page not found" when clicking. No URL validation happens anywhere in the pipeline.

Prompt-only mitigations are unreliable; the fix must verify the URL actually resolves before we hand it to the user.

## Plan

Add a lightweight URL validator that runs after the LLM returns and before we shape the response. For every `article` resource with a `url`:

1. Send a `HEAD` request (fallback to a ranged `GET` for hosts that 405 on HEAD, e.g. some docs.python.org mirrors).
2. Apply a short timeout (~4s per URL) and run all checks concurrently with `Promise.allSettled`.
3. Accept only `2xx` (and follow redirects — accept the final URL). Reject `4xx/5xx`, network errors, and non-https schemes.
4. On rejection: keep the resource, but strip the `url` field so the UI renders just the title + description (no broken link). Log the dropped URL.
5. Additionally tighten the prompt to prefer linking to stable index/landing pages (e.g. `https://docs.python.org/3/tutorial/`, `https://realpython.com/`, `https://developer.mozilla.org/en-US/docs/Web/JavaScript`) rather than guessing deep article slugs.

Apply the same validator in both functions so regenerating a single week gets the same protection.

## Files touched

- `supabase/functions/generate-lesson-plan/index.ts` — add `validateUrls()` helper; call inside `capResources` (or right before it) for each week's resources; tweak the article instruction in the system prompt.
- `supabase/functions/regenerate-lesson-plan-week/index.ts` — import/duplicate the same helper; call before building the response.

## Out of scope

- No DB schema changes; existing rows with broken URLs stay until the user regenerates that week (which they already can via the per-week regenerate button).
- No client-side changes — the renderer already handles resources without a `url` (renders plain text).
- No background re-validation job for already-saved weeks.
- No change to `coding-exercise` resources (those don't carry URLs in current output).

## Technical notes

- Run validation with `AbortSignal.timeout(4000)` per URL; total added latency bounded to ~4s since checks run in parallel per week.
- Use `redirect: "follow"` and accept `response.ok`. For HEAD-405 responses, retry once with `method: "GET"` and `Range: bytes=0-0`.
- Only validate `https://` URLs; anything else is stripped immediately.
- Keep behavior conservative: on any thrown error (DNS, TLS, timeout), strip the URL rather than failing the whole generation.
