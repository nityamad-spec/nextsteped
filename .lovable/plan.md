# Fix: `generate-weekly-quiz` returns 401 "Not authenticated"

## Root cause

The runtime error fires from `supabase/functions/generate-weekly-quiz/index.ts` line ~236–241:

```ts
const { data: userData, error: userErr } = await userClient.auth.getUser();
if (userErr || !userData?.user) {
  return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, ... });
}
```

`auth.getUser()` calls the Auth server's `/user` endpoint, which looks up the **session row** for the bearer token. The auth logs for this exact window show:

```
GET /user  →  403  session_not_found
"session id (f91a4bf4-…) doesn't exist"
```

The teacher logged out and back in (`teacher.nextstep@gmail.com` logout @ 05:53:23, prior login @ 05:53:02), invalidating that session row. The CourseCreation / lesson-plan page still held the **previous** access token in the in-flight Supabase client and used it when the user clicked "Generate weekly quiz". The JWT itself is still cryptographically valid (signed, unexpired) — only the server-side session lookup fails — so `getUser()` returns 403 and the function maps it to 401.

This is the same fragility pattern other edge functions in this project already avoid by using `auth.getClaims(token)`, which verifies the JWT signature locally and does **not** require a live session row (see `resend-teacher-invite/index.ts` for the existing pattern).

## Fix

Replace the session-bound `getUser()` check in `generate-weekly-quiz` with the JWT-claims check used elsewhere in the codebase.

### File: `supabase/functions/generate-weekly-quiz/index.ts`

1. Read the bearer token from the `Authorization` header. Return 401 if missing/malformed.
2. Use `userClient.auth.getClaims(token)` to verify and decode the JWT.
3. Take `userId` from `claims.sub` instead of `userData.user.id`.
4. Keep the existing authorization (teacher / collaborator / admin) logic unchanged — it already uses the service-role `admin` client and `userId`.

Sketch of the replacement block (replaces lines ~232–242):

```ts
const authHeader = req.headers.get("Authorization") ?? "";
if (!authHeader.startsWith("Bearer ")) {
  return new Response(JSON.stringify({ error: "Not authenticated" }), {
    status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
const token = authHeader.slice("Bearer ".length);

const userClient = createClient(supabaseUrl, anonKey, {
  global: { headers: { Authorization: authHeader } },
});
const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
if (claimsErr || !claimsData?.claims?.sub) {
  return new Response(JSON.stringify({ error: "Not authenticated" }), {
    status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
const userId = claimsData.claims.sub as string;
```

No schema, no client-side, no other function changes.

## Out of scope

- Forcing a client-side session refresh before each invoke (broader change, not the root cause here).
- Auditing every other edge function for the same `getUser()` pattern (do it as a follow-up if desired).
- The earlier hard-tier timeout/batching work on `generate-diagnostic-questions` is unrelated and stays as-is.

## Validation

1. Deploy `generate-weekly-quiz`.
2. While logged in as the teacher on `/teacher/setup/lesson-plan`, click "Generate weekly quiz" on a week with concepts.
3. Confirm response is 200 with `{ ok: true, generated: N }` and toast shows success.
4. Log out, log back in (same browser tab) without hard-refresh, repeat step 2 — should no longer 401.
5. Negative case: call the function with no `Authorization` header (via curl) — should still return 401.

## Files touched

- `supabase/functions/generate-weekly-quiz/index.ts` — auth check only.
