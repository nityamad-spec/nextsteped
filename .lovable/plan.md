# Make the mastery scoring integration test runnable in the sandbox

## What's wrong today

`supabase/functions/update-mastery/integration_test.ts` starts with a hard import of the dotenv
auto-loader (`std/dotenv/load.ts`). That module reads the `.env` file at import time. The test
runner grants only `--allow-net --allow-env`, so the file throws before any test registers:

```text
NotCapable: Requires read access to ".env", run again with the --allow-read flag
FAILED | 0 passed | 1 failed
```

The credentials the test needs are already present as real environment variables in the runner
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the publishable/anon key), so reading `.env` is
unnecessary — it is purely a convenience for local runs.

## The change

1. Delete the unconditional `import "…/dotenv/load.ts"`.
2. Replace it with a small permission-aware loader that runs before the env reads: query read
   permission for `.env` without prompting; only if it is already granted, dynamically import the
   dotenv loader inside a try/catch. Any failure is swallowed — injected env still wins.
3. Broaden the anon-key lookup so the runner's actual variable names resolve: `SUPABASE_ANON_KEY`,
   then `SUPABASE_PUBLISHABLE_KEY`, then `VITE_SUPABASE_PUBLISHABLE_KEY` (the URL fallback to
   `VITE_SUPABASE_URL` already exists and stays).
4. Keep the existing `haveEnv` skip gate untouched, so a machine with no credentials still passes
   with the suite ignored rather than erroring.
5. Re-run `deno test --allow-net --allow-env` on the file and report whether the integration tests
   pass, plus the full backend suite to confirm nothing else regressed.

Only this one test file changes. No edge function, migration, or frontend code is touched.

## Risks and constraints

- **The test writes to the live backend.** Once it stops erroring at import, it will actually run:
  it creates auth users, a course, concepts, enrollments, and mastery rows against the project the
  env vars point at — which is the real Lovable Cloud project, not a throwaway database. Rows are
  named with a random timestamp stamp and the file has teardown, but any failure mid-run can leave
  orphan test users and course data behind.
- Top-level module-scope side effects in a Deno test file abort the entire file, not one test; the
  guarded loader keeps all side effects inside try/catch for that reason.
- `Deno.permissions.query` is itself permission-free, so the guard cannot reintroduce a prompt or a
  `NotCapable` throw.

## Question before I build

Given the test mutates the live project data, do you want me to:

- **A.** Make the fix and run it against the live project once, reporting results and cleaning up, or
- **B.** Make the fix but leave the suite skip-gated in normal runs (opt in with an explicit
  `RUN_MASTERY_INTEGRATION=1` flag) so it never touches live data unattended?
