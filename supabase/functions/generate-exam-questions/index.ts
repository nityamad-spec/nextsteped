import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash";
const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 5;

type Format = "mcq" | "true_false";

interface ConceptRow {
  id: string;
  concept_code: string;
  weight: number;
}

interface GeneratedQuestion {
  content_text: string;
  format: Format;
  options: string[];
  answer: string;
  difficulty_estimate: number;
  bloom_level: number;
  explanation: string;
  topic: string;
}

interface BatchSpec {
  index: number;
  count: number;
  // concept_code -> count to produce in this batch
  perConcept: Record<string, number>;
  // difficulty bucket counts in this batch
  difficulty: { easy: number; medium: number; hard: number };
  // allowed formats
  formats: Format[];
}

// Hamilton/largest-remainder allocation
function hamilton(total: number, weights: Record<string, number>): Record<string, number> {
  const keys = Object.keys(weights);
  const sum = keys.reduce((s, k) => s + Math.max(0, weights[k]), 0);
  if (sum <= 0 || total <= 0) {
    return Object.fromEntries(keys.map(k => [k, 0]));
  }
  const raw: Record<string, number> = {};
  const floor: Record<string, number> = {};
  let assigned = 0;
  for (const k of keys) {
    const r = (Math.max(0, weights[k]) / sum) * total;
    raw[k] = r;
    floor[k] = Math.floor(r);
    assigned += floor[k];
  }
  let remaining = total - assigned;
  const remainders = keys
    .map(k => ({ k, frac: raw[k] - floor[k] }))
    .sort((a, b) => b.frac - a.frac);
  const result = { ...floor };
  for (const { k } of remainders) {
    if (remaining <= 0) break;
    result[k] += 1;
    remaining -= 1;
  }
  return result;
}

function difficultyMixFromLength(lengthMin: number, total: number) {
  let pct: { easy: number; medium: number; hard: number };
  if (lengthMin <= 30) pct = { easy: 0.6, medium: 0.3, hard: 0.1 };
  else if (lengthMin <= 60) pct = { easy: 0.3, medium: 0.5, hard: 0.2 };
  else if (lengthMin <= 120) pct = { easy: 0.2, medium: 0.5, hard: 0.3 };
  else pct = { easy: 0.1, medium: 0.5, hard: 0.4 };
  return hamilton(total, pct) as { easy: number; medium: number; hard: number };
}

// Split a per-concept allocation into batches of ~BATCH_SIZE.
function buildBatches(
  perConcept: Record<string, number>,
  difficulty: { easy: number; medium: number; hard: number },
  formats: Format[],
): BatchSpec[] {
  const total = Object.values(perConcept).reduce((s, n) => s + n, 0);
  if (total === 0) return [];
  const numBatches = Math.max(1, Math.ceil(total / BATCH_SIZE));

  // Distribute each concept's count across batches as evenly as possible
  const batches: BatchSpec[] = Array.from({ length: numBatches }, (_, i) => ({
    index: i,
    count: 0,
    perConcept: {},
    difficulty: { easy: 0, medium: 0, hard: 0 },
    formats,
  }));

  // Spread concept counts: walk through batches round-robin
  const conceptKeys = Object.keys(perConcept);
  let cursor = 0;
  for (const code of conceptKeys) {
    let remaining = perConcept[code];
    while (remaining > 0) {
      const b = batches[cursor % numBatches];
      b.perConcept[code] = (b.perConcept[code] || 0) + 1;
      b.count += 1;
      remaining -= 1;
      cursor += 1;
    }
  }

  // Distribute difficulty buckets similarly
  let dCursor = 0;
  for (const bucket of ["easy", "medium", "hard"] as const) {
    let remaining = difficulty[bucket];
    while (remaining > 0) {
      const b = batches[dCursor % numBatches];
      // Don't exceed batch count
      const bucketSum = b.difficulty.easy + b.difficulty.medium + b.difficulty.hard;
      if (bucketSum < b.count) {
        b.difficulty[bucket] += 1;
        remaining -= 1;
      }
      dCursor += 1;
      if (dCursor > numBatches * 100) break; // safety
    }
  }
  // Fix any rounding mismatch within a batch
  for (const b of batches) {
    const bSum = b.difficulty.easy + b.difficulty.medium + b.difficulty.hard;
    if (bSum < b.count) b.difficulty.medium += (b.count - bSum);
  }

  return batches;
}

