# Compensation view: clear role × company-tier matrix, refreshable from real sources

Rebuild the student Compensation section as a role-by-tier salary matrix in the NextStep light aesthetic, backed by data an admin can refresh on demand from public salary sources.

## What students see

`/student/resources` → Compensation

- A short header: "Fresh-grad compensation, India (LPA)" with the last-updated date and the sources used.
- Three tier columns — Tier-1, Mid-tier, AI-first Startups — each with a one-line example list of companies, in the existing green / amber / violet tier colours already used on company cards.
- One row per role (SDE-1, ML Engineer, AI / Agentic AI, Data Scientist, Applied Scientist to start). Each cell shows:
  - the range, e.g. "45–65 LPA"
  - the midpoint as a small label
  - a light range bar positioned so students can visually compare cells across a row and down a column
  - "Not typical at this tier" where a role doesn't apply
- A plain-language legend explaining that the bar shows where the range sits on a shared 0–100 LPA scale, so bars are actually comparable (the reference image's bars are not).
- Tap/click a cell to expand a short breakdown: base, bonus, equity, plus a note on what pushes a candidate to the top of the range.
- Three highlight cards below (highest ceiling / best balance / fast start), generated from the same data rather than hardcoded.
- Mobile: the matrix collapses to one card per role with three stacked tier rows.

Aesthetic: white/neutral surfaces, existing card and border tokens, tier accent colours only on bars and badges. No dark panels.

## Where the data comes from

Admin Portal → Resources → Compensation gets a **Refresh from sources** button.

On press, a backend job:
1. Searches and reads public fresh-grad salary pages (Levels.fyi, Glassdoor, AmbitionBox, and similar) for each role × tier.
2. Passes what it found to the AI model, which returns a realistic low/high/midpoint plus base, bonus and equity splits per cell, with the source names it relied on.
3. Sanity-checks each cell (low < high, ranges within plausible bounds, tier ordering broadly sensible) and rejects anything that fails instead of writing garbage.
4. Saves the new values with a timestamp and the source list, and keeps the previous version so a bad refresh can be reverted.

Admins can also edit any cell by hand, add or remove roles, and add or rename tiers. Manual edits are preserved and flagged so a later refresh shows "this cell was set manually — replace?".

Professors continue to pick whether the Compensation section appears for their course; students never see stale-looking data without a date on it.

## Technical notes

- New tables: `comp_roles` (title, position, active), `comp_tiers` (key, label, example companies, position), `comp_cells` (role, tier, low/high/mid LPA, base/bonus/equity text, note, `is_manual`, `not_typical`), `comp_refresh_runs` (started/finished, model, sources, status, snapshot of prior cells for revert). All numeric LPA values stored as numbers so bars and midpoints are computed, not typed in.
- Existing `resource_compensation` rows stay in place and are marked deprecated; the picker switches to the new matrix. Nothing is dropped.
- Web research needs a scraping/search service connection (Firecrawl) linked to the project; the refresh job calls it server-side and then `openai/gpt-6-astra` through the AI gateway. Without that connection the refresh button explains what's missing and manual editing still works.
- Refresh is admin-only, rate-limited to a few runs per day, and runs as a single edge function invocation with progress reported back to the admin screen.
- Student page reads the matrix through a new hook with the same caching pattern as `useCourseResources`.

## Out of scope

- Non-India markets and currency switching.
- Experienced-hire (non-fresh-grad) bands.
- Per-company salary detail beyond the existing company cards.
