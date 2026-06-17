## Problem

In `/teacher/setup/lesson-plan`, articles under "Industry-Relevant Exercise & Suggested Articles" frequently 404. Today, `generate-lesson-plan` asks Gemini to *invent* article URLs from memory, then runs a light `HEAD`/`GET` check (`sanitizeResourceUrls`). The LLM hallucinates plausible-looking deep links, and the verifier misses "soft 404s" — pages that return HTTP 200 but render a "404. That's an error." body (common on Google/Medium/legacy blogs).

## Fix

Stop asking the LLM to invent URLs. Instead, retrieve real article URLs via web search per concept, then verify them harder before persisting.

### 1. Replace AI-invented URLs with real search results

In `supabase/functions/generate-lesson-plan/index.ts` (Step 3 — author):

- Remove the `url` field from the author LLM's `resources` schema. The LLM only produces `title` + `description` candidates (and ideally a 2–4 word search query) per article slot.
- After authoring, for each week with `article` resources, call a new `searchArticleUrl(query, conceptName)` helper that uses the **Firecrawl connector** (`/v2/search`, `limit: 5`, `tbs: 'qdr:y'` to bias toward last-year results) to fetch candidate URLs.
- Prefer results from an allowlist of high-trust, stable domains: `jstor.org`, `arxiv.org`, `plato.stanford.edu`, `nature.com`, `ssrn.com`, `ourworldindata.org`, `technologyreview.com`, `quantamagazine.org`, `ocw.mit.edu`, `news.mit.edu`, `nptel.ac.in`, `reuters.com`,`medium.com` (only if it resolves), `apnews.com`, `bbc.com`, `economist.com`,`ft.com`,`bloomberg.com`, `theguardian.com`,`npr.org`, `nytimes.com`,`wsj.com`. Skip any result outside the allowlist unless nothing else qualifies.
- Gating: only enable the search path when a `FIRECRAWL_API_KEY` connector secret exists. If absent, fall back to current behavior but force `url` to be omitted (title-only article cards) so we never ship invented links.

### 2. Harden `verifyUrl` against soft-404s

In the same file, upgrade `verifyUrl`:

- Always do a `GET` with `Range: bytes=0-2048` plus a real browser `User-Agent`; drop the HEAD-first shortcut.
- After fetch, inspect the first ~2KB of HTML for soft-404 markers: `<title>` containing `404`, `Page not found`, `That's an error`, `Sorry, we couldn't find`, or a `<meta name="robots" content="noindex">` on suspicious paths.
- Treat redirects to a domain's root (`/`) or `/404`, `/not-found` paths as failures.
- Reject non-HTML content-types unless they're `application/pdf` (allowed).
- Bump the timeout to 6s and run checks with concurrency 4 to stay under edge-function limits.

### 3. Drop the whole article card when its URL fails

Currently `sanitizeResourceUrls` only deletes the `url` field, leaving the student-facing card with a useless title. Change behavior: if an `article` resource fails verification AND we have no replacement from search, drop the entire resource from the array. Keep coding-exercise resources (they're usually offline activities, not links).

### 4. Connector setup

Firecrawl is the project's default scraping/search connector. Before the code change ships:

- Use `standard_connectors--connect` with `firecrawl` so `FIRECRAWL_API_KEY` is injected into edge functions.
- Document a `LESSON_PLAN_LINK_ALLOWLIST` constant inside `generate-lesson-plan/index.ts` (no new secret needed).

### 5. UI safety net

No required changes in `CourseCreation.tsx`, but confirm the renderer skips article entries without a `url` and without a meaningful title rather than rendering a dead heading. Add a small fallback: if a week ends up with zero `article` resources after sanitization, show a single italic line ("No verified article available yet — add your own under Edit") instead of an empty section.

## Files touched

- `supabase/functions/generate-lesson-plan/index.ts` — author prompt/schema (drop `url`), new `searchArticleUrl` helper, upgraded `verifyUrl`, updated `sanitizeResourceUrls` to drop dead articles, allowlist constant.
- `src/pages/teacher/CourseCreation.tsx` — small renderer guard + empty-state fallback for the articles section.
- Connector link: Firecrawl (no code, done via `standard_connectors--connect`).

## Out of scope

- Re-generating links for already-saved lesson plans. The fix applies on next "Generate Lesson Plan" / "Update Plan" click. We can offer a one-click "Re-verify links" action later if you want.
- Replacing the author LLM with a research agent — kept the same 3-step pipeline.