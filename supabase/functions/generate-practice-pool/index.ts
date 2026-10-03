/**
 * generate-practice-pool
 *
 * Teacher-only. Generates ONE batch of practice-pool questions for a single
 * lesson-plan week and stores them as drafts. The client loops weeks/batches
 * and shows progress. Non-coding: MCQ / T-F / short answer (≤10 per call).
 * Coding: small runnable problems (≤3 per call); every reference solution must
 * pass all its own test cases on Judge0 before the item is saved.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "npm:zod@3";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";
import { dedupWithin, type DedupItem } from "../_shared/question-validation.ts";
import { judgeVerdict, runOnJudge0 } from "../_shared/judge0.ts";

const FUNCTION_NAME = "generate-practice-pool";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  courseId: z.string().uuid(),
  kind: z.enum(["non_coding", "coding"]),
  weekNumber: z.number().int().min(0).max(60),
  count: z.number().int().min(1).max(10),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
  bloomLevel: z.number().int().min(1).max(6).default(3),
  language: z.enum(["python", "cpp", "java", "javascript"]).default("python"),
});

// Fixed difficulty value stamped on coding rows when the professor picks one
// (mixed keeps the AI-assigned per-item value).
const DIFF_VALUE: Record<string, number | null> = { easy: 0.3, medium: 0.5, hard: 0.8, mixed: null };

const BLOOM_DESC: Record<number, string> = {
  1: "Remember — recall facts and basic concepts",
  2: "Understand — explain ideas or concepts",
  3: "Apply — use knowledge in a new situation",
  4: "Analyze — draw connections among ideas",
  5: "Evaluate — justify a decision or course of action",
  6: "Create — produce new or original work",
};

const DIFF: Record<string, string> = {
  easy: "all easy (difficulty 0.2-0.35)",
  medium: "all medium (difficulty 0.45-0.6)",
  hard: "all hard (difficulty 0.7-0.85)",
  mixed: "a mix: ~30% easy, ~50% medium, ~20% hard",
};

async function callAI(system: string, user: string) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
  const model = "google/gemini-2.5-flash";
  const resp = await loggedGatewayFetch(FUNCTION_NAME, { model, purpose: "practice-pool" }, "https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    }),
  });
  if (resp.status === 429) throw new Error("AI is rate-limited right now — try again in a minute.");
  if (resp.status === 402) throw new Error("AI credits are exhausted for this workspace.");
  if (!resp.ok) throw new Error("AI generation failed.");
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(text.replace(/^```json\s*|```$/g, ""));
  } catch {
    return {};
  }
}

const clamp = (n: unknown, lo: number, hi: number, d: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
};
const asCases = (v: unknown) =>
  Array.isArray(v)
    ? v.filter((c) => c && typeof c === "object").map((c: any) => ({ input: String(c.input ?? ""), expected_output: String(c.expected_output ?? "") }))
    : [];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "Your session expired. Please sign in again." }, 401);

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors }, 400);
    const { courseId, kind, weekNumber, difficulty, bloomLevel, language } = parsed.data;
    const count = kind === "coding" ? Math.min(parsed.data.count, 3) : parsed.data.count;

    const { data: member } = await admin.rpc("is_course_member", { _course_id: courseId, _user_id: u.user.id });
    if (!member) return json({ error: "Not authorised for this course." }, 403);

    const [{ data: course }, { data: week }, { data: concepts }, { data: existing }] = await Promise.all([
      admin.from("courses").select("name, course_code").eq("id", courseId).maybeSingle(),
      admin.from("lesson_plan_weeks").select("week_number, week_name, overview, concepts").eq("course_id", courseId).eq("week_number", weekNumber).maybeSingle(),
      admin.from("concepts").select("id, concept_code").eq("course_id", courseId),
      admin.from("practice_pool_questions").select("question, title, concept_code").eq("course_id", courseId).neq("status", "archived").limit(1000),
    ]);
    if (!week) return json({ error: `Week ${weekNumber} isn't in the lesson plan.` }, 400);
    const conceptList = (concepts ?? []).map((c) => c.concept_code);
    if (!conceptList.length) return json({ error: "Confirm course concepts before generating practice questions." }, 400);
    const weekConcepts = (Array.isArray(week.concepts) ? week.concepts : [])
      .map((c: any) => (typeof c === "string" ? c : c?.name ?? c?.concept ?? c?.title ?? ""))
      .filter(Boolean);
    const conceptIdByCode = new Map((concepts ?? []).map((c) => [c.concept_code.toLowerCase(), c.id]));
    const avoid = (existing ?? []).slice(-60).map((e) => `- ${(e.title ?? e.question).slice(0, 120)}`).join("\n");

    const shared = `Course: "${course?.name ?? ""}" (${course?.course_code ?? ""}).
Week ${week.week_number}: ${week.week_name ?? ""}
Week overview: ${week.overview ?? "(none)"}
Topics taught this week: ${weekConcepts.join("; ") || "(see overview)"}
ALLOWED concept_codes (every item's concept_code MUST be one of these, verbatim, and must relate to this week's topics): ${JSON.stringify(conceptList)}
Difficulty: ${DIFF[difficulty]}.
Already in the pool — do NOT repeat or closely paraphrase:
${avoid || "(none)"}`;

    const existingDedup: DedupItem[] = (existing ?? []).map((e) => ({
      content_text: e.title ? `${e.title} ${e.question}` : e.question,
      answer: "",
      topic: e.concept_code ?? "",
    }));

    const rows: any[] = [];
    const privs: any[] = [];
    const rejected: string[] = [];

    if (kind === "non_coding") {
      const out = await callAI(
        `You write practice questions for a university/upskilling course. Output JSON {"questions":[...]} only. Each item: {"format":"mcq"|"true_false"|"short_answer","question":string,"options":string[] (mcq: exactly 4; true_false: ["True","False"]; short_answer: omit),"answer":string (mcq: verbatim option text; tf: "True"/"False"; short: concise reference ≤30 words),"model_answer":string (short only, 2-4 sentences),"answer_max_words":integer (short only, 40-80),"explanation":string (1-3 sentences),"concept_code":string,"bloom_level":1-6,"difficulty":0-1}. Format mix: ~60% mcq, ~20% true_false, ~20% short_answer. Distinct stems, realistic distractors, vary correct option position.`,
        `${shared}\nGenerate exactly ${count} questions.`,
      );
      const items = (Array.isArray(out?.questions) ? out.questions : []).map((q: any) => {
        const format = String(q.format ?? "").toLowerCase();
        const question = String(q.question ?? "").trim();
        const answer = String(q.answer ?? "").trim();
        const options = Array.isArray(q.options) ? q.options.map((o: any) => String(o).trim()).filter(Boolean) : [];
        const code = conceptList.find((c) => c.toLowerCase() === String(q.concept_code ?? "").toLowerCase());
        let reason = "";
        if (!question || !answer) reason = "missing question/answer";
        else if (!code) reason = "concept not in course";
        else if (format === "mcq" && (options.length !== 4 || new Set(options).size !== 4 || !options.includes(answer))) reason = "bad mcq options";
        else if (format === "true_false" && !["True", "False"].includes(answer)) reason = "bad true/false answer";
        else if (!["mcq", "true_false", "short_answer"].includes(format)) reason = "unknown format";
        if (reason) {
          rejected.push(reason);
          return null;
        }
        return {
          content_text: question,
          answer,
          topic: code!,
          format,
          options: format === "mcq" ? options : format === "true_false" ? ["True", "False"] : null,
          model_answer: format === "short_answer" ? String(q.model_answer ?? "") || null : null,
          answer_max_words: format === "short_answer" ? clamp(q.answer_max_words, 20, 150, 60) : null,
          explanation: String(q.explanation ?? ""),
          bloom: Math.round(clamp(q.bloom_level, 1, 6, 2)),
          difficulty: clamp(q.difficulty, 0, 1, 0.5),
        };
      }).filter(Boolean) as any[];
      const { kept, rejected: dups } = dedupWithin(items, existingDedup);
      dups.forEach(() => rejected.push("duplicate"));
      for (const it of kept) {
        const id = crypto.randomUUID();
        rows.push({
          id, course_id: courseId, kind, format: it.format, concept_code: it.topic,
          concept_id: conceptIdByCode.get(it.topic.toLowerCase()) ?? null, week_number: weekNumber,
          bloom_level: it.bloom, difficulty: it.difficulty, question: it.content_text, options: it.options,
          status: "draft", created_by: u.user.id,
        });
        privs.push({ question_id: id, answer: it.answer, model_answer: it.model_answer, answer_max_words: it.answer_max_words, explanation: it.explanation });
      }
    } else {
      const out = await callAI(
        `You write small runnable ${language} coding practice problems (stdin → stdout) for students. Output JSON {"exercises":[...]} only. Each: {"title":string,"problem_statement":string,"input_spec":string,"output_spec":string,"constraints":string,"starter_code":string (skeleton reading stdin, no solution),"reference_solution":string (complete, correct ${language} program reading stdin and printing to stdout),"visible_tests":[{"input":string,"expected_output":string}] (2-3),"hidden_tests":[{"input":string,"expected_output":string}] (3-5, include edge cases),"concept_code":string,"bloom_level":${bloomLevel},"difficulty":0-1}. Every exercise MUST be written at Bloom's taxonomy level ${bloomLevel} (${BLOOM_DESC[bloomLevel]}) — the task, scenario, and test complexity must match that level. Each exercise must use a clearly different scenario/theme. Expected outputs must be exactly what the reference solution prints.`,
        `${shared}\nGenerate exactly ${count} exercises.`,
      );
      const items = Array.isArray(out?.exercises) ? out.exercises : [];
      const candidates = items.map((e: any) => ({
        e,
        content_text: `${e.title ?? ""} ${e.problem_statement ?? ""}`,
        answer: "",
        topic: String(e.concept_code ?? ""),
      }));
      const { kept, rejected: dups } = dedupWithin(candidates, existingDedup);
      dups.forEach(() => rejected.push("duplicate"));
      await Promise.all(kept.map(async ({ e }: any) => {
        const code = conceptList.find((c) => c.toLowerCase() === String(e.concept_code ?? "").toLowerCase());
        const visible = asCases(e.visible_tests);
        const hidden = asCases(e.hidden_tests);
        const sol = String(e.reference_solution ?? "");
        if (!code || !e.title || !e.problem_statement || !sol || visible.length === 0) {
          rejected.push("incomplete exercise");
          return;
        }
        const report: any[] = [];
        for (const c of [...visible, ...hidden]) {
          try {
            const r = await runOnJudge0(language, sol, c.input);
            report.push({ verdict: judgeVerdict(r, c.expected_output) });
          } catch {
            report.push({ verdict: "error" });
          }
        }
        if (report.some((r) => r.verdict !== "passed")) {
          rejected.push("reference solution failed its tests");
          return;
        }
        const id = crypto.randomUUID();
        rows.push({
          id, course_id: courseId, kind, format: "coding", concept_code: code,
          concept_id: conceptIdByCode.get(code.toLowerCase()) ?? null, week_number: weekNumber,
          bloom_level: bloomLevel, difficulty: DIFF_VALUE[difficulty] ?? clamp(e.difficulty, 0, 1, 0.5),
          title: String(e.title), question: String(e.problem_statement), language,
          starter_code: String(e.starter_code ?? ""), input_spec: String(e.input_spec ?? ""),
          output_spec: String(e.output_spec ?? ""), constraints: String(e.constraints ?? ""),
          standard_test_cases: visible, status: "draft", created_by: u.user.id,
        });
        privs.push({ question_id: id, reference_solution: sol, hidden_test_cases: hidden, validation_report: { cases: report, validated_at: new Date().toISOString() } });
      }));
    }

    if (rows.length) {
      const { error: e1 } = await admin.from("practice_pool_questions").insert(rows);
      if (e1) throw e1;
      const { error: e2 } = await admin.from("practice_pool_private").insert(privs);
      if (e2) throw e2;
    }
    return json({ created: rows.length, rejected: rejected.length, reasons: [...new Set(rejected)] });
  } catch (e) {
    console.error(`[${FUNCTION_NAME}]`, e);
    return json({ error: e instanceof Error ? e.message : "Generation failed" }, 500);
  }
});
