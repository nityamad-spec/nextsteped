/**
 * submit-coding-solution
 *
 * Grades a student's code against every visible AND hidden test case of a
 * published coding exercise (weekly bank) or daily DSA question (daily bank).
 * Hidden cases are loaded server-side and never returned — the response only
 * says whether each hidden case passed. The attempt is recorded here; a full
 * pass on a weekly exercise also marks it solved.
 *
 * Auth: Bearer JWT of an actively enrolled student.
 * Input: { bank: "weekly" | "daily", exerciseId: uuid, language, code }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { judgeVerdict, Judge0Error, runOnJudge0 } from "../_shared/judge0.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_CASES = 30;
const CONCURRENCY = 4;

const BodySchema = z.object({
  bank: z.enum(["weekly", "daily"]),
  exerciseId: z.string().uuid(),
  language: z.enum(["python", "cpp", "java", "javascript"]),
  code: z.string().min(1).max(50_000),
});

type Case = { input: string; expected_output: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const asCases = (v: unknown): Case[] =>
  Array.isArray(v)
    ? v
        .filter((c) => c && typeof c === "object")
        .map((c: any) => ({ input: String(c.input ?? ""), expected_output: String(c.expected_output ?? "") }))
    : [];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Your session expired. Please sign in again." }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Your session expired. Please sign in again." }, 401);
    const userId = userData.user.id;

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "Invalid submission", details: parsed.error.flatten().fieldErrors }, 400);
    const { bank, exerciseId, language, code } = parsed.data;

    const pubTable = bank === "daily" ? "daily_dsa_questions" : "coding_exercises";
    const privTable = bank === "daily" ? "daily_dsa_question_private" : "coding_exercise_private";
    const fk = bank === "daily" ? "question_id" : "exercise_id";

    const { data: ex } = await admin
      .from(pubTable)
      .select("id, course_id, published, standard_test_cases")
      .eq("id", exerciseId)
      .maybeSingle();
    if (!ex || !ex.published) return json({ error: "This exercise isn't available." }, 404);

    const { data: enrolled } = await admin.rpc("is_active_enrollment", {
      _course_id: ex.course_id,
      _student_id: userId,
    });
    if (!enrolled) return json({ error: "You're not enrolled in this course." }, 403);

    const { data: priv } = await admin.from(privTable).select("hidden_test_cases").eq(fk, exerciseId).maybeSingle();

    const visible = asCases(ex.standard_test_cases);
    const hidden = asCases(priv?.hidden_test_cases);
    const all = [
      ...visible.map((c, i) => ({ ...c, kind: "standard" as const, index: i + 1 })),
      ...hidden.map((c, i) => ({ ...c, kind: "hidden" as const, index: i + 1 })),
    ].slice(0, MAX_CASES);
    if (all.length === 0) return json({ error: "This exercise has no test cases yet." }, 400);

    const results: any[] = new Array(all.length);
    let next = 0;
    const worker = async () => {
      while (next < all.length) {
        const i = next++;
        const c = all[i];
        try {
          const r = await runOnJudge0(language, code, c.input);
          const verdict = judgeVerdict(r, c.expected_output);
          const passed = verdict === "passed";
          const message = [r.compileOutput, r.stderr].filter((s) => s.trim()).join("\n").slice(0, 2000);
          results[i] =
            c.kind === "hidden"
              ? { kind: "hidden", index: c.index, passed, verdict, status: r.status }
              : {
                  kind: "standard",
                  index: c.index,
                  passed,
                  verdict,
                  status: r.status,
                  input: c.input,
                  expected: c.expected_output,
                  actual: r.stdout.slice(0, 5000),
                  message,
                };
        } catch (e) {
          if (e instanceof Judge0Error) throw e;
          console.error("[submit-coding-solution] case failed", e);
          throw new Judge0Error("Code execution service error.");
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, all.length) }, worker));

    const passedCount = results.filter((r) => r.passed).length;
    const allPassed = passedCount === results.length;

    const attempt = {
      student_id: userId,
      course_id: ex.course_id,
      submitted_code: code,
      language,
      passed: allPassed,
      cases_passed: passedCount,
      cases_total: results.length,
      results: results.map((r) => ({ kind: r.kind, index: r.index, passed: r.passed, status: r.status })),
    };
    const { error: attemptErr } =
      bank === "daily"
        ? await admin.from("daily_dsa_attempts").insert({ ...attempt, question_id: exerciseId })
        : await admin.from("coding_attempts").insert({ ...attempt, exercise_id: exerciseId });
    if (attemptErr) console.error("attempt insert failed", attemptErr);

    if (allPassed && bank === "weekly") {
      const { error: progErr } = await admin.from("coding_exercise_progress").upsert(
        { student_id: userId, exercise_id: exerciseId, course_id: ex.course_id, source: "submit_pass" },
        { onConflict: "student_id,exercise_id", ignoreDuplicates: true },
      );
      if (progErr) console.error("progress upsert failed", progErr);
    }

    return json({ passed: allPassed, casesPassed: passedCount, casesTotal: results.length, results });
  } catch (e) {
    if (e instanceof Judge0Error) return json({ error: e.message }, 502);
    console.error("submit-coding-solution error", e);
    return json({ error: "Unexpected error grading your code." }, 500);
  }
});
