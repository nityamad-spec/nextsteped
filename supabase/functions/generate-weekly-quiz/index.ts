import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Tier = "standard" | "easy" | "medium" | "hard";

interface TierSpec {
  tier: Tier;
  count: number;
  difficulty: number;
  label: string;
}

const TIER_SPEC: TierSpec[] = [
  { tier: "standard", count: 5, difficulty: 0.5, label: "Standard tier (common to all students, medium difficulty)" },
  { tier: "easy", count: 5, difficulty: 0.2, label: "Easy adaptive tier (for struggling students)" },
  { tier: "medium", count: 5, difficulty: 0.5, label: "Medium adaptive tier (for average students)" },
  { tier: "hard", count: 5, difficulty: 0.85, label: "Hard adaptive tier (for advanced students)" },
];

const MAX_ATTEMPTS = 3;
const MODEL = "google/gemini-2.5-flash";

interface GeneratedQuestion {
  content_text: string;
  format: "mcq" | "true_false";
  options: string[];
  answer: string;
  difficulty_estimate: number;
  bloom_level: number;
  explanation: string;
  topic: string;
}

interface ConceptRow {
  id: string;
  concept_code: string;
}

function validateQuestion(
  q: any,
  spec: TierSpec,
  conceptByCode: Record<string, ConceptRow>,
): { ok: true; q: GeneratedQuestion } | { ok: false; reason: string } {
  if (!q || typeof q !== "object") return { ok: false, reason: "not an object" };
  const format = q.format;
  if (format !== "mcq" && format !== "true_false") return { ok: false, reason: `bad format ${format}` };

  const content = typeof q.content_text === "string" ? q.content_text.trim() : "";
  if (!content || content.length > 600) return { ok: false, reason: "bad content_text" };

  let options: string[];
  if (format === "mcq") {
    if (!Array.isArray(q.options) || q.options.length !== 4) return { ok: false, reason: "mcq needs 4 options" };
    options = q.options.map((o: any) => String(o ?? "").trim());
    if (options.some((o) => !o)) return { ok: false, reason: "empty option" };
    if (new Set(options).size !== 4) return { ok: false, reason: "duplicate options" };
  } else {
    options = ["True", "False"];
  }

  const answer = typeof q.answer === "string" ? q.answer.trim() : "";
  if (!options.includes(answer)) return { ok: false, reason: "answer not in options" };

  const rawTopic = typeof q.topic === "string" ? q.topic.trim() : "";
  let canonical: string | null = null;
  if (rawTopic in conceptByCode) canonical = rawTopic;
  else {
    const lower = rawTopic.toLowerCase();
    for (const code of Object.keys(conceptByCode)) {
      if (code.toLowerCase() === lower) { canonical = code; break; }
    }
  }
  if (!canonical) return { ok: false, reason: `topic '${rawTopic}' not in week concepts` };

  let diff = Number(q.difficulty_estimate);
  if (!Number.isFinite(diff)) diff = spec.difficulty;
  diff = Math.max(0, Math.min(1, diff));

  const bloom = Math.round(Number(q.bloom_level));
  const bloomSafe = Number.isInteger(bloom) && bloom >= 1 && bloom <= 6 ? bloom : 2;

  const explanation = typeof q.explanation === "string" ? q.explanation.trim() : "";
  if (!explanation) return { ok: false, reason: "empty explanation" };

  return {
    ok: true,
    q: {
      content_text: content,
      format,
      options,
      answer,
      difficulty_estimate: diff,
      bloom_level: bloomSafe,
      explanation,
      topic: canonical,
    },
  };
}

