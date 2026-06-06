import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TierName = "standard" | "easy" | "medium" | "hard";

interface TierSpec {
  tier: TierName;
  count: number;
  difficulty: number; // 0..1
  difficultyLabel: "Easy" | "Medium" | "Hard";
  description: string;
}

const TIER_SPECS: TierSpec[] = [
  { tier: "standard", count: 5, difficulty: 0.5, difficultyLabel: "Medium", description: "baseline (medium difficulty, common to all students)" },
  { tier: "easy",     count: 5, difficulty: 0.25, difficultyLabel: "Easy",   description: "easy adaptive (for students who struggled on Phase A)" },
  { tier: "medium",   count: 5, difficulty: 0.55, difficultyLabel: "Medium", description: "medium adaptive (for average students)" },
  { tier: "hard",     count: 5, difficulty: 0.8,  difficultyLabel: "Hard",   description: "hard adaptive (for advanced students)" },
];

const MODEL = "google/gemini-2.5-flash";
const MAX_ATTEMPTS = 3;

interface ConceptInfo {
  id: string;
  code: string;
  name?: string;
}

interface GeneratedQuestion {
  content_text: string;
  options: string[];
  answer: string;
  explanation: string;
  topic: string;
}

interface ValidatedQuestion extends GeneratedQuestion {}

function validate(q: any, conceptByCode: Record<string, ConceptInfo>): { ok: true; q: ValidatedQuestion } | { ok: false; reason: string } {
  if (!q || typeof q !== "object") return { ok: false, reason: "not object" };
  const content = typeof q.content_text === "string" ? q.content_text.trim() : "";
  if (!content) return { ok: false, reason: "empty content_text" };
  if (content.length > 600) return { ok: false, reason: "content_text too long" };

  if (!Array.isArray(q.options) || q.options.length !== 4) return { ok: false, reason: "options must be exactly 4" };
  const opts = q.options.map((o: any) => (typeof o === "string" ? o.trim() : ""));
  if (opts.some((o: string) => !o)) return { ok: false, reason: "empty option" };
  if (new Set(opts).size !== 4) return { ok: false, reason: "duplicate options" };

  const answer = typeof q.answer === "string" ? q.answer.trim() : "";
  if (!answer || !opts.includes(answer)) return { ok: false, reason: "answer not in options" };

  const explanation = typeof q.explanation === "string" ? q.explanation.trim() : "";
  if (!explanation) return { ok: false, reason: "empty explanation" };

  const rawTopic = typeof q.topic === "string" ? q.topic.trim() : "";
  if (!rawTopic) return { ok: false, reason: "empty topic" };
  let canonical: string | null = null;
  if (conceptByCode[rawTopic]) canonical = rawTopic;
  else {
    const lower = rawTopic.toLowerCase();
    for (const code of Object.keys(conceptByCode)) {
      if (code.toLowerCase() === lower) { canonical = code; break; }
    }
  }
  if (!canonical) return { ok: false, reason: `topic '${rawTopic}' not in week concepts` };

  return { ok: true, q: { content_text: content, options: opts, answer, explanation, topic: canonical } };
}

