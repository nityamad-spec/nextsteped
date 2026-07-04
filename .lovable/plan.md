## Goal

Add a "Save & Sync" flow for the Google Sheet URL on `/teacher/setup/enrollment`. The URL is persisted per course, and a **Sync now** button re-runs the import on demand. No cron, no background jobs — sync runs only when the teacher clicks the button (per your decision to keep server load low). Behavior is additive-only: nothing is ever deleted from the roster by sync.

## UX

The existing "Import from Google Sheet" block gets three small additions:

- Next to the URL input: a **Save URL** button that persists the URL on the course (validated with the same rules as today).
- Once a URL is saved, the input shows the saved value and a small "Saved" chip. Editing + clicking Save updates it. A **Clear saved URL** link removes it.
- Primary action becomes **Sync now** (replaces today's "Import emails" when a URL is saved). It re-runs the exact same import pipeline against the saved URL.
- The one-off "paste and import without saving" flow is preserved as a secondary link ("Import once without saving") so nothing regresses.

No status row, no last-synced timestamp, no error surface in the UI — per your "silent, logs only" decision. Toasts still fire on manual clicks (they're user-initiated, not background), so the teacher sees the result of their own click.

## Data model

One new column on `courses`:

- `roster_sync_sheet_url text` — nullable. Stores the validated CSV URL. No `enabled` flag, no `last_synced_at`, no `last_error` (silent per decision).

No new table. No `is_active` on roster. No schema change to `course_roster_allowlist`.

Migration also grants `service_role` continues to have full access (it already does) — no policy change needed since only the course's teachers write this column, and existing course RLS covers it.

## Sync behavior (additive-only)

`Sync now` runs the same client-side pipeline the current one-off import uses:

1. Read `roster_sync_sheet_url` from the course row.
2. Re-validate the URL shape (defense against a URL saved before a validation rule tightens).
3. Fetch → parse → dedupe against current roster → upsert with `source: "google_sheet"` and `onConflict: "course_id,email"`.
4. Toast the same summary as today (added / duplicate / invalid / already-on-roster).

Emails removed from the sheet between clicks stay on the roster untouched. This matches your "additive-only" decision and eliminates the biggest data-loss risk.

## Not doing (explicitly out of scope, per your decisions)

- No `pg_cron` job, no scheduled edge function, no polling loop.
- No server-side sync path — sync still runs in the teacher's browser, same fetch, same CORS surface as today.
- No delete-on-remove or soft-delete of roster entries.
- No last-synced-at, last-error, or status UI. No email/notification on failure.
- No multi-URL support. One URL per course.

## Files touched

- `src/pages/teacher/EnrollmentSettings.tsx` — load saved URL on mount, add Save / Clear / Sync now controls, wire Sync to the existing `handleSheetImport` reading the saved URL instead of the input.
- One migration adds `courses.roster_sync_sheet_url text`.

No new files, no edge functions, no new dependencies.

## Risks

1. **"Every 15 minutes automatically" is not what this plan delivers.** You explicitly chose manual-only to reduce server load, so the sync only runs when a teacher clicks. If any stakeholder is expecting hands-off syncing, this will disappoint them — flag it now, not after ship.
2. **Sync still runs client-side.** Same CORS/network failure modes as today. A teacher on a restrictive network could see fetch errors that don't reproduce elsewhere. Server-side fetch would fix this but was ruled out.
3. **Silent failures.** Per your decision, a failed sync only shows up in browser console + edge function logs (and only browser console here, since there's no edge function). Teachers won't know a sync silently returned zero rows unless they read the toast at click time. Acceptable trade for reduced surface area, but worth naming.
4. **Stale saved URL.** If a teacher unpublishes the sheet or rotates the URL, `Sync now` will start failing with a 404/403. No auto-detection; teacher must notice.
5. **Additive-only is a feature, not a bug — but it drifts.** Over a semester the roster can accumulate stale entries (students dropped from the sheet). That's a manual cleanup task, done via existing "remove entry" and "Clear all" controls.
6. **Google CSV caches ~5 minutes.** Repeated `Sync now` clicks within that window may return the same rows.
7. **Race on rapid clicks.** Two fast clicks could double-fetch. Mitigated by the existing `sheetImporting` flag disabling the button while running.
8. **URL is visible to anyone with course-edit access.** The saved URL points at a public-CSV endpoint (by design of publish-to-web), so anyone with access to the course row can read the sheet. Same visibility as today, just now persistent.

## Verification

1. Save a valid `/pub?output=csv` URL → reload page → confirm the input is prefilled and the "Saved" chip is shown.
2. Click **Sync now** → confirm toast summary matches roster changes.
3. Edit the sheet, wait past the Google cache window, click **Sync now** again → confirm new rows are added, previously imported rows are counted as "already on roster", removed rows are still present in the DB (additive-only).
4. Click **Clear saved URL** → confirm the column is nulled and Sync now hides.
5. Save an invalid URL → confirm client-side rejection, nothing written.
6. Manual/CSV entries remain untouched across syncs.

## Questions still open

None — all four decisions locked (manual-only, one URL per course, additive-only, silent). Ready to implement on approval.
