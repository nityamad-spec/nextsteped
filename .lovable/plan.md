
# Production Readiness Plan

Based on live diagnostics just run against the project. The Cloud backend is healthy, slow-query mean times are all under 7ms (so DB compute is fine for 100 users today), and the real risks are concentrated in **edge functions + AI gateway concurrency** and **23 security-scan findings**.

---

## What I found (evidence)

**Cloud status:** healthy. **Slow queries:** worst mean 6.4ms — no urgent indexing needed; the DB is not the bottleneck at current load. **Security scan:** 23 findings. **Linter:** 16 issues (5 "RLS always true" UPDATE/DELETE/INSERT policies, 10 SECURITY DEFINER functions over-exposed, 1 HIBP disabled). **Edge functions using fragile `auth.getUser()`:** 7 functions — same pattern we just fixed in `generate-weekly-quiz`:
- `enroll-additional-course`, `complete-student-signup`, `update-mastery`, `score-diagnostic`, `generate-exam-questions`, `generate-teaching-insights`, `extract-youtube-links`

---

## Scope (what I will execute)

### A. Security scan + edge function auth audit

**A1. Fix 5 "RLS Policy Always True" warnings**
- Read each policy via `supabase--read_query` on `pg_policies`.
- Scope each policy to `auth.uid()` or `is_course_member()` — never blanket `true` on write paths.
- Migration drops + recreates the offending policies.

**A2. Fix 10 SECURITY DEFINER function exposure warnings**
- `REVOKE EXECUTE ... FROM anon, public` on the 5 functions flagged "Public Can Execute" (`bump_cache_version`, `is_admin`, `course_dashboard_stats`, `is_course_member`, plus trigger functions that don't need API exposure).
- Keep `GRANT EXECUTE ... TO authenticated` only where the client legitimately calls it (`course_dashboard_stats`).
- Trigger-only functions (`assessment_questions_validate_topic`, `diagnostic_questions_validate_topic`, `update_updated_at_column`, `set_created_at_if_null`) get all EXECUTE revoked from `anon` and `authenticated`.

**A3. Enable Leaked Password Protection (HIBP)** via `supabase--configure_auth`.

**A4. Convert 7 edge functions from `auth.getUser()` to `auth.getClaims(token)`**
Same pattern as `generate-weekly-quiz`. Returns 401 cleanly when token signature fails; no more spurious 401s after logout/login cycles.

Files:
- `enroll-additional-course/index.ts`
- `complete-student-signup/index.ts`
- `update-mastery/index.ts`
- `score-diagnostic/index.ts`
- `generate-exam-questions/index.ts`
- `generate-teaching-insights/index.ts`
- `extract-youtube-links/index.ts`

**A5. Re-run scan** to confirm findings drop.

### B. DB performance — light pass

Slow queries don't justify aggressive indexing, but two micro-wins for concurrency:

- `CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON public.chat_messages (session_id, created_at);` — supports the #1 query (817 calls, used by chat panel).
- `CREATE INDEX IF NOT EXISTS idx_assessment_results_student_mode_course ON public.assessment_results (student_id, mode, course_id, created_at DESC);` — supports student dashboard.
- `CREATE INDEX IF NOT EXISTS idx_lesson_plan_weeks_course_week ON public.lesson_plan_weeks (course_id, week_number);` — supports lesson plan reads.

These are cheap (low write volume on these tables) and trim p95 under contention.

### C. Load-test script for 100 concurrent students

Create `scripts/load-test.ts` (Node + native fetch, no external deps) that:

1. Signs in 100 pre-seeded test students in parallel via `student-signin` edge function.
2. For each, runs a 60-second workload mixing:
   - 3× `chat` invocations (the AI hot path)
   - 1× `assessment_questions` fetch (DB hot path)
   - 1× `assessment_results` insert (write path)
   - 1× `student_concept_mastery` read
3. Reports per-endpoint: requests, error rate, p50/p95/p99 latency, 429 count, 5xx count.

Outputs JSON + console summary so you can compare before/after instance upgrade.

Includes a `README` section in `scripts/load-test.md` explaining: how to seed test students (via existing admin tooling), env vars needed (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LOAD_TEST_PASSWORD`), and how to interpret results.

### D. Instance sizing recommendation (no code change)

Based on `db_health` + slow queries: **stay on current tier for now, plan to bump one tier before public launch.** The DB is comfortable, but AI gateway concurrency and edge function cold starts are the real ceiling — those scale with Cloud instance memory. After load test, if p95 chat latency > 8s or 429 rate > 2%, upgrade via Backend → Advanced settings → Upgrade instance.

---

## Out of scope (separate follow-ups)

- SEO/meta polish on `index.html` (can do as a quick separate pass before publish click)
- Frontend code-splitting + image conversion (not blocking 100 users)
- Tightening CORS `*` → published origin (do after you have the final URL)
- Adding `ai_gateway_call_log` audit rows to `chat` / `generate-practice-questions` (nice-to-have observability)
- Writing per-edge-function retry-with-backoff wrappers (the existing per-call timeouts are adequate at this scale)

---

## Order of execution

1. Migration: drop overly-permissive policies + revoke SECURITY DEFINER execute + add 3 indexes (single migration, atomic).
2. Enable HIBP via `configure_auth`.
3. Convert 7 edge functions to `getClaims()` (parallel file writes).
4. Write `scripts/load-test.ts` + `scripts/load-test.md`.
5. Re-run security scan + linter; report deltas.

## Validation

- Security scan count drops from 23 toward single digits (some SECURITY DEFINER warnings may remain if `course_dashboard_stats` must stay callable by `authenticated`).
- Linter: 16 → ≤2.
- All 7 converted edge functions still return 200 on a valid call and 401 on missing/invalid token (curl smoke test).
- Load-test script runs end-to-end against the dev backend with a 5-user dry run.
