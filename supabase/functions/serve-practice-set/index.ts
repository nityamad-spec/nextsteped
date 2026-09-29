/**
 * serve-practice-set
 *
 * Student-only. Builds a practice set from the professor-approved pool
 * (upskilling / employment courses):
 *   - only weeks already revealed to the student (lesson_plan_weeks.locked = false)
 *   - weakest concepts first (null mastery = weakest), round-robin across concepts
 *   - unseen questions first; seen ones are only used by the AI fallback path
 *   - at most MAX_CODING runnable coding items per set
 * Any shortfall is topped up with freshly AI-generated questions (not added
 * to the pool) via generate-practice-questions, and logged for the professor.
 * Hidden tests and reference solutions are never returned.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  courseId: z.string().uuid(),
  count: z.number().int().min(1).max(10).default(10),
  includeCoding: z.boolean().default(true),
});
const MAX_CODING = 2;

/** Weak-first round-robin pick. Exported shape mirrored in src/lib/practicePool.ts for tests. */
function pick<T extends { concept_code: string | null; kind: string }>(
  items: T[],
  mastery: Map<string, number | null>,
  count: number,
  maxCoding: number,
): T[] {
  const byConcept = new Map<string, T[]>();
  for (const it of items) {
    const k = it.concept_code ?? "";
    if (!byConcept.has(k)) byConcept.set(k, []);
    byConcept.get(k)!.push(it);
  }
  for (const list of byConcept.values()) list.sort(() => Math.random() - 0.5);
  const order = [...byConcept.keys()].sort((a, b) => (mastery.get(a) ?? -1) - (mastery.get(b) ?? -1));
  const out: T[] = [];
  let coding = 0;
  let progress = true;
  while (out.length < count && progress) {
    progress = false;
    for (const k of order) {
      if (out.length >= count) break;
      const list = byConcept.get(k)!;
      const idx = list.findIndex((q) => q.kind !== "coding" || coding < maxCoding);
      if (idx === -1) continue;
      const [q] = list.splice(idx, 1);
      if (q.kind === "coding") coding++;
      out.push(q);
      progress = true;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "Your session expired. Please sign in again." }, 401);
    const studentId = u.user.id;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "Invalid request" }, 400);
    const { courseId, count, includeCoding } = parsed.data;

    const { data: enrolled } = await admin.rpc("is_active_enrollment", { _course_id: courseId, _student_id: studentId });
    if (!enrolled) return json({ error: "You're not enrolled in this course." }, 403);

    const [{ data: weeks }, { data: pool }, { data: seen }, { data: mastery }] = await Promise.all([
      admin.from("lesson_plan_weeks").select("week_number").eq("course_id", courseId).eq("locked", false),
      admin
        .from("practice_pool_questions")
        .select("id, kind, format, concept_code, week_number, bloom_level, difficulty, title, question, options, language, starter_code, input_spec, output_spec, constraints, standard_test_cases")
        .eq("course_id", courseId)
        .eq("status", "approved")
        .limit(2000),
      admin.from("practice_pool_seen").select("question_id").eq("student_id", studentId).eq("course_id", courseId),
      admin.from("student_concept_mastery").select("concept_code, mastery_score").eq("student_id", studentId).eq("course_id", courseId),
    ]);

    const openWeeks = new Set((weeks ?? []).map((w) => w.week_number));
    const seenIds = new Set((seen ?? []).map((s) => s.question_id));
    const masteryMap = new Map<string, number | null>(
      (mastery ?? []).map((m) => [m.concept_code, m.mastery_score == null ? null : Number(m.mastery_score)]),
    );
    const eligible = (pool ?? []).filter(
      (q) => (q.week_number == null || openWeeks.has(q.week_number)) && !seenIds.has(q.id) && (includeCoding || q.kind !== "coding"),
    );
    const chosen = pick(eligible, masteryMap, count, includeCoding ? MAX_CODING : 0);

    const ncIds = chosen.filter((q) => q.kind !== "coding").map((q) => q.id);
    const { data: privs } = ncIds.length
      ? await admin.from("practice_pool_private").select("question_id, answer, model_answer, answer_max_words, explanation").in("question_id", ncIds)
      : { data: [] as any[] };
    const privMap = new Map((privs ?? []).map((p) => [p.question_id, p]));

    const questions: any[] = chosen.map((q) => {
      if (q.kind === "coding") {
        return {
          id: q.id, source: "pool", type: "coding", question: q.question, title: q.title, topic: q.concept_code ?? "",
          bloom_level: q.bloom_level, difficulty_estimate: Number(q.difficulty), language: q.language,
          starter_code: q.starter_code, input_spec: q.input_spec, output_spec: q.output_spec, constraints: q.constraints,
          test_cases: q.standard_test_cases ?? [], answer: "", explanation: "",
        };
      }
      const p = privMap.get(q.id);
      return {
        id: q.id, source: "pool", type: q.format, question: q.question, options: q.options ?? undefined,
        answer: p?.answer ?? "", model_answer: p?.model_answer ?? null, answer_max_words: p?.answer_max_words ?? null,
        explanation: p?.explanation ?? "", topic: q.concept_code ?? "", bloom_level: q.bloom_level,
        difficulty_estimate: Number(q.difficulty),
      };
    });

    if (chosen.length) {
      const now = new Date().toISOString();
      await admin.from("practice_pool_seen").upsert(
        chosen.map((q) => ({ student_id: studentId, question_id: q.id, course_id: courseId, last_seen_at: now })),
        { onConflict: "student_id,question_id" },
      );
    }

    const shortfall = count - questions.length;
    let toppedUp = 0;
    if (shortfall > 0) {
      await admin.from("practice_pool_topups").insert({ course_id: courseId, student_id: studentId, requested: count, from_pool: questions.length });
      try {
        const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-practice-questions`, {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
          body: JSON.stringify({ courseId, prompt: `Give me ${shortfall} practice questions focused on my weakest areas.` }),
        });
        const d = await r.json().catch(() => ({}));
        const extra = (Array.isArray(d?.questions) ? d.questions : []).slice(0, shortfall).map((q: any) => ({ ...q, source: "ai" }));
        toppedUp = extra.length;
        questions.push(...extra);
      } catch (e) {
        console.error("[serve-practice-set] top-up failed", e);
      }
    }

    return json({ questions, fromPool: chosen.length, toppedUp });
  } catch (e) {
    console.error("[serve-practice-set]", e);
    return json({ error: "Couldn't load practice questions. Please try again." }, 500);
  }
});
