/**
 * get-coding-review
 *
 * After a student has used all Submit attempts on a coding-lab exercise,
 * returns their best attempt and the professor's reference solution.
 * Hidden test cases are never returned. 403 until the cap is reached.
 *
 * Input: { bank: "weekly", exerciseId: uuid }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const MAX_ATTEMPTS = 3;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BodySchema = z.object({ bank: z.literal("weekly").default("weekly"), exerciseId: z.string().uuid() });

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
    if (!parsed.success) return json({ error: "Invalid request" }, 400);
    const { exerciseId } = parsed.data;

    const { data: ex } = await admin
      .from("coding_exercises")
      .select("*")
      .eq("id", exerciseId)
      .maybeSingle();
    if (!ex || !ex.published) return json({ error: "This exercise isn't available." }, 404);

    const { data: enrolled } = await admin.rpc("is_active_enrollment", { _course_id: ex.course_id, _student_id: userId });
    if (!enrolled) return json({ error: "You're not enrolled in this course." }, 403);

    const { data: weekRow } = await admin
      .from("lesson_plan_weeks")
      .select("is_coding_week")
      .eq("course_id", ex.course_id)
      .eq("week_number", ex.week_number)
      .maybeSingle();
    if (!weekRow?.is_coding_week) return json({ error: "Review isn't available for this exercise." }, 403);

    const { data: attempts } = await admin
      .from("coding_attempts")
      .select("submitted_code, language, score, cases_passed, cases_total, created_at")
      .eq("exercise_id", exerciseId)
      .eq("student_id", userId);
    const list = attempts ?? [];
    if (list.length < MAX_ATTEMPTS) {
      return json({ error: "The solution unlocks after all attempts are used.", attemptsUsed: list.length }, 403);
    }

    const best = [...list].sort((a: any, b: any) => {
      const sa = a.score ?? -1, sb = b.score ?? -1;
      if (sa !== sb) return sb - sa;
      if ((a.cases_passed ?? 0) !== (b.cases_passed ?? 0)) return (b.cases_passed ?? 0) - (a.cases_passed ?? 0);
      return String(b.created_at).localeCompare(String(a.created_at));
    })[0] as any;

    const { data: priv } = await admin
      .from("coding_exercise_private")
      .select("reference_solution")
      .eq("exercise_id", exerciseId)
      .maybeSingle();

    return json({
      bestAttempt: {
        code: best.submitted_code,
        language: best.language,
        score: best.score,
        cases_passed: best.cases_passed,
        cases_total: best.cases_total,
      },
      referenceSolution: priv?.reference_solution ?? "",
      solutionLanguage: ex.language ?? best.language,
    });
  } catch (e) {
    console.error("get-coding-review error", e);
    return json({ error: "Unexpected error loading your review." }, 500);
  }
});