function validateQuestion(
  q: any,
  conceptByCode: Record<string, ConceptRow>,
  allowedFormats: Format[],
): { ok: true; q: GeneratedQuestion } | { ok: false; reason: string } {
  if (!q || typeof q !== "object") return { ok: false, reason: "not an object" };
  const format = q.format;
  if (!allowedFormats.includes(format)) return { ok: false, reason: `format ${format} not allowed` };

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
  if (!canonical) return { ok: false, reason: `topic '${rawTopic}' not in course concepts` };

  let diff = Number(q.difficulty_estimate);
  if (!Number.isFinite(diff)) diff = 0.5;
  diff = Math.max(0, Math.min(1, diff));

  const bloom = Math.round(Number(q.bloom_level));
  const bloomSafe = Number.isInteger(bloom) && bloom >= 1 && bloom <= 4 ? bloom : 2;

  const explanation = typeof q.explanation === "string" ? q.explanation.trim() : "";
  if (!explanation) return { ok: false, reason: "empty explanation" };

  return {
    ok: true,
    q: {
      content_text: content, format, options, answer,
      difficulty_estimate: diff, bloom_level: bloomSafe,
      explanation, topic: canonical,
    },
  };
}

async function generateBatch(
  batch: BatchSpec,
  courseName: string,
  lengthMin: number,
  conceptByCode: Record<string, ConceptRow>,
  lovableKey: string,
): Promise<GeneratedQuestion[]> {
  const accepted: GeneratedQuestion[] = [];
  let retryHint: string | null = null;

  const formatList = batch.formats.join(", ");
  const conceptTargets = Object.entries(batch.perConcept)
    .filter(([, c]) => c > 0)
    .map(([code, c]) => `  - ${code}: ${c}`).join("\n");

  for (let attempt = 0; attempt < MAX_ATTEMPTS && accepted.length < batch.count; attempt++) {
    const need = batch.count - accepted.length;

    const systemPrompt = `You are an expert assessment designer for the course "${courseName}".
Generate exactly ${need} exam questions for a final exam (recommended duration: ${lengthMin} minutes).

ALLOWED FORMATS: ${formatList}

DIFFICULTY MIX for this batch (counts): easy=${batch.difficulty.easy}, medium=${batch.difficulty.medium}, hard=${batch.difficulty.hard}.

CONCEPT TARGETS — each question's 'topic' MUST be one of these exact concept codes (case-sensitive); produce the listed count per concept:
${conceptTargets}

STRICT RULES:
- MCQ (format="mcq"): exactly 4 distinct non-empty options (no "A)" prefixes). 'answer' is the FULL TEXT of the correct option.
- True/False (format="true_false"): options MUST be exactly ["True","False"]. 'answer' must be "True" or "False".
- difficulty_estimate: number in [0,1]. Easy ≈ 0.2, Medium ≈ 0.5, Hard ≈ 0.85.
- bloom_level: integer 1–4 only (Remember/Understand/Apply/Analyze). Do NOT use 5 or 6.
- content_text: question stem only, ≤ 600 chars, exam-appropriate complexity for a ${lengthMin}-minute exam.
- explanation: 1-2 sentences explaining the correct answer.
- topic: MUST exactly match one of the concept codes above.${retryHint ? `\n\nRETRY CONTEXT: ${retryHint}` : ""}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(300_000),
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.5,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate ${need} exam questions now matching the targets above.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "submit_questions",
            description: "Submit exam questions",
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
                      bloom_level: { type: "integer", minimum: 1, maximum: 4 },
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
      if (accepted.length >= batch.count) break;
      const v = validateQuestion(q, conceptByCode, batch.formats);
      if (!v.ok) { rejects.push(v.reason); continue; }
      const key = v.q.content_text.slice(0, 120).toLowerCase();
      if (accepted.some((a) => a.content_text.slice(0, 120).toLowerCase() === key)) continue;
      accepted.push(v.q);
    }
    if (accepted.length < batch.count && rejects.length) {
      retryHint = `Previous attempt had ${rejects.length} rejected questions. Reasons: ${rejects.slice(0, 3).join("; ")}`;
    }
  }

  if (accepted.length === 0) {
    throw new Error(`Batch ${batch.index}: generated 0 valid questions after ${MAX_ATTEMPTS} attempts`);
  }
  return accepted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const send = (controller: ReadableStreamDefaultController, payload: unknown) => {
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`));
  };

  // We always stream SSE so the client can show "Generating N/T..."
  const stream = new ReadableStream({
    async start(controller) {
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
        if (userErr || !userData?.user) throw new Error("Not authenticated");
        const userId = userData.user.id;

        const body = await req.json();
        const courseId = typeof body?.course_id === "string" ? body.course_id : null;
        const examId = typeof body?.exam_id === "string" ? body.exam_id : null;
        const lengthMin = Number(body?.length_min);
        const totalQuestions = Number(body?.total_questions);
        const replace = body?.replace === true;
        const rawTypes: unknown = body?.question_types;
        const types: Format[] = Array.isArray(rawTypes)
          ? (rawTypes.filter((t: any) => t === "mcq" || t === "true_false") as Format[])
          : [];

        if (!courseId || !examId || !Number.isFinite(lengthMin) || lengthMin <= 0 || !Number.isInteger(totalQuestions) || totalQuestions <= 0 || types.length === 0) {
          throw new Error("course_id, exam_id, length_min, total_questions, question_types are required");
        }

        const admin = createClient(supabaseUrl, serviceKey);

        // Authorize
        const { data: course } = await admin
          .from("courses")
          .select("id, name, teacher_id")
          .eq("id", courseId)
          .maybeSingle();
        if (!course) throw new Error("Course not found");
        let allowed = course.teacher_id === userId;
        if (!allowed) {
          const { data: ct } = await admin.from("course_teachers")
            .select("teacher_id").eq("course_id", courseId).eq("teacher_id", userId).maybeSingle();
          allowed = !!ct;
        }
        if (!allowed) {
          const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
          allowed = prof?.role === "admin";
        }
        if (!allowed) throw new Error("Forbidden");

        // Block if questions already exist for this exam unless replace=true
        const { count: existingCount } = await admin
          .from("assessment_questions")
          .select("id", { count: "exact", head: true })
          .eq("course_id", courseId)
          .eq("mode", "exam")
          .eq("exam_id", examId);
        if ((existingCount ?? 0) > 0 && !replace) {
          throw new Error("Questions already exist for this exam. Delete them first or pass replace=true.");
        }

        // Load all course concepts (with weights)
        const { data: conceptRows } = await admin
          .from("concepts")
          .select("id, concept_code, weight")
          .eq("course_id", courseId);
        const concepts: ConceptRow[] = (conceptRows ?? []).map((r: any) => ({
          id: r.id, concept_code: r.concept_code,
          weight: Number.isFinite(Number(r.weight)) ? Number(r.weight) : 0,
        }));
        if (concepts.length === 0) throw new Error("This course has no concepts. Add concepts first.");
        const conceptByCode: Record<string, ConceptRow> = {};
        for (const c of concepts) conceptByCode[c.concept_code] = c;

        // Allocate questions per concept by weight (largest-remainder)
        const weights: Record<string, number> = {};
        for (const c of concepts) weights[c.concept_code] = Math.max(0, c.weight);
        const totalWeight = Object.values(weights).reduce((s, n) => s + n, 0);
        if (totalWeight <= 0) {
          // Equal distribution fallback
          for (const c of concepts) weights[c.concept_code] = 1;
        }
        const perConcept = hamilton(totalQuestions, weights);
        const difficulty = difficultyMixFromLength(lengthMin, totalQuestions);
        const batches = buildBatches(perConcept, difficulty, types);

        send(controller, { event: "start", total: totalQuestions, batches: batches.length });

        // Generate batches in parallel but emit progress as each finishes
        let generated = 0;
        const results: GeneratedQuestion[] = [];
        await Promise.all(batches.map(async (b) => {
          const qs = await generateBatch(b, course.name ?? "Course", lengthMin, conceptByCode, lovableKey);
          results.push(...qs);
          generated += qs.length;
          send(controller, { event: "progress", generated, total: totalQuestions });
        }));

        // Replace existing rows for this exam
        await admin
          .from("assessment_questions")
          .delete()
          .eq("course_id", courseId)
          .eq("mode", "exam")
          .eq("exam_id", examId);

        const rows = results.map((q, i) => {
          const concept = conceptByCode[q.topic];
          const correctIndex = q.options.indexOf(q.answer);
          return {
            course_id: courseId,
            teacher_id: course.teacher_id,
            mode: "exam",
            exam_id: examId,
            tier: "standard",
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
            item_code: `exam-${examId.slice(0, 8)}-${i}`,
          };
        });

        const { error: insErr } = await admin.from("assessment_questions").insert(rows);
        if (insErr) throw new Error(`Insert failed: ${insErr.message}`);

        const byType: Record<string, number> = {};
        for (const q of results) byType[q.format] = (byType[q.format] ?? 0) + 1;

        send(controller, { event: "done", ok: true, generated: rows.length, by_type: byType });
        controller.close();
      } catch (e: any) {
        console.error("generate-exam-questions error:", e);
        try {
          send(controller, { event: "error", error: e?.message ?? String(e) });
        } catch { /* ignore */ }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
