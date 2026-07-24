# Fix auto-reload during PDF upload + smoother progress bar

Two small, isolated changes. No backend or DB changes.

## 1. Conditional pre-upload session refresh (`src/components/FileUploadZone.tsx`)

Currently `handleConfirmedUpload` unconditionally calls `supabase.auth.refreshSession()` right before uploading. If the refresh token round-trip fails or returns a `SIGNED_OUT`, `AuthContext.onAuthStateChange` clears `user`, the route guard bounces to `/auth`, and the upload dialog is torn down mid-flight — the "page reloads on its own" symptom.

Change:
- Read the current session via `supabase.auth.getSession()`.
- Compute `secondsUntilExpiry = (expires_at * 1000 - Date.now()) / 1000`.
- Only call `refreshSession()` when `secondsUntilExpiry < 60` (or when no `expires_at` is available).
- If `refreshSession()` returns an error but a still-valid `access_token` exists (expiry still in the future), swallow it with a `console.warn` and proceed with the upload — do not surface, do not force sign-out.

## 2. Suppress spurious sign-out from a failed refresh (`src/contexts/AuthContext.tsx`)

The `onAuthStateChange` listener today sets `user`/`session` from whatever the SDK emits. When a refresh fails transiently, Supabase may fire `TOKEN_REFRESHED` with a null session or `SIGNED_OUT` even though the previously stored access token has not yet expired.

Change the listener to:
- Ignore `SIGNED_OUT` / null-session events when the current in-memory `session.access_token` is still valid (expiry in the future by > 0s) AND the event is not `USER_DELETED` and was not initiated by our own `signOut()` (tracked via a small `signOutInFlightRef`).
- On `signOut()`, set the ref before calling `supabase.auth.signOut()` so a genuine user-initiated sign-out still clears state.
- All other events (`SIGNED_IN`, `TOKEN_REFRESHED` with a real session, `USER_UPDATED`) behave as today.

This makes an upload-time refresh hiccup a warning, not a logout.

## 3. Minimum-visible-duration progress animation (`src/components/FileUploadZone.tsx`)

XHR `progress` events on small files jump 0 → 100 in a single tick, so the `<Progress>` bar visually skips. Add a lightweight animator local to `uploadFileWithProgress`:

- Maintain a `displayedProgress` state alongside the existing real `uploadProgress`.
- When real progress advances, ease `displayedProgress` toward it via `requestAnimationFrame` such that any full 0 → 100 transition takes at least ~400 ms (min-duration clamp; never rewind, never delay a completed upload's post-processing).
- Render `<Progress value={displayedProgress[progressKey]} />` in the three existing progress spots (lines 729, 808 stay; line 893 `animate-pulse` indeterminate bar stays as-is).
- Once real progress hits 100 and the animation catches up, we still trigger the existing indexing-badge flow without extra delay for the network step — only the visual fill is smoothed.

## Risks

- **Session semantics**: Suppressing `SIGNED_OUT` when the token is still valid is intentional but changes AuthContext behavior globally. Mitigation: only suppress when `expires_at` in stored session is in the future and the event wasn't user-initiated; genuine expiry still logs the user out via the natural token expiry path.
- **Progress animator**: Must be cancelled on unmount / new upload to avoid leaked `rAF` loops.
- No changes to upload payload, storage bucket, or RAG ingestion.

## Out of scope

- Changing upload chunking, retry, or the RAG indexing badge.
- Any UI copy or layout changes beyond the smoother fill.
