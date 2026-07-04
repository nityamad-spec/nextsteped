## Goal

Add a "Import from Google Sheet" section directly below the "Add emails manually" textarea on `/teacher/setup/enrollment`. The teacher pastes a Google Sheets **Publish-to-web CSV** URL, clicks Import, and every valid, non-duplicate email from the `email` column is added to the approved roster. A progress bar reflects the fetch → parse → upsert stages.

## UX

New card block inside the existing Student Enrollment card, right under the manual-add textarea:

- Label: "Import from Google Sheet"
- Helper text explaining the required flow: **File → Share → Publish to web → CSV → copy link**. Include a small "How do I get this link?" collapsible with 3 numbered steps.
- Text input for the URL, with inline validation state (idle / valid / invalid) and an error message under the field.
- "Import emails" button — disabled until URL passes client-side validation.
- While running: progress bar (0–100%) with stage label ("Fetching sheet…", "Parsing rows…", "Adding to roster…"), and a live counter ("Processed X of Y").
- On completion: toast summary — `Added N, skipped M duplicates, S invalid, F already-on-roster` — and the input clears.

Nothing is persisted about the URL itself (one-off import per confirmed decision).

## URL validation (client-side, before submit)

Accept only URLs that clearly look like a published-to-web Google Sheets CSV. A URL is considered valid when **all** are true:

1. Parses as a `URL`.
2. Host is `docs.google.com`.
3. Path starts with `/spreadsheets/`.
4. Either:
   - Path contains `/pub` (published-to-web variant), **and**
   - Query has `output=csv` or `single=true`+`output=csv`.
   - OR path ends with `/export` and query has `format=csv` (accepted as a fallback shape).

Anything else (edit URLs, view URLs, non-Google links, missing `output=csv`) gets rejected with a clear error message telling the teacher exactly what shape is expected and pointing to the collapsible instructions. This rejection is intentional — we do NOT try to silently rewrite `/edit` URLs to `/export?format=csv` because that only works for sheets shared with "Anyone with link", and failing later with a CORS/403 is a worse UX than rejecting up front.

## Fetch + parse

- `fetch(url, { redirect: "follow" })` from the browser. Published-CSV endpoints are CORS-open, so no edge function is required.
- Hard limits before parsing:
  - Response `Content-Length` (when present) > 5 MB → abort with error.
  - Response body > 5 MB after read → abort with error.
- Parse CSV with a tiny inline parser (same style as the existing `parseCsv`) — quoted fields supported. No new dependency.
- Header row is required. Locate the column whose header (trim + lowercase) equals `email`, `email_address`, or `e-mail`. If not found → error: "No `email` column found in the sheet."
- Extract email from that column only (per your "Email only" decision). Ignore all other columns.
- **Row cap: 5,000.** If the sheet has more, we import the first 5,000 and warn in the summary toast ("Sheet has more than 5,000 rows — only the first 5,000 were imported").

## Dedup + validation

For each extracted email:
- Trim, lowercase.
- Skip empty.
- Reject if it fails the existing `EMAIL_RE` regex → counted as `invalid`.
- Skip within-batch duplicates → counted as `duplicate`.
- Skip if already present in the currently loaded `roster` (same check the manual flow uses) → counted as `already-on-roster`.
- Remaining set → upsert into `course_roster_allowlist` in batches of 500 with `onConflict: "course_id,email"` and `source: "google_sheet"` (new source label — no schema change; the column is free-form text today).

## Progress bar

Three weighted stages driving a single 0–100 value:
- Fetch: 0 → 25
- Parse + validate: 25 → 40
- Upsert batches: 40 → 100, advanced per batch by `(i / totalBatches)`.

Uses the existing `Progress` shadcn component.

## Files touched

- `src/pages/teacher/EnrollmentSettings.tsx` — add the new URL input block, validation, fetch/parse logic, progress state, and result summary. Reuses `EMAIL_RE`, `roster`, `loadRoster()`, and `effectiveCourseId`.

No new files, no edge functions, no migrations, no new dependencies.

## Risks

1. **Teacher pastes the wrong URL shape (biggest risk).** A regular `/edit` link will fail CORS in the browser. Mitigation: strict client-side validation up front + explicit "publish to web" instructions. We refuse to attempt fetches on non-`/pub` URLs so the teacher gets an immediate, clear error instead of a confusing CORS failure in devtools.
2. **Published-to-web CSV is publicly readable by anyone with the URL.** This is a Google decision — anyone who obtains the URL can see the roster. We should surface this in the helper text so the teacher understands the tradeoff and knows they can unpublish after import.
3. **Google's CSV caches for ~5 minutes.** If a teacher edits the sheet then imports immediately, they might see stale rows. Documented in the helper text.
4. **Column detection is header-dependent.** If the sheet has no header or the header is spelled differently (e.g. "E-Mail Address"), import fails with "No email column found". Mitigation: accept the three common spellings above; error message tells the teacher to rename their column to `email`.
5. **Large sheets.** Row cap 5,000 and body cap 5 MB prevent runaway imports and browser hangs. Batches of 500 keep each upsert small.
6. **CSV quoting edge cases.** Emails don't normally contain commas/quotes, but the parser handles quoted fields to be safe.
7. **Race with roster reload.** Duplicate check uses the in-memory `roster` at click time; if two teachers on the same course import simultaneously, the DB `onConflict` upsert still prevents duplicates — the local counter may just under-report the "already on roster" number. Acceptable.
8. **Failed partial upsert.** If one batch fails mid-way, earlier batches are already committed. Toast reports success count + error; teacher can safely re-run (upsert is idempotent).
9. **No audit of source URL.** Because we don't persist the URL, there's no record of where a given roster entry came from beyond `source: "google_sheet"`. Fine for one-off imports per your decision.

## Not doing (explicitly out of scope for this plan)

- Saving the URL for re-sync.
- Reading name/university columns.
- Any server-side (edge function) fetch or scheduled sync.
- Google OAuth or Google Sheets API integration.

## Verification

1. Publish a small sheet with an `email` column containing valid, invalid, and duplicate rows → paste CSV URL → confirm progress bar animates, toast reports correct counts, roster list refreshes with only the valid new emails.
2. Paste an `/edit` URL → confirm client-side rejection with the "publish to web" instructions, no network call fired.
3. Paste a non-Google URL → rejected immediately.
4. Publish a sheet where the header column is `Name,Score` (no email column) → import fails with "No email column found".
5. Re-run the same import → confirm all rows counted as `already-on-roster`, no duplicates in DB.

## Questions still open

None from the previous round — all four decisions locked. Ready to implement on approval.