async function generateTier(
  spec: TierSpec,
  courseName: string,
  weekNumber: number,
  weekName: string,
  conceptByCode: Record<string, ConceptRow>,
  lovableKey: string,
): Promise<GeneratedQuestion[]> {
  const conceptList = Object.keys(conceptByCode).map((c) => `  - ${c}`).join("\n");
  const accepted: GeneratedQuestion[] = [];
  let retryHint: string | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && accepted.length < spec.count; attempt++) {
    const need = spec.count - accepted.length;

    const systemPrompt = `You are an expert assessment designer for a course titled "${courseName}". Generate exactly ${need} ${spec.tier}-tier WEEKLY QUIZ questions for Week ${weekNumber}${weekName ? ` — ${weekName}` : ""}.

Tier: ${spec.label}
Target difficulty (0=easy, 1=hard): ${spec.difficulty}

CONCEPTS for this week — the 'topic' field of each question MUST be one of these exact concept codes (case-sensitive):
${conceptList}

STRICT RULES:
- Each question MUST be either multiple-choice (format="mcq") or true/false (format="true_false"). NO short answer, NO problem solving.
- MCQ: exactly 4 distinct non-empty options (no "A)" prefixes). 'answer' is the FULL TEXT of the correct option.
- True/False: options MUST be exactly ["True", "False"]. 'answer' must be "True" or "False".
- difficulty_estimate: number near ${spec.difficulty} (±0.15).
- bloom_level: integer 1-6.
- content_text: question stem only, ≤ 600 chars.
- explanation: 1-2 sentences explaining the correct answer.
- topic: MUST exactly match one of the concept codes above.
- Distribute questions across the listed concepts (don't pile all on one).${retryHint ? `\n\nRETRY CONTEXT: ${retryHint}` : ""}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(300_000),
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate ${need} ${spec.tier}-tier questions now.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "submit_questions",
            description: "Submit weekly quiz questions",
            parameters: {
              type: "object",
              properties: {
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      content_text: { type: "string" },
                      format: { type: "string", enum: ["mcq", "true_false"] },
                      options: { type: "array", items: { type: "string" } },
                      answer: { type: "string" },
                      difficulty_estimate: { type: "number" },
                      bloom_level: { type: "integer", minimum: 1, maximum: 6 },
                      explanation: { type: "string" },
                      topic: { type: "string" },
                    },
                    required: ["content_text", "format", "options", "answer", "difficulty_estimate", "bloom_level", "explanation", "topic"],
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
      const txt = await response.text();
      if (response.status === 429) throw new Error("Rate limited by AI gateway");
      if (response.status === 402) throw new Error("AI credits exhausted");
      throw new Error(`AI gateway error ${response.status}: ${txt.slice(0, 200)}`);
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) { retryHint = "no tool call returned"; continue; }
    let parsed: any;
    try { parsed = JSON.parse(toolCall.function.arguments); } catch { retryHint = "invalid JSON"; continue; }
    const arr: any[] = Array.isArray(parsed?.questions) ? parsed.questions : [];

    const rejects: string[] = [];
    for (const q of arr) {
      if (accepted.length >= spec.count) break;
      const v = validateQuestion(q, spec, conceptByCode);
      if (!v.ok) { rejects.push(v.reason); continue; }
      const key = v.q.content_text.slice(0, 120).toLowerCase();
      if (accepted.some((a) => a.content_text.slice(0, 120).toLowerCase() === key)) continue;
      accepted.push(v.q);
    }
    if (accepted.length < spec.count && rejects.length) {
      retryHint = `Previous attempt had ${rejects.length} rejected questions. Reasons: ${rejects.slice(0, 3).join("; ")}`;
    }
  }

  if (accepted.length < spec.count) {
    throw new Error(`Only generated ${accepted.length}/${spec.count} valid ${spec.tier}-tier questions after ${MAX_ATTEMPTS} attempts`);
  }
  return accepted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json();
    const courseId = typeof body?.course_id === "string" ? body.course_id : null;
    const weekNumber = Number(body?.week_number);
    if (!courseId || !Number.isInteger(weekNumber) || weekNumber < 1) {
      return new Response(JSON.stringify({ error: "course_id and week_number required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Authorize: must be course teacher or collaborator (or admin)
    const { data: course } = await admin
      .from("courses")
      .select("id, name, teacher_id")
      .eq("id", courseId)
      .maybeSingle();
    if (!course) {
      return new Response(JSON.stringify({ error: "Course not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let allowed = course.teacher_id === userId;
    if (!allowed) {
      const { data: ct } = await admin.from("course_teachers").select("teacher_id")
        .eq("course_id", courseId).eq("teacher_id", userId).maybeSingle();
      allowed = !!ct;
    }
    if (!allowed) {
      const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
      allowed = prof?.role === "admin";
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load week + concept names for the week
    const { data: weekRow } = await admin
      .from("lesson_plan_weeks")
      .select("week_name, concepts")
      .eq("course_id", courseId)
      .eq("week_number", weekNumber)
      .maybeSingle();
    if (!weekRow) {
      return new Response(JSON.stringify({ error: `No lesson-plan week ${weekNumber} for this course` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const weekConceptNames: string[] = Array.isArray(weekRow.concepts)
      ? (weekRow.concepts as any[]).map((c) => String(c?.name ?? "").trim()).filter(Boolean)
      : [];
    if (weekConceptNames.length === 0) {
      return new Response(JSON.stringify({ error: "This week has no concepts. Add concepts first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map concept names → concept rows (id + canonical code) via concepts table
    const { data: conceptRows } = await admin
      .from("concepts")
      .select("id, concept_code")
      .eq("course_id", courseId)
      .in("concept_code", weekConceptNames);
    const conceptByCode: Record<string, ConceptRow> = {};
    for (const r of conceptRows ?? []) conceptByCode[r.concept_code] = r as ConceptRow;
    if (Object.keys(conceptByCode).length === 0) {
      return new Response(JSON.stringify({ error: "Week concepts are not registered in the course concept list. Confirm them in Concept Review." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate all tiers in parallel (sequential = 4× latency, blows past 150s edge limit)
    const allQuestions: { spec: TierSpec; q: GeneratedQuestion }[] = [];
    const tierResults = await Promise.all(
      TIER_SPEC.map((spec) =>
        generateTier(spec, course.name ?? "Course", weekNumber, weekRow.week_name ?? "", conceptByCode, lovableKey)
          .then((qs) => ({ spec, qs })),
      ),
    );
    for (const { spec, qs } of tierResults) {
      for (const q of qs) allQuestions.push({ spec, q });
    }

    // Replace existing rows for this week
    await admin
      .from("assessment_questions")
      .delete()
      .eq("course_id", courseId)
      .eq("mode", "daily_quiz")
      .eq("quiz_day", weekNumber);

    const rows = allQuestions.map(({ spec, q }, i) => {
      const concept = conceptByCode[q.topic];
      const correctIndex = q.options.indexOf(q.answer);
      return {
        course_id: courseId,
        teacher_id: course.teacher_id,
        mode: "daily_quiz",
        quiz_day: weekNumber,
        tier: spec.tier,
        question_type: q.format === "mcq" ? "MCQ" : "True/False",
        format: q.format,
        question_text: q.content_text,
        options: q.options,
        answer: q.answer,
        correct_index: correctIndex,
        explanation: q.explanation,
        topic: q.topic,
        concept_id: concept.id,
        difficulty: q.difficulty_estimate < 0.35 ? "Easy" : q.difficulty_estimate > 0.7 ? "Hard" : "Medium",
        difficulty_estimate: q.difficulty_estimate,
        bloom_level: q.bloom_level,
        item_code: `w${weekNumber}-${spec.tier}-${i}`,
      };
    });

    const { error: insErr } = await admin.from("assessment_questions").insert(rows);
    if (insErr) throw new Error(`Insert failed: ${insErr.message}`);

    const byTier: Record<string, number> = {};
    for (const { spec } of allQuestions) byTier[spec.tier] = (byTier[spec.tier] ?? 0) + 1;

    return new Response(JSON.stringify({ ok: true, generated: rows.length, by_tier: byTier }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-weekly-quiz error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
