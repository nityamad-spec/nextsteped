# Remove careers page links from Companies (student Resources)

## What changes

- Remove the "Careers page" button from the company detail view in Resources → Companies (the only place students see the link; the grid cards don't show it).
- Clear the saved careers URL for all 16 companies in the company library so no stale links remain behind the scenes.
- Leave the admin "Careers page URL" field in place for now — it simply won't show anything to students while empty. (Can remove the field entirely in a later pass if you want.)

## Technical details

- `src/pages/student/StudentResources.tsx`: delete the `c.apply_url` button block (and the now-unused `ExternalLink` import if nothing else uses it).
- Database: `UPDATE resource_companies SET apply_url = NULL;` — data-only change, no schema or policy changes.

## Verification

- Open Resources → Companies on desktop and mobile; confirm no careers button appears on any of the 16 detail pages and the header layout still looks right.
- Typecheck passes.
