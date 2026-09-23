# Fix "Unauthorized" when generating today's news

## What I found

The news feature itself is healthy. I ran it just now with a real signed-in student account against the Skill Training course and it returned live, on-topic articles (India AI hiring, etc.) with a normal success response.

The failures you're seeing come from the browser side: the request that fails carries no signed-in identity. The sign-in service rejects it with "missing sub claim", which is what happens when the app sends its public key instead of your personal session. In other words, at the moment you press Generate, the page thinks you're signed in but the request goes out without your session attached — most likely an expired or not-yet-restored session (the earlier sign-in logs also show a "refresh token not found" event).

## What to change

1. Attach the session explicitly. Before calling the news service, refresh/read the current session and send that token with the request. If there is genuinely no session, don't call the service at all.
2. Friendly message instead of "Unauthorized". If the session is missing or expired, show "Your session expired — please sign in again" with a sign-in link, rather than a raw error.
3. Same treatment on the backend. When the token is missing or invalid, return a clear "session expired" message so anything that surfaces it reads sensibly.
4. Recover automatically once. If the first attempt is rejected for auth, refresh the session once and retry silently before showing any message.

## Technical notes

- `src/components/student/WhatsNewCard.tsx`: in `generate()`, call `supabase.auth.getSession()` (and `refreshSession()` when the access token is absent or expiring within ~60s), pass `headers: { Authorization: 'Bearer <token>' }` to `supabase.functions.invoke("course-news", ...)`, and short-circuit with the session-expired message when no token is available. On a 401 response, refresh once and retry.
- `supabase/functions/course-news/index.ts`: keep the service-role `admin.auth.getUser(token)` check (verified working), change the two 401 bodies from `{ error: "Unauthorized" }` to `{ error: "Your session expired. Please sign in again." }`.
- No database or schema changes. Redeploy `course-news` after the message change, then verify with a browser run on `/student/home`.
