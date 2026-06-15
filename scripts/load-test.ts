/**
 * Load test: simulate N concurrent students hitting the live backend.
 *
 * Usage:
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_ANON_KEY=<anon> \
 *   LOAD_TEST_EMAILS=student1@x.com,student2@x.com,... \
 *   LOAD_TEST_PASSWORD=<shared-password> \
 *   COURSE_ID=<uuid> \
 *   DURATION_SEC=60 \
 *     bun scripts/load-test.ts
 *
 * Outputs a per-endpoint summary: requests, errors, p50/p95/p99, 429/5xx counts.
 * Writes JSON to /tmp/load-test-results.json for diffing across runs.
 *
 * See scripts/load-test.md for setup instructions.
 */

const SUPABASE_URL = required("SUPABASE_URL");
const ANON = required("SUPABASE_ANON_KEY");
const EMAILS = required("LOAD_TEST_EMAILS").split(",").map((e) => e.trim()).filter(Boolean);
const PASSWORD = required("LOAD_TEST_PASSWORD");
const COURSE_ID = required("COURSE_ID");
const DURATION_SEC = Number(process.env.DURATION_SEC ?? 60);

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env: ${name}`);
    process.exit(1);
  }
  return v;
}

interface Stat {
  endpoint: string;
  latencies: number[];
  errors: number;
  status429: number;
  status5xx: number;
}
const stats = new Map<string, Stat>();
function record(endpoint: string, ms: number, status: number, err: boolean) {
  let s = stats.get(endpoint);
  if (!s) { s = { endpoint, latencies: [], errors: 0, status429: 0, status5xx: 0 }; stats.set(endpoint, s); }
  s.latencies.push(ms);
  if (err) s.errors += 1;
  if (status === 429) s.status429 += 1;
  if (status >= 500) s.status5xx += 1;
}

async function timed(endpoint: string, fn: () => Promise<Response>): Promise<Response | null> {
  const start = performance.now();
  try {
    const r = await fn();
    record(endpoint, performance.now() - start, r.status, !r.ok);
    return r;
  } catch (e) {
    record(endpoint, performance.now() - start, 0, true);
    return null;
  }
}

async function signIn(email: string): Promise<string | null> {
  const r = await timed("auth.signin", () => fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  }));
  if (!r || !r.ok) return null;
  const j = await r.json();
  return j.access_token ?? null;
}

async function workload(token: string) {
  const auth = { Authorization: `Bearer ${token}`, apikey: ANON, "Content-Type": "application/json" };
  const deadline = Date.now() + DURATION_SEC * 1000;
  while (Date.now() < deadline) {
    await Promise.all([
      // DB read: assessment_questions
      timed("rest.assessment_questions", () => fetch(
        `${SUPABASE_URL}/rest/v1/assessment_questions?course_id=eq.${COURSE_ID}&mode=eq.daily_quiz&limit=20`,
        { headers: auth },
      )),
      // DB read: student_concept_mastery
      timed("rest.student_concept_mastery", () => fetch(
        `${SUPABASE_URL}/rest/v1/student_concept_mastery?course_id=eq.${COURSE_ID}&limit=50`,
        { headers: auth },
      )),
      // DB read: lesson_plan_weeks
      timed("rest.lesson_plan_weeks", () => fetch(
        `${SUPABASE_URL}/rest/v1/lesson_plan_weeks?course_id=eq.${COURSE_ID}&order=week_number.asc`,
        { headers: auth },
      )),
      // Edge function: chat (AI hot path) — single short turn
      timed("edge.chat", () => fetch(`${SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          messages: [{ role: "user", content: "What is a Python list?" }],
          course_id: COURSE_ID,
        }),
      })),
    ]);
    // Small think time between iterations
    await new Promise((r) => setTimeout(r, 1500));
  }
}

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor(p * s.length));
  return Math.round(s[idx]);
}

function summarize() {
  const rows = [...stats.values()].map((s) => ({
    endpoint: s.endpoint,
    requests: s.latencies.length,
    errors: s.errors,
    error_rate_pct: s.latencies.length ? Math.round((s.errors / s.latencies.length) * 1000) / 10 : 0,
    status_429: s.status429,
    status_5xx: s.status5xx,
    p50_ms: pct(s.latencies, 0.5),
    p95_ms: pct(s.latencies, 0.95),
    p99_ms: pct(s.latencies, 0.99),
    max_ms: s.latencies.length ? Math.round(Math.max(...s.latencies)) : 0,
  }));
  console.table(rows);
  return rows;
}

async function main() {
  console.log(`Signing in ${EMAILS.length} students in parallel…`);
  const tokens = (await Promise.all(EMAILS.map(signIn))).filter((t): t is string => !!t);
  console.log(`${tokens.length}/${EMAILS.length} signed in successfully.`);
  if (tokens.length === 0) { console.error("No tokens obtained, aborting."); process.exit(1); }

  console.log(`Running ${DURATION_SEC}s workload across ${tokens.length} virtual students…`);
  const t0 = performance.now();
  await Promise.all(tokens.map(workload));
  const elapsed = Math.round((performance.now() - t0) / 1000);

  console.log(`\n=== Load-test summary (${elapsed}s, ${tokens.length} students) ===`);
  const rows = summarize();
  const out = { duration_sec: elapsed, students: tokens.length, results: rows };
  await Bun.write("/tmp/load-test-results.json", JSON.stringify(out, null, 2));
  console.log("\nWrote /tmp/load-test-results.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