async function callGateway(
  spec: TierSpec,
  needed: number,
  courseName: string,
  weekName: string,
  conceptList: ConceptInfo[],
  lovableKey: string,
  retryHint: string | null,
): Promise<any[]> {
  const conceptBlock = conceptList
    .map((c) => `  - ${c.code}${c.name && c.name !== c.code ? ` (${c.name})` : ""}`)
    .join("\n");

  const systemPrompt = `You are an expert assessment designer creating a weekly quiz for the course "${courseName}".
This batch is for "${weekName}" — generate exactly ${needed} multiple-choice question(s) for the ${spec.tier} tier (${spec.description}).

Target difficulty (0=trivial, 1=very hard): ${spec.difficulty}.

Each question MUST cover one of the concepts taught this week. The 'topic' field MUST be one of these concept codes (exact, case-sensitive):
${conceptBlock}

STRICT RULES:
- format is implicitly multiple-choice (MCQ); produce exactly 4 distinct non-empty options (no "A)" prefixes).
- 'answer' MUST equal one of the options character-for-character.
- 'topic' MUST be one of the concept codes above.
- 'content_text' is the question stem only, ≤ 600 chars, no embedded options.
- 'explanation' is a 1-2 sentence rationale for why the correct option is correct.
- Difficulty should match the ${spec.tier} tier (${spec.difficultyLabel}).
${retryHint ? `\nRETRY CONTEXT: ${retryHint}` : ""}`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate ${needed} ${spec.tier} tier MCQ(s) for ${weekName} now.` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "submit_questions",
          description: "Submit the generated weekly quiz questions",
          parameters: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    content_text: { type: "string" },
                    options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                    answer: { type: "string" },
                    explanation: { type: "string" },
                    topic: { type: "string" },
                  },
                  required: ["content_text", "options", "answer", "explanation", "topic"],
                },
              },
            },
            required: ["questions"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "submit_questions" } },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate limited (429) — please try again in a moment.");
    if (response.status === 402) throw new Error("Lovable AI credits exhausted (402).");
    const t = await response.text();
    throw new Error(`AI gateway ${response.status}: ${t.slice(0, 200)}`);
  }
  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error(`No tool call returned for ${spec.tier}`);
  const args = JSON.parse(toolCall.function.arguments);
  return Array.isArray(args.questions) ? args.questions : [];
}

async function runTier(
  spec: TierSpec,
  needed: number,
  courseName: string,
  weekName: string,
  concepts: ConceptInfo[],
  conceptByCode: Record<string, ConceptInfo>,
  lovableKey: string,
): Promise<{ accepted: ValidatedQuestion[]; reasons: string[] }> {
  const accepted: ValidatedQuestion[] = [];
  const reasons: string[] = [];
  let attempts = 0;
  let hint: string | null = null;
  while (accepted.length < needed && attempts < MAX_ATTEMPTS) {
    attempts++;
    const remaining = needed - accepted.length;
    let batch: any[] = [];
    try {
      batch = await callGateway(spec, remaining, courseName, weekName, concepts, lovableKey, hint);
    } catch (e) {
      reasons.push(`gateway: ${(e as Error).message.slice(0, 120)}`);
      continue;
    }
    let invalidThisAttempt = 0;
    for (const raw of batch) {
      const v = validate(raw, conceptByCode);
      if (!v.ok) {
        reasons.push(v.reason);
        invalidThisAttempt++;
        continue;
      }
      // Light dedup vs already-accepted
      const key = v.q.content_text.slice(0, 100).toLowerCase();
      if (accepted.some((a) => a.content_text.slice(0, 100).toLowerCase() === key)) {
        reasons.push("duplicate");
        invalidThisAttempt++;
        continue;
      }
      accepted.push(v.q);
      if (accepted.length >= needed) break;
    }
    hint = invalidThisAttempt > 0
      ? `Previous batch had ${invalidThisAttempt} invalid item(s). Common issues: ${[...new Set(reasons)].slice(0, 3).join("; ")}.`
      : null;
  }
  return { accepted, reasons: [...new Set(reasons)].slice(0, 5) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const courseId: string | undefined = body.courseId;
    const quizDay: number | undefined = body.quizDay;
    const regenerate: boolean = !!body.regenerate;

    if (!courseId || !quizDay) {
      return new Response(JSON.stringify({ error: "courseId and quizDay are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const [{ data: course, error: cErr }, { data: allConcepts }, { data: weekRow }] = await Promise.all([
      admin.from("courses").select("id, name, teacher_id, course_code").eq("id", courseId).maybeSingle(),
      admin.from("concepts").select("id, concept_code, concept_name").eq("course_id", courseId),
      admin.from("lesson_plan_weeks").select("week_number, week_name, concepts").eq("course_id", courseId).eq("week_number", quizDay).maybeSingle(),
    ]);

    if (cErr || !course) {
      return new Response(JSON.stringify({ error: "Course not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!allConcepts || allConcepts.length === 0) {
      return new Response(JSON.stringify({ error: "No concepts found for this course. Generate the lesson plan/concepts first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve which concepts belong to this week. Match by name (case-insensitive)
    // against lesson_plan_weeks.concepts[].name. If none match, fall back to all
    // course concepts so we still produce questions.
    const courseConceptByCodeLc: Record<string, ConceptInfo> = {};
    const courseConceptByNameLc: Record<string, ConceptInfo> = {};
    for (const c of allConcepts as any[]) {
      const info: ConceptInfo = { id: c.id, code: c.concept_code, name: c.concept_name ?? c.concept_code };
      courseConceptByCodeLc[c.concept_code.toLowerCase()] = info;
      courseConceptByNameLc[(c.concept_name ?? c.concept_code).toLowerCase()] = info;
    }

    let weekConcepts: ConceptInfo[] = [];
    if (weekRow && Array.isArray(weekRow.concepts)) {
      for (const item of weekRow.concepts as any[]) {
        const name = typeof item?.name === "string" ? item.name.trim() : "";
        if (!name) continue;
        const hit = courseConceptByCodeLc[name.toLowerCase()] || courseConceptByNameLc[name.toLowerCase()];
        if (hit && !weekConcepts.find((c) => c.code === hit.code)) weekConcepts.push(hit);
      }
    }
    if (weekConcepts.length === 0) {
      // fall back to all course concepts
      weekConcepts = Object.values(courseConceptByCodeLc);
    }
    const conceptByCode: Record<string, ConceptInfo> = {};
    for (const c of weekConcepts) conceptByCode[c.code] = c;

    const weekName = weekRow?.week_name || `Week ${quizDay}`;

    // Check existing counts per tier
    const { data: existing } = await admin
      .from("assessment_questions")
      .select("id, tier")
      .eq("course_id", courseId)
      .eq("mode", "daily_quiz")
      .eq("quiz_day", quizDay);

    const existingByTier: Record<string, number> = { standard: 0, easy: 0, medium: 0, hard: 0 };
    for (const r of existing || []) {
      const t = (r as any).tier as string;
      if (t in existingByTier) existingByTier[t]++;
    }

    if (regenerate) {
      await admin.from("assessment_questions")
        .delete()
        .eq("course_id", courseId)
        .eq("mode", "daily_quiz")
        .eq("quiz_day", quizDay);
      for (const k of Object.keys(existingByTier)) existingByTier[k] = 0;
    }

    // Run tiers that still need more questions
    const tasks = TIER_SPECS.map(async (spec) => {
      const need = spec.count - (existingByTier[spec.tier] || 0);
      if (need <= 0) return { spec, accepted: [], reasons: [], skipped: true };
      const { accepted, reasons } = await runTier(spec, need, course.name, weekName, weekConcepts, conceptByCode, lovableKey);
      return { spec, accepted, reasons, skipped: false };
    });
    const settled = await Promise.allSettled(tasks);

    const breakdown: any[] = [];
    const rows: any[] = [];
    let counter = (existing?.length || 0) + 1;
    for (let i = 0; i < settled.length; i++) {
      const spec = TIER_SPECS[i];
      const r = settled[i];
      if (r.status !== "fulfilled") {
        breakdown.push({ tier: spec.tier, accepted: 0, requested: spec.count, error: (r.reason as Error)?.message?.slice(0, 200) });
        continue;
      }
      breakdown.push({
        tier: spec.tier,
        existing: existingByTier[spec.tier],
        accepted: r.value.accepted.length,
        requested: spec.count,
        skipped: r.value.skipped,
        sampleReasons: r.value.reasons,
      });
      for (const q of r.value.accepted) {
        const concept = conceptByCode[q.topic];
        if (!concept) continue;
        rows.push({
          course_id: course.id,
          teacher_id: course.teacher_id,
          mode: "daily_quiz",
          quiz_day: quizDay,
          tier: spec.tier,
          question_type: "MCQ",
          format: "mcq",
          question_text: q.content_text,
          options: q.options,
          answer: q.answer,
          correct_index: q.options.indexOf(q.answer),
          explanation: q.explanation,
          topic: concept.code,
          concept_id: concept.id,
          difficulty: spec.difficultyLabel,
          difficulty_estimate: spec.difficulty,
          bloom_level: spec.tier === "easy" ? 2 : spec.tier === "hard" ? 4 : 3,
          in_test: true,
          is_distractor: false,
          item_code: `${course.course_code || "Q"}-W${quizDay}-${spec.tier.toUpperCase()}-${String(counter++).padStart(3, "0")}`,
        });
      }
    }

    if (rows.length > 0) {
      const { error: insertErr } = await admin.from("assessment_questions").insert(rows);
      if (insertErr) throw insertErr;
    }

    // Recount post-insert
    const { data: finalRows } = await admin
      .from("assessment_questions")
      .select("tier")
      .eq("course_id", courseId)
      .eq("mode", "daily_quiz")
      .eq("quiz_day", quizDay);
    const finalByTier: Record<string, number> = { standard: 0, easy: 0, medium: 0, hard: 0 };
    for (const r of finalRows || []) {
      const t = (r as any).tier as string;
      if (t in finalByTier) finalByTier[t]++;
    }
    const total = Object.values(finalByTier).reduce((a, b) => a + b, 0);
    const complete = TIER_SPECS.every((s) => finalByTier[s.tier] >= s.count);

    return new Response(JSON.stringify({
      message: `Week ${quizDay}: ${rows.length} new question(s) generated; ${total} total in bank.`,
      complete,
      finalByTier,
      breakdown,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("generate-weekly-quiz error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
