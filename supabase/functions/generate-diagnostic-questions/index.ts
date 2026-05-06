import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GeneratedQuestion {
  content_text: string;
  format: string;
  options: string[] | null;
  answer: string;
  difficulty_estimate: number;
  bloom_level: number;
  explanation: string;
  topic: string;
}

interface TierSpec {
  tier: "standard" | "easy" | "medium" | "hard";
  count: number;
  difficulty: number;
  label: string;
}

const TIER_SPEC: TierSpec[] = [
  { tier: "standard", count: 5, difficulty: 0.5, label: "Standard (medium difficulty, common to all students)" },
  { tier: "easy", count: 5, difficulty: 0.2, label: "Easy adaptive tier (for struggling students)" },
  { tier: "medium", count: 5, difficulty: 0.5, label: "Medium adaptive tier (for average students)" },
  { tier: "hard", count: 5, difficulty: 0.85, label: "Hard adaptive tier (for advanced students)" },
];

const MAX_ATTEMPTS = 3;
const MODEL = "google/gemini-2.5-flash";

interface ValidatedQuestion extends GeneratedQuestion {
  format: "mcq";
  options: string[];
}

type ValidationResult =
  | { ok: true; normalized: ValidatedQuestion }
  | { ok: false; reason: string };

function validateMcq(
  q: GeneratedQuestion,
  spec: TierSpec,
  conceptByCode: Record<string, string>,
): ValidationResult {
  if (!q || typeof q !== "object") return { ok: false, reason: "not an object" };
  if (q.format !== "mcq") return { ok: false, reason: `format != mcq (${q.format})` };

  const content = typeof q.content_text === "string" ? q.content_text.trim() : "";
  if (!content) return { ok: false, reason: "empty content_text" };
  if (content.length > 600) return { ok: false, reason: "content_text > 600 chars" };

  if (!Array.isArray(q.options) || q.options.length !== 4) {
    return { ok: false, reason: "options must be array of exactly 4" };
  }
  const opts = q.options.map((o) => (typeof o === "string" ? o.trim() : ""));
  if (opts.some((o) => !o)) return { ok: false, reason: "empty option" };
  if (new Set(opts).size !== 4) return { ok: false, reason: "duplicate options" };

  const answer = typeof q.answer === "string" ? q.answer.trim() : "";
  if (!answer) return { ok: false, reason: "empty answer" };
  const matches = opts.filter((o) => o === answer);
  if (matches.length !== 1) return { ok: false, reason: "answer not in options" };

  const topic = typeof q.topic === "string" ? q.topic.trim() : "";
  if (!topic || !(topic in conceptByCode)) {
    return { ok: false, reason: "topic not in concept list" };
  }

  let diff = Number(q.difficulty_estimate);
  if (!Number.isFinite(diff)) return { ok: false, reason: "difficulty not numeric" };
  diff = Math.max(0, Math.min(1, diff));
  if (diff < spec.difficulty - 0.2 || diff > spec.difficulty + 0.2) {
    return { ok: false, reason: `difficulty ${diff.toFixed(2)} outside band` };
  }

  const bloom = Math.round(Number(q.bloom_level));
  if (!Number.isInteger(bloom) || bloom < 1 || bloom > 6) {
    return { ok: false, reason: "bloom_level out of range" };
  }

  const explanation = typeof q.explanation === "string" ? q.explanation.trim() : "";
  if (!explanation) return { ok: false, reason: "empty explanation" };

  return {
    ok: true,
    normalized: {
      content_text: content,
      format: "mcq",
      options: opts,
      answer,
      difficulty_estimate: diff,
      bloom_level: bloom,
      explanation,
      topic,
    },
  };
}

function isDuplicate(q: ValidatedQuestion, accepted: ValidatedQuestion[]): boolean {
  const key = q.content_text.slice(0, 120).toLowerCase();
  return accepted.some(
    (a) => a.content_text.slice(0, 120).toLowerCase() === key,
  );
}

