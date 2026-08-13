# "What's new" box on Student Home

Add a new section above "What to do today" on `/student/home` that lets a student generate today's news related to their course concepts, with real, linked articles.

## What the student sees

- A card titled **What's new**, sitting directly above "What to do today".
- Subtitle: today's date and the course name.
- A **Generate today's news** button. Before clicking, an empty state explains what it does.
- After clicking: a loading state, then 4-6 news cards, each with
  - headline
  - 2-line summary
  - the course concept it relates to (badge)
  - "Read more" link opening the source in a new tab
  - source name and publish date when available
- A **Refresh** button to regenerate; errors (rate limit, no credits, no results) show inline with a retry option.
- No caching: each click generates fresh results for that student.

## Scope of concepts

The whole course: all concept names for the enrolled course (already loaded on Home) plus the course name are sent as context.

## How it works

1. New edge function `course-news`:
   - Validates the caller's JWT and confirms they are enrolled in the requested course.
   - Loads the course name and its concepts from the database (server-side, not trusted from the client).
   - Runs a small number of web searches (built from the course name + a rotating subset of concepts, restricted to recent results).
   - Passes the search results to the Lovable AI gateway model, which selects and summarises 4-6 items and tags each with the closest course concept, returning strict structured JSON (`headline`, `summary`, `concept`, `url`, `source`, `published_at`).
   - Drops any item whose URL is not present in the search results, so links are real.
   - Logs the gateway call through `_shared/ai-log.ts`, like other functions.
2. New component `src/components/student/WhatsNewCard.tsx` handling button, loading, error, and result rendering.
3. `StudentHome.tsx` renders it above the "What to do today" block, passing `enrolledCourseId`.

No database tables or migrations are needed (results are not stored).

## Technical notes

- **Web search dependency**: real linked news requires a search provider. The plan uses the **Firecrawl** connector's search endpoint (time-filtered to the last day/week) as the source of URLs, then the existing AI gateway for summarisation. Firecrawl must be connected before this works; I will prompt to connect it during implementation.
- Model: existing default gateway chat model with strict JSON output, same pattern as other generators.
- Because there is no cache, every click costs a search + a model call. Client-side guard: disable the button while in flight.
- Course news is unrelated to progress/readiness logic; nothing existing is modified beyond adding the section.

## Verification

- Typecheck.
- Browser check on `/student/home`: card renders above "What to do today", generates items, links open externally, error path shows a retry.
