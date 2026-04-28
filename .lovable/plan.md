# Fix: "Update Password" button stuck disabled on Reset Password page

## Problem
On `/reset-password`, the button is disabled while `mode === "waiting"`. `mode` is only flipped to `"recovery"` inside the `onAuthStateChange` listener when the `PASSWORD_RECOVERY` event fires. In practice this event can be missed because:

1. The listener is registered after Supabase has already processed the recovery hash on page load (race condition — `PASSWORD_RECOVERY` already fired before `useEffect` ran).
2. The fallback `getSession()` branch only flips mode to `"invite"` when `pending_signups` or `needs_password_setup` is true — it never flips to `"recovery"` for an existing-user password reset, even when an active session is present from the recovery link.

Result: a logged-in (via recovery link) user sees "Waiting for password recovery link verification…" forever and the button stays disabled.

## Fix

In `src/pages/ResetPassword.tsx`:

1. **Detect recovery from the URL hash directly.** When the page loads with `#type=recovery` (or `#access_token=...&type=recovery`) in the URL, immediately set `mode = "recovery"` without waiting for the auth event.
2. **Fallback in `getSession()`**: if a session already exists and the user is **not** an invite (no `pending_signups`, no `needs_password_setup`), default `mode` to `"recovery"` instead of leaving it as `"waiting"`.
3. **Safety net timeout**: after ~1.5s, if mode is still `"waiting"` but a session exists, flip it to `"recovery"`. This catches the race where the listener missed the event.
4. **Update copy** so the description no longer says "Waiting…" once mode resolves (already handled — only need to make sure mode resolves).

## Technical changes

Single file edit: `src/pages/ResetPassword.tsx`

- In the `useEffect`, before subscribing to `onAuthStateChange`, parse `window.location.hash`:
  ```ts
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (hash.get("type") === "recovery") setMode("recovery");
  ```
- In the existing `getSession()` `.then(...)` block, after the invite checks, add: `setMode(prev => prev === "waiting" ? "recovery" : prev);` when a session is present.
- Add a `setTimeout(() => setMode(prev => prev === "waiting" ? "recovery" : prev), 1500)` cleanup-cleared timer as a safety net.
- No other components affected.

## Out of scope
- No backend or RLS changes.
- Invite flow logic (`pending_signups`, `needs_password_setup`) is unchanged.