async function callGateway(
  spec: TierSpec,
  needed: number,
  courseName: string,
  conceptList: string,
  lovableKey: string,
  retryHint: string | null,
): Promise<GeneratedQuestion[]> {
  const systemPrompt = `You are an expert assessment designer creating diagnostic quiz questions for a course titled "${courseName}". Generate exactly ${needed} ${spec.tier} tier diagnostic questions.

Tier: ${spec.label}
Target difficulty (0=easy, 1=hard): ${spec.difficulty}

Available concepts (use concept_code values from this list as the topic field): ${conceptList}

STRICT RULES:
- ALL questions MUST be multiple-choice (format = "mcq"). Do NOT generate true_false or short_answer.
- Each question MUST have exactly 4 distinct, non-empty options in the options array (no letter prefixes like "A)").
- The answer field MUST be the FULL TEXT of one of the 4 options, character-for-character identical.
- The topic field MUST be one of the concept_code values listed above (exact match).
- difficulty_estimate must be a number close to ${spec.difficulty} (within ±0.15).
- bloom_level: integer 1-6 (1=Remember, 2=Understand, 3=Apply, 4=Analyze, 5=Evaluate, 6=Create).
- content_text: the question stem only, ≤ 600 characters, no embedded options.
- explanation: 1-2 sentences explaining why the correct option is correct.${retryHint ? `\n\nRETRY CONTEXT: ${retryHint}` : ""}`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate ${needed} ${spec.tier} tier MCQ diagnostic questions now.` },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "submit_questions",
            description: "Submit the generated diagnostic MCQ questions",
            parameters: {
              type: "object",
              properties: {
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      content_text: { type: "string" },
                      format: { type: "string", enum: ["mcq"] },
                      options: {
                        type: "array",
                        items: { type: "string" },
                        minItems: 4,
                        maxItems: 4,
                      },
                      answer: { type: "string" },
                      difficulty_estimate: { type: "number" },
                      bloom_level: { type: "integer", minimum: 1, maximum: 6 },
                      explanation: { type: "string" },
                      topic: { type: "string" },
                    },
                    required: [
                      "content_text",
                      "format",
                      "options",
                      "answer",
                      "difficulty_estimate",
                      "bloom_level",
                      "explanation",
                      "topic",
                    ],
                  },
                },
              },
              required: ["questions"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "submit_questions" } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI gateway ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error(`No tool call returned for ${spec.tier}`);
  const args = JSON.parse(toolCall.function.arguments);
  return (args.questions || []) as GeneratedQuestion[];
}

interface TierResult {
  tier: TierSpec["tier"];
  accepted: ValidatedQuestion[];
  attempts: number;
  requested: number;
  sampleReasons: string[];
}

async function runTier(
  spec: TierSpec,
  courseName: string,
  conceptList: string,
  conceptByCode: Record<string, string>,
  lovableKey: string,
): Promise<TierResult> {
  const accepted: ValidatedQuestion[] = [];
  const reasons: string[] = [];
  let attempts = 0;
  let lastInvalidCount = 0;

  while (accepted.length < spec.count && attempts < MAX_ATTEMPTS) {
    attempts++;
    const needed = spec.count - accepted.length;
    const retryHint = attempts > 1
      ? `Previous batch had ${lastInvalidCount} invalid questions. Common issues: ${[...new Set(reasons)].slice(0, 3).join("; ")}. Generate ${needed} fresh MCQs strictly following the rules.`
      : null;

    let batch: GeneratedQuestion[] = [];
    try {
      batch = await callGateway(spec, needed, courseName, conceptList, lovableKey, retryHint);
    } catch (e) {
      reasons.push(`gateway error: ${(e as Error).message.slice(0, 80)}`);
      continue;
    }

    lastInvalidCount = 0;
    for (const q of batch) {
      const v = validateMcq(q, spec, conceptByCode);
      if (!v.ok) {
        reasons.push(v.reason);
        lastInvalidCount++;
        continue;
      }
      if (isDuplicate(v.normalized, accepted)) {
        reasons.push("duplicate content");
        lastInvalidCount++;
        continue;
      }
      accepted.push(v.normalized);
      if (accepted.length >= spec.count) break;
    }
  }

  return {
    tier: spec.tier,
    accepted,
    attempts,
    requested: spec.count,
    sampleReasons: [...new Set(reasons)].slice(0, 5),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { courseId } = await req.json();
    if (!courseId) {
      return new Response(JSON.stringify({ error: "courseId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [{ data: course, error: cErr }, { data: concepts }] = await Promise.all([
      admin.from("courses").select("id, name, teacher_id, course_code").eq("id", courseId).maybeSingle(),
      admin.from("concepts").select("id, concept_code, weight").eq("course_id", courseId),
    ]);

    if (cErr || !course) {
      return new Response(JSON.stringify({ error: "Course not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!concepts || concepts.length === 0) {
      return new Response(
        JSON.stringify({ error: "No concepts found for this course. Generate the lesson plan first to extract concepts." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const conceptList = concepts.map((c) => c.concept_code).join(", ");
    const conceptByCode: Record<string, string> = {};
    for (const c of concepts) conceptByCode[c.concept_code] = c.id;

    // Run all tiers in parallel with retries
    const settled = await Promise.allSettled(
      TIER_SPEC.map((spec) => runTier(spec, course.name, conceptList, conceptByCode, lovableKey)),
    );

    const tierResults: TierResult[] = settled.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return {
        tier: TIER_SPEC[i].tier,
        accepted: [],
        attempts: MAX_ATTEMPTS,
        requested: TIER_SPEC[i].count,
        sampleReasons: [`tier failed: ${(r.reason as Error)?.message?.slice(0, 80) || "unknown"}`],
      };
    });

    const allComplete = tierResults.every((t) => t.accepted.length === t.requested);
    const breakdown = tierResults.map((t) => ({
      tier: t.tier,
      accepted: t.accepted.length,
      requested: t.requested,
      attempts: t.attempts,
      sampleReasons: t.sampleReasons,
    }));

    if (!allComplete) {
      return new Response(
        JSON.stringify({
          error: "Could not produce a complete diagnostic set after retries.",
          breakdown,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // All tiers complete — persist
    const rows: any[] = [];
    let counter = 1;
    for (const t of tierResults) {
      for (const q of t.accepted) {
        rows.push({
          item_code: `${course.course_code || "Q"}-${t.tier.toUpperCase()}-${String(counter).padStart(3, "0")}`,
          content_text: q.content_text,
          format: q.format,
          options: q.options,
          answer: q.answer,
          difficulty_estimate: q.difficulty_estimate,
          bloom_level: q.bloom_level,
          explanation: q.explanation,
          topic: q.topic,
          concept_id: conceptByCode[q.topic],
          course_id: course.id,
          teacher_id: course.teacher_id,
          in_test: true,
          is_distractor: false,
        });
        counter++;
      }
    }

    await admin.from("diagnostic_questions").delete().eq("course_id", course.id);
    const { error: insertErr } = await admin.from("diagnostic_questions").insert(rows);
    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({
        message: `Generated ${rows.length} diagnostic questions`,
        breakdown,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("generate-diagnostic-questions error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
