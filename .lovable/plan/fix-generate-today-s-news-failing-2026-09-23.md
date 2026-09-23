# Fix "Generate today's news" failing

Clicking **Generate today's news** on Student Home fails every time. The backend news function rejects the request with "Unauthorized" before it ever searches or writes anything.

## What's happening

The news function checks who you are using a different method than the parts of the app that work (practice questions, for example). It builds a throwaway client from a project key that the function environment may not provide, so the identity check fails and the request is refused with "Unauthorized" — even though you are properly signed in. Confirmed from the function's own logs: it starts up cleanly, logs no error, and returns its own "Unauthorized" response.

## The fix

- Verify the signed-in student the same way the working features do: hand the request's token straight to the trusted server-side client for validation, instead of relying on the public project key.
- Keep everything else unchanged: enrollment is still checked, course name and concepts are still read server-side, and the news search and summarising steps stay as they are.
- Keep the clear, separate messages for the other failure cases (not enrolled, search unavailable, no results, rate limited) so a future problem doesn't look like a sign-in problem.

## Technical detail

In `supabase/functions/course-news/index.ts`, replace the anon-key user client (`createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization } } })` + `auth.getUser()`) with the service-role `admin` client and `admin.auth.getUser(token)`, where `token` is the bearer value from the `Authorization` header — the same pattern used in `generate-practice-questions/index.ts`. Move the admin client creation above the auth check and drop the now-unused `SUPABASE_ANON_KEY` read.

## Verification

- Typecheck.
- Redeploy the function and generate news from the student home page in the preview, confirming real article cards appear and no 401 shows in the network log.
