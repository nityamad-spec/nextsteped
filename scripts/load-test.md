# Load test — simulate 100 concurrent students

Validates that the live backend (Postgres + edge functions + AI gateway) holds up
under the target concurrent load before publishing.

## What it measures

For each endpoint (auth, three REST reads, the `chat` edge function):

- requests served
- error rate
- 429 (rate-limited) and 5xx counts
- p50 / p95 / p99 / max latency in ms

Results are printed as a table and written to `/tmp/load-test-results.json`
so you can diff before/after an instance upgrade or code change.

## One-time setup

You need a pool of pre-enrolled test students (one row in `profiles`,
`enrollments`, and the auth user with a known password).

1. In the Admin portal, seed N test students (e.g. `loadtest+001@yourdomain.com`
   through `loadtest+100@yourdomain.com`) all enrolled in the same course and
   with the same password.
2. Note the `COURSE_ID` they're enrolled in.

If you don't have an admin path that creates students with a known password,
ask a developer to run a one-off seed script with the service role key.

## Run

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_ANON_KEY=<publishable-anon-key> \
LOAD_TEST_EMAILS="loadtest+001@x.com,loadtest+002@x.com,...,loadtest+100@x.com" \
LOAD_TEST_PASSWORD="<shared-password>" \
COURSE_ID="<uuid>" \
DURATION_SEC=60 \
  bun scripts/load-test.ts
```

Start with 5 students and `DURATION_SEC=10` for a dry run, then scale up.

## Interpreting results

Target thresholds for "ready for 100 concurrent students":

| Endpoint                    | p95   | Error rate |
| --------------------------- | ----- | ---------- |
| `auth.signin`               | <1s   | <1%        |
| `rest.*` reads              | <500ms| <0.5%      |
| `edge.chat` (AI streaming)  | <8s   | <2%        |

If `edge.chat` p95 climbs past 10s or 429s exceed 2%, upgrade the Cloud
instance one tier (Backend → Advanced settings → Upgrade instance) and re-run.
If REST p95 climbs but 429s stay low, the database is saturated — check
`supabase--db_health` and look for missing indexes on hot tables.

## Notes

- The script does NOT write to `assessment_results` to avoid polluting analytics.
  Add an insert step yourself if you want to measure write contention too.
- The script reuses each token for the full duration; it does not exercise
  refresh-token flows.
- Run from a network with low latency to your Cloud region — measurements from
  far away include WAN latency, not just server time.
