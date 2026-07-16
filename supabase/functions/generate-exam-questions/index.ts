import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  normalizeAnswer,
  validateStructural,
  validateOptionParity,
  validateConcept,
  validateBloom,
  validateDifficulty,
  validateExplanation,
  dedupWithin,
  auditBatchQuotas,
} from "../_shared/question-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash";
const MAX_ATTEMPTS = 4;
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
  // Delegate structural + option checks to the shared module.
  const structural = validateStructural(q, {
    allowedFormats: allowedFormats as any,
    requireFourOptions: true,
  });
  if (!structural.ok) return { ok: false, reason: structural.reason };
  const { format, content_text, options } = structural.value;
  if (format === "short_answer") return { ok: false, reason: "short_answer not supported here" };

  // Concept mapping.
  const concept = validateConcept(q.topic, conceptByCode);
  if (!concept.ok) return { ok: false, reason: concept.reason };
  const topic = concept.value;

  // Answer normalisation.
  let answer: string;
  if (format === "true_false") {
    const raw = typeof q.answer === "string" ? q.answer.trim() : "";
    if (!/^(True|False)$/i.test(raw)) return { ok: false, reason: "t/f answer must be True or False" };
    answer = /^t/i.test(raw) ? "True" : "False";
  } else {
    const ans = normalizeAnswer(q.answer, options);
    if (!ans.ok) return { ok: false, reason: ans.reason };
    answer = ans.value;
    const parity = validateOptionParity(options, answer);
    if (!parity.ok) return { ok: false, reason: parity.reason };
  }

  // Difficulty — exam batches pin buckets to easy≈0.2 / med≈0.5 / hard≈0.85.
  // We only clamp here; the batch quota audit checks bucket mix at the end.
  const diff = validateDifficulty(q.difficulty_estimate, { fallback: 0.5 });
  if (!diff.ok) return { ok: false, reason: diff.reason };

  // Bloom 1..4 for exam MCQ/TF — do NOT silently coerce (old behaviour hid model errors).
  const bloom = validateBloom(q.bloom_level, {
    min: 1, max: 4,
    enforceDifficultyConsistency: true,
    difficulty: diff.value,
  });
  if (!bloom.ok) return { ok: false, reason: bloom.reason };

  // Explanation ↔ answer semantic check.
  const explanation = typeof q.explanation === "string" ? q.explanation.trim() : "";
  const explCheck = validateExplanation({
    format: format as "mcq" | "true_false",
    options: format === "true_false" ? ["True", "False"] : options,
    answer,
    explanation,
  });
  if (!explCheck.ok) return { ok: false, reason: explCheck.reason };

  return {
    ok: true,
    q: {
      content_text, format: format as Format, options: format === "true_false" ? ["True", "False"] : options,
      answer, difficulty_estimate: diff.value, bloom_level: bloom.value,
      explanation: explCheck.value, topic,
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
    const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
    const need = batch.count - accepted.length;
    // Over-generate by 1 to absorb a rejection/dup without forcing another round-trip.
    const askFor = need + 1;

    const systemPrompt = `You are an expert assessment designer for the course "${courseName}".
Generate exactly ${askFor} exam questions for a final exam (recommended duration: ${lengthMin} minutes).

ALLOWED FORMATS: ${formatList}

DIFFICULTY MIX for this batch (counts): easy=${batch.difficulty.easy}, medium=${batch.difficulty.medium}, hard=${batch.difficulty.hard}.

CONCEPT TARGETS — each question's 'topic' MUST be one of these exact concept codes (case-sensitive); produce the listed count per concept:
${conceptTargets}

STRICT RULES:
- MCQ (format="mcq"): exactly 4 distinct non-empty options (no "A)" prefixes). 'answer' is the FULL TEXT of the correct option.
- True/False (format="true_false"): options MUST be exactly ["True","False"]. 'answer' must be "True" or "False".
- difficulty_estimate: number in [0,1]. Easy ≈ 0.2, Medium ≈ 0.5, Hard ≈ 0.85.
- bloom_level: integer 1–4 only (Remember/Understand/Apply/Analyze). Do NOT use 5 or 6. Medium items should target bloom 2-3; hard items should target bloom 3-4.
- content_text: question stem only, ≤ 600 chars, exam-appropriate complexity for a ${lengthMin}-minute exam. Prefer scenario, code-trace, and comparison stems over single-fact recall, especially for medium/hard.
- explanation: 1-2 sentences explaining the correct answer.
- topic: MUST exactly match one of the concept codes above.

ANSWER-OBVIOUSNESS RULES (critical — questions are rejected if violated):
- LENGTH PARITY: all 4 MCQ options must be within ±20% character length of each other (max/min ≤ 1.6). The correct option must NOT be the longest or the most hedged/qualified — match the syntactic shape, specificity, and hedging level across all 4 options.
- ELABORATE DISTRACTORS: each wrong option must encode a specific, plausible student misconception (a wrong rule, a swapped operator, an off-by-one, a confused term) — written with the same level of detail as the correct answer. No throwaway one-word distractors against a long correct answer. No obviously absurd choices.
- POSITION ROTATION: across this batch of ${askFor} MCQs, spread the correct option's index roughly evenly across positions 0, 1, 2, 3. Do not put the correct answer at the same index more than twice in a row, and do not put more than ~40% of correct answers at any single index.${retryHint ? `\n\nRETRY CONTEXT: ${retryHint}` : ""}`;


    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(300_000),
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.35,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate ${askFor} exam questions now matching the targets above.` },
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
    // Allow up to batch.count + 2 so over-generated items can survive the skew-rebalancer.
    const acceptCap = batch.count + 2;
    for (const q of arr) {
      if (accepted.length >= acceptCap) break;
      const v = validateQuestion(q, conceptByCode, batch.formats);
      if (!v.ok) { rejects.push(v.reason); continue; }
      const key = v.q.content_text.slice(0, 120).toLowerCase();
      if (accepted.some((a) => a.content_text.slice(0, 120).toLowerCase() === key)) {
        rejects.push("duplicate stem");
        continue;
      }
      accepted.push(v.q);
    }
    if (accepted.length < batch.count && rejects.length) {
      retryHint = `Previous attempt had ${rejects.length} rejected questions. Reasons: ${rejects.slice(0, 3).join("; ")}`;
    }

    // Position-skew check: if any single correct-answer index dominates (>50%), drop surplus and retry.
    // Skip on the last attempt to avoid returning short.
    if (!isLastAttempt && accepted.length >= batch.count) {
      const mcq = accepted.filter((a) => a.format === "mcq");
      if (mcq.length >= 4) {
        const counts = [0, 0, 0, 0];
        for (const a of mcq) {
          const idx = a.options.indexOf(a.answer);
          if (idx >= 0 && idx < 4) counts[idx]++;
        }
        const maxC = Math.max(...counts);
        if (maxC / mcq.length > 0.5) {
          const skewIdx = counts.indexOf(maxC);
          const allowed = Math.floor(mcq.length * 0.5);
          let toRemove = maxC - allowed;
          for (let i = accepted.length - 1; i >= 0 && toRemove > 0; i--) {
            const a = accepted[i];
            if (a.format === "mcq" && a.options.indexOf(a.answer) === skewIdx) {
              accepted.splice(i, 1);
              toRemove--;
            }
          }
          retryHint = `Correct-answer position was skewed to index ${skewIdx} (${maxC}/${mcq.length}). Rotate correct positions across 0-3.`;
        }
      }
    }
  }

  // Trim any over-generated surplus down to the batch target.
  if (accepted.length > batch.count) accepted.length = batch.count;

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

        // Block generation against an archived exam
        const { data: examRow } = await admin
          .from("course_exams")
          .select("id, archived_at, label")
          .eq("course_id", courseId)
          .eq("id", examId)
          .maybeSingle();
        if (examRow && examRow.archived_at) {
          return new Response(
            JSON.stringify({ error: "exam_archived", message: `${examRow.label ?? "This exam"} is archived. Restore it before regenerating questions.` }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

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

        // Generate batches in parallel but emit progress as each finishes; allSettled so one failure doesn't lose siblings.
        let generated = 0;
        const results: GeneratedQuestion[] = [];
        const settled = await Promise.allSettled(batches.map(async (b) => {
          const qs = await generateBatch(b, course.name ?? "Course", lengthMin, conceptByCode, lovableKey);
          results.push(...qs);
          generated += qs.length;
          send(controller, { event: "progress", generated, total: totalQuestions });
          return qs;
        }));
        const batchErrors = settled.filter((s) => s.status === "rejected").map((s: any) => String(s.reason?.message ?? s.reason));
        if (results.length === 0) {
          throw new Error(`All batches failed: ${batchErrors.slice(0, 2).join(" | ")}`);
        }

        // Top-up: if any batch came back short, run a single residual batch to close the gap.
        const shortfall = totalQuestions - results.length;
        if (shortfall > 0) {
          // Residual per-concept: how much each concept is still missing vs target.
          const producedByConcept: Record<string, number> = {};
          for (const r of results) producedByConcept[r.topic] = (producedByConcept[r.topic] ?? 0) + 1;
          const residualConcept: Record<string, number> = {};
          for (const code of Object.keys(perConcept)) {
            const miss = perConcept[code] - (producedByConcept[code] ?? 0);
            if (miss > 0) residualConcept[code] = miss;
          }
          // If residual sums to less than shortfall (e.g. over-produced elsewhere), pad with weighted hamilton.
          const residualSum = Object.values(residualConcept).reduce((s, n) => s + n, 0);
          let topUpPerConcept = residualConcept;
          if (residualSum < shortfall) {
            topUpPerConcept = hamilton(shortfall, weights);
          } else if (residualSum > shortfall) {
            topUpPerConcept = hamilton(shortfall, residualConcept);
          }
          // Residual difficulty mix: re-derive against the shortfall size.
          const residualDifficulty = difficultyMixFromLength(lengthMin, shortfall);
          const topUpBatches = buildBatches(topUpPerConcept, residualDifficulty, types);
          try {
            const topUpSettled = await Promise.allSettled(topUpBatches.map(async (b) => {
              const qs = await generateBatch(b, course.name ?? "Course", lengthMin, conceptByCode, lovableKey);
              // Stop overshooting if multiple top-up batches together exceed remaining gap.
              const remaining = totalQuestions - results.length;
              const take = qs.slice(0, Math.max(0, remaining));
              results.push(...take);
              generated = results.length;
              send(controller, { event: "progress", generated, total: totalQuestions });
            }));
            const topUpErrs = topUpSettled.filter((s) => s.status === "rejected").map((s: any) => String(s.reason?.message ?? s.reason));
            if (topUpErrs.length) console.warn("top-up batch errors:", topUpErrs);
          } catch (e) {
            console.warn("top-up generation failed:", e);
          }
        }

        // Replace existing AI-generated rows for this exam (preserve teacher-added manual rows)
        await admin
          .from("assessment_questions")
          .delete()
          .eq("course_id", courseId)
          .eq("mode", "exam")
          .eq("exam_id", examId)
          .like("item_code", "exam-%");

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

        send(controller, { event: "done", ok: true, generated: rows.length, requested: totalQuestions, partial: rows.length < totalQuestions, by_type: byType });
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
