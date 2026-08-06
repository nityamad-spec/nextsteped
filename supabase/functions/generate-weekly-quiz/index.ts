/**
 * generate-weekly-quiz
 *
 * Purpose:
 *   Generates the week's optional practice quiz for a course, distributing
 *   questions across the concepts scheduled for that week (roughly uniform;
 *   does NOT use concept.weight for allocation).
 *
 * Auth / Access:
 *   Bearer token of the course teacher.
 *
 * Inputs:
 *   - courseId: uuid
 *   - week: number
 *
 * Steps:
 *   1. Authenticate and load the lesson plan to determine the week's concept codes.
 *   2. Prompt the AI to author quiz items distributed across those concepts.
 *   3. Validate items with the shared validators; retry batches on failure.
 *      - All structural / semantic / dedup checks come from
 *        supabase/functions/_shared/question-validation.ts. No local
 *        re-implementations. Retry hints are aggregated across sub-calls with
 *        summarizeRejections; per-concept shortfalls come from auditBatchQuotas
 *        and drive both the next sub-call's prompt and a final top-up call.
 *   4. Insert accepted items into assessment_questions (mode="daily_quiz", quiz_day=week).
 *   5. Return counts and any diagnostics.
 *
 * External calls:
 *   Lovable AI Gateway.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  auditBatchQuotas,
  dedupWithin,
  isLikelyDuplicate,
  normalizeAnswer,
  summarizeRejections,
  validateBloom,
  validateConcept,
  validateDifficulty,
  validateExplanation,
  validateOptionParity,
  validateStructural,
  type QuestionFormat,
} from "../_shared/question-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Tier = "standard" | "easy" | "medium" | "hard";

interface TierSpec {
  tier: Tier;
  count: number;
  difficulty: number;
  label: string;
  batchSize: number; // max questions requested per gateway sub-call
  perCallTimeoutMs: number; // per-sub-call abort timeout
  maxAttempts: number; // tier-level retry budget (counts sub-calls + skew/dedup refills)
  reserveExtras: number; // over-generate this many primaries beyond count as a fallback pool
                          // for the Phase-2 follow-up coverage rule (drop+backfill).
}

// Chunked sub-calls + over-generation buffer mirror the diagnostic pattern.
// Small batches (≤3) finish well under the 45-60s per-call timeout on flash,
// and partial salvage across sub-calls/attempts prevents one slow or
// rejected response from zeroing out the tier.
const TIER_SPEC: TierSpec[] = [
  {
    tier: "standard",
    count: 5,
    difficulty: 0.5,
    label: "Standard tier (common to all students, medium difficulty)",
    batchSize: 3,
    perCallTimeoutMs: 50_000,
    maxAttempts: 2,
    reserveExtras: 2,
  },
  {
    tier: "easy",
    count: 5,
    difficulty: 0.2,
    label: "Easy adaptive tier (for struggling students)",
    batchSize: 3,
    perCallTimeoutMs: 50_000,
    maxAttempts: 2,
    reserveExtras: 2,
  },
  {
    tier: "medium",
    count: 5,
    difficulty: 0.5,
    label: "Medium adaptive tier (for average students)",
    batchSize: 3,
    perCallTimeoutMs: 50_000,
    maxAttempts: 2,
    reserveExtras: 2,
  },
  {
    tier: "hard",
    count: 5,
    difficulty: 0.85,
    label: "Hard adaptive tier (for advanced students)",
    batchSize: 3,
    perCallTimeoutMs: 60_000,
    maxAttempts: 2,
    reserveExtras: 2,
  },
];


const MODEL = "google/gemini-2.5-pro";
// Global wall-clock budget. Targeting a ~300s Supabase edge invoke cap; leave
// headroom for auth, DB reads, insert, and JSON serialization.
const GLOBAL_DEADLINE_MS = 280_000;


// Prompt/dedup caps kept symmetric so we never reject a candidate that the
// model was never warned about (issue J in the plan). Kept small to reduce
// TTFT on flash — dedupWithin still catches overlaps server-side.
const SAME_TIER_PROMPT_CAP = 8;
const CROSS_TIER_PROMPT_CAP = 8;

class CreditsExhaustedError extends Error {
  constructor(msg = "AI credits exhausted") {
    super(msg);
    this.name = "CreditsExhaustedError";
  }
}
class DeadlineExceededError extends Error {
  constructor(msg = "Global deadline exceeded") {
    super(msg);
    this.name = "DeadlineExceededError";
  }
}

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


/* -------------------------------------------------------------------------- */
/* Prompt formatters                                                          */
/* -------------------------------------------------------------------------- */

function formatExistingQuestionsForPrompt(questions: GeneratedQuestion[]): string {
  if (!questions.length) return "";
  const compact = questions.slice(-SAME_TIER_PROMPT_CAP).map((q, index) => {
    return `${index + 1}. Stem: ${q.content_text}\n   Topic: ${q.topic}\n   Correct answer: ${q.answer}\n   Explanation: ${q.explanation}`;
  });
  return `\n\nEXISTING QUESTIONS IN THIS SAME TIER (do not duplicate, paraphrase, or test the same underlying fact/application; also avoid reusing the same answer rationale):\n${compact.join("\n")}`;
}

function formatCrossTierAvoidForPrompt(questions: GeneratedQuestion[]): string {
  if (!questions.length) return "";
  const compact = questions.slice(0, CROSS_TIER_PROMPT_CAP).map((q, index) => {
    return `${index + 1}. Stem: ${q.content_text}\n   Topic: ${q.topic}\n   Correct answer: ${q.answer}`;
  });
  return `\n\nQUESTIONS ALREADY USED IN THE STANDARD TIER OF THIS SAME WEEKLY QUIZ — do NOT repeat, paraphrase, or test the same fact/application. Pick a different concept, a different angle on the same concept, or a different scenario. Every student sees the standard tier plus this tier, so overlap wastes the quiz:\n${compact.join("\n")}`;
}

/* -------------------------------------------------------------------------- */
/* Per-candidate validation                                                    */
/* -------------------------------------------------------------------------- */

function validateCandidate(
  raw: unknown,
  spec: TierSpec,
  conceptByCode: Record<string, ConceptRow>,
): { ok: true; q: GeneratedQuestion } | { ok: false; reason: string } {
  const structural = validateStructural(raw as Record<string, unknown>, {
    allowedFormats: ["mcq", "true_false"],
    requireFourOptions: true,
    maxContentChars: 600,
  });
  if (!structural.ok) return structural;
  const { format, content_text, options } = structural.value;

  const answerRes = normalizeAnswer((raw as any)?.answer, options);
  if (!answerRes.ok) return answerRes;
  const answer = answerRes.value;

  if (format === "mcq") {
    const parity = validateOptionParity(options, answer);
    if (!parity.ok) return parity;
  }

  const conceptRes = validateConcept((raw as any)?.topic, conceptByCode);
  if (!conceptRes.ok) return conceptRes;
  const topic = conceptRes.value;

  const diffRes = validateDifficulty((raw as any)?.difficulty_estimate, {
    midpoint: spec.difficulty,
    band: 0.15,
  });
  if (!diffRes.ok) return diffRes;
  const difficulty_estimate = diffRes.value;

  const bloomRes = validateBloom((raw as any)?.bloom_level, {
    min: 1,
    max: 4,
    enforceDifficultyConsistency: true,
    difficulty: difficulty_estimate,
  });
  if (!bloomRes.ok) return bloomRes;
  const bloom_level = bloomRes.value;

  const explanation = String((raw as any)?.explanation ?? "").trim();
  const explRes = validateExplanation({
    format: format as QuestionFormat,
    options,
    answer,
    explanation,
  });
  if (!explRes.ok) return explRes;

  return {
    ok: true,
    q: {
      content_text,
      format: format as "mcq" | "true_false",
      options,
      answer,
      difficulty_estimate,
      bloom_level,
      explanation: explRes.value,
      topic,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Per-concept quota helpers                                                   */
/* -------------------------------------------------------------------------- */

function buildConceptQuota(codes: string[], total: number): Record<string, number> {
  const base = Math.floor(total / codes.length);
  let remainder = total - base * codes.length;
  const spec: Record<string, number> = {};
  for (const code of codes) {
    spec[code] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
  }
  return spec;
}

function shortConcepts(shortfall: Record<string, number>): string[] {
  return Object.entries(shortfall)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => code);
}

/* -------------------------------------------------------------------------- */
/* Backoff                                                                     */
/* -------------------------------------------------------------------------- */

async function jitteredBackoff(deadlineAt: number, baseMs = 400, spreadMs = 600) {
  const wait = baseMs + Math.floor(Math.random() * spreadMs);
  if (Date.now() + wait >= deadlineAt) return;
  await new Promise((r) => setTimeout(r, wait));
}

/* -------------------------------------------------------------------------- */
/* Tier generation                                                             */
/* -------------------------------------------------------------------------- */

interface TierGenOptions {
  /** When set, restrict prompt concept list + quota audit to these codes. */
  focusConcepts?: string[];
  /** Override attempt budget (used for the short top-up pass). */
  maxAttempts?: number;
  /**
   * Extra items to try to generate beyond `spec.count`. When omitted the
   * generator uses `spec.reserveExtras`. Backfill callers pass 0 because they
   * are trying to reach exactly `count`.
   */
  overGenerate?: number;
}

async function generateTier(
  spec: TierSpec,
  courseName: string,
  weekNumber: number,
  weekName: string,
  conceptByCode: Record<string, ConceptRow>,
  lovableKey: string,
  deadlineAt: number,
  crossTierAvoid: GeneratedQuestion[] = [],
  opts: TierGenOptions = {},
): Promise<GeneratedQuestion[]> {
  const allConceptCodes = Object.keys(conceptByCode);
  const focusCodes = opts.focusConcepts?.length ? opts.focusConcepts : allConceptCodes;
  const conceptList = focusCodes.map((c) => `  - ${c}`).join("\n");
  const overGenerate = Math.max(0, opts.overGenerate ?? spec.reserveExtras ?? 0);
  const targetCount = spec.count + overGenerate;
  const perConceptQuota = buildConceptQuota(focusCodes, targetCount);

  const accepted: GeneratedQuestion[] = [];
  const attemptRejections: string[] = [];
  let retryHint: string | null = null;
  let skewNote: string | null = null;
  const maxAttempts = opts.maxAttempts ?? spec.maxAttempts;

  outer: for (let attempt = 0; attempt < maxAttempts && accepted.length < targetCount; attempt++) {
    // Concepts still short for the next sub-call, so the prompt asks the model
    // to focus where it owes work (issue F).
    const shortfall = auditBatchQuotas(accepted, { perConcept: perConceptQuota }).perConcept;
    const owedConcepts = shortConcepts(shortfall);
    const promptConcepts = owedConcepts.length ? owedConcepts : focusCodes;
    const promptConceptList = promptConcepts.map((c) => `  - ${c}`).join("\n");


    if (Date.now() >= deadlineAt) break;
    const remaining = targetCount - accepted.length;
    const subNeed = Math.min(spec.batchSize, remaining);
    const askFor = Math.min(subNeed + 2, spec.batchSize + 2); // over-generation buffer


    const owedLine =
      owedConcepts.length > 0
        ? `\n- You still owe questions on these concepts: ${owedConcepts
            .map((c) => `${c} (${shortfall[c]})`)
            .join(", ")}. Prioritise them.`
        : "";

    const systemPrompt = `You are an expert assessment designer for a course titled "${courseName}". Generate exactly ${askFor} ${spec.tier}-tier WEEKLY QUIZ questions for Week ${weekNumber}${weekName ? ` — ${weekName}` : ""}.

Tier: ${spec.label}
Target difficulty (0=easy, 1=hard): ${spec.difficulty} (must be within ±0.15)

CONCEPTS available for this week — the 'topic' field of each question MUST be one of these exact concept codes (case-sensitive):
${promptConceptList}
(Full week concept list: ${conceptList.trim() ? "\n" + conceptList : "(same as above)"})

STRICT RULES:
- Each question MUST be either multiple-choice (format="mcq") or true/false (format="true_false"). NO short answer, NO problem solving.
- MCQ: exactly 4 distinct non-empty options (no "A)" prefixes). 'answer' is the FULL TEXT of the correct option.
- True/False: options MUST be exactly ["True", "False"]. 'answer' must be "True" or "False".
- difficulty_estimate: number near ${spec.difficulty} (±0.15).
- bloom_level: integer 1-4 ONLY (1=Remember, 2=Understand, 3=Apply, 4=Analyze). Do NOT use 5 (Evaluate) or 6 (Create) — these cannot be fairly assessed with MCQ or True/False.
${spec.tier === "easy" ? "- Bloom target: mostly 1-2 (Remember/Understand)." : spec.tier === "medium" || spec.tier === "standard" ? "- Bloom target: mostly 2-3 (Understand/Apply); at least 40% at bloom 3." : "- Bloom target: 3-4 (Apply/Analyze); at least 60% at bloom 3-4. Prefer scenario, code-trace, or comparison stems over single-fact recall."}
- content_text: question stem only, ≤ 600 chars.
- explanation: 1-2 sentences that explicitly support the exact correct answer (using its key terms) and do not support any distractor. Do NOT name-drop a wrong option letter.
- topic: MUST exactly match one of the concept codes above.
- Distribute questions across the listed concepts (don't pile all on one).${owedLine}
- Do NOT duplicate or closely paraphrase any question already generated in this same tier. If existing same-tier questions are provided below, create new stems, new examples, and distinct answer rationales.

ANSWER-OBVIOUSNESS RULES (critical — questions are rejected if violated):
- LENGTH PARITY: all 4 MCQ options must be within ±20% character length of each other (max/min ≤ 1.6). The correct option must NOT be the longest or the most hedged/qualified — match the syntactic shape, specificity, and hedging level across all 4 options.
- ELABORATE DISTRACTORS: each wrong option must encode a specific, plausible student misconception (a wrong rule, a swapped operator, an off-by-one, a confused term) — written with the same level of detail as the correct answer. No throwaway one-word distractors against a long correct answer. No obviously absurd choices.
- POSITION ROTATION: across this batch of ${askFor} MCQs, spread the correct option's index roughly evenly across positions 0, 1, 2, 3. Do not put the correct answer at the same index more than twice in a row, and do not put more than ~40% of correct answers at any single index.${skewNote ? `\n- ${skewNote}` : ""}${formatExistingQuestionsForPrompt(accepted)}${formatCrossTierAvoidForPrompt(crossTierAvoid)}${retryHint ? `\n\nRETRY CONTEXT: ${retryHint}` : ""}`;

    let response: Response;
    const remainingBudget = deadlineAt - Date.now() - 2_000;
    if (remainingBudget < 4_000) break outer;
    const callTimeoutMs = Math.max(4_000, Math.min(spec.perCallTimeoutMs, remainingBudget));
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(callTimeoutMs),
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.35,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Generate ${askFor} ${spec.tier}-tier questions now.` },
          ],
          tools: [
            {
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
                          bloom_level: { type: "integer", minimum: 1, maximum: 4 },
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[weekly-quiz] ${spec.tier} sub-call failed (attempt ${attempt + 1}):`, msg);
      attemptRejections.push(`transport: ${msg.slice(0, 80)}`);
      retryHint = summarizeRejections(attemptRejections);
      await jitteredBackoff(deadlineAt);
      continue outer;
    }

    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      if (response.status === 402) throw new CreditsExhaustedError();
      if (response.status === 429) {
        attemptRejections.push("gateway: 429 rate-limited");
        retryHint = summarizeRejections(attemptRejections);
        await jitteredBackoff(deadlineAt, 800, 1200);
        continue outer;
      }
      console.warn(`[weekly-quiz] ${spec.tier} gateway ${response.status}:`, txt.slice(0, 200));
      attemptRejections.push(`gateway: ${response.status}`);
      retryHint = summarizeRejections(attemptRejections);
      await jitteredBackoff(deadlineAt);
      continue outer;
    }

    const data = await response.json().catch(() => null);
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      attemptRejections.push("no tool call returned");
      retryHint = summarizeRejections(attemptRejections);
      continue outer;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      attemptRejections.push("invalid JSON");
      retryHint = summarizeRejections(attemptRejections);
      continue outer;
    }
    const arr: any[] = Array.isArray(parsed?.questions) ? parsed.questions : [];

    const subRejects: string[] = [];
    for (const q of arr) {
      if (accepted.length >= targetCount) break;

      const v = validateCandidate(q, spec, conceptByCode);
      if (!v.ok) {
        subRejects.push(v.reason);
        continue;
      }

      // Dedup: check against everything already accepted (same tier) AND
      // against cross-tier avoid list. dedupWithin does both in one pass.
      const { kept, rejected } = dedupWithin([v.q], [...accepted, ...crossTierAvoid]);
      if (kept.length === 0) {
        subRejects.push(
          `duplicate/paraphrase: "${rejected[0]?.duplicateOf ?? v.q.content_text.slice(0, 80)}"`,
        );
        continue;
      }
      accepted.push(v.q);
    }

    attemptRejections.push(...subRejects);
    retryHint = summarizeRejections(attemptRejections);

    // Post-batch position-skew check — only meaningful once tier is full.
    if (accepted.length >= targetCount) {

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
          // Persist the note into the NEXT prompt (issue G): tell the model
          // which index was over-represented, not just via retryHint.
          skewNote = `In the previous batch, correct answers over-clustered at option index ${skewIdx}. Put correct answers at OTHER indexes this time.`;
          attemptRejections.push(`position-skew idx=${skewIdx}`);
          retryHint = summarizeRejections(attemptRejections);
        }
      }
    }
  }

  // Final safety pass (structural + explanation + dedup are already enforced
  // per-candidate, but run dedupWithin once more in case skew removal + refill
  // introduced a paraphrase).
  const finalDedup = dedupWithin(accepted, []);
  if (finalDedup.rejected.length) {
    console.warn(
      `[weekly-quiz] ${spec.tier} final dedup removed ${finalDedup.rejected.length}:`,
      finalDedup.rejected.map((r) => r.duplicateOf).slice(0, 3),
    );
  }
  return finalDedup.kept;
}


/* -------------------------------------------------------------------------- */
/* Handler                                                                     */
/* -------------------------------------------------------------------------- */



// Runs the full quiz-generation pipeline. Returns { status, payload } rather
// than a Response so the outer Deno.serve handler can stream heartbeats
// around it and defeat the 150s Edge Runtime IDLE_TIMEOUT.
async function run(
  req: Request,
  heartbeat: (msg: unknown) => void = () => {},
): Promise<{ status: number; payload: unknown }> {

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { status: 401, payload: { error: "Not authenticated" } };
  }
  const token = authHeader.slice("Bearer ".length);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return { status: 401, payload: { error: "Not authenticated" } };
  }
  const userId = claimsData.claims.sub as string;

  const body = await req.json();
  const courseId = typeof body?.course_id === "string" ? body.course_id : null;
  const weekNumber = Number(body?.week_number);
  if (!courseId || !Number.isInteger(weekNumber) || weekNumber < 1) {
    return { status: 400, payload: { error: "course_id and week_number required" } };
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Authorize: must be course teacher or collaborator (or admin)
  const { data: course } = await admin
    .from("courses")
    .select("id, name, teacher_id")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) {
    return { status: 404, payload: { error: "Course not found" } };
  }
  let allowed = course.teacher_id === userId;
  if (!allowed) {
    const { data: ct } = await admin
      .from("course_teachers")
      .select("teacher_id")
      .eq("course_id", courseId)
      .eq("teacher_id", userId)
      .maybeSingle();
    allowed = !!ct;
  }
  if (!allowed) {
    const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    allowed = prof?.role === "admin";
  }
  if (!allowed) {
    return { status: 403, payload: { error: "Forbidden" } };
  }

  // Load week + concept names for the week
  const { data: weekRow } = await admin
    .from("lesson_plan_weeks")
    .select("week_name, concepts")
    .eq("course_id", courseId)
    .eq("week_number", weekNumber)
    .maybeSingle();
  if (!weekRow) {
    return { status: 400, payload: { error: `No lesson-plan week ${weekNumber} for this course` } };
  }
  const weekConceptNames: string[] = Array.isArray(weekRow.concepts)
    ? (weekRow.concepts as any[]).map((c) => String(c?.name ?? "").trim()).filter(Boolean)
    : [];
  if (weekConceptNames.length === 0) {
    return { status: 400, payload: { error: "This week has no concepts. Add concepts first." } };
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
    return {
      status: 400,
      payload: {
        error: "Week concepts are not registered in the course concept list. Confirm them in Concept Review.",
      },
    };
  }

  // Run every tier in parallel. Post-assembly cross-tier dedup (below)
  // handles any overlap by tier priority — no need to serialise standard
  // first, which previously blew the global deadline when it timed out.
  // Reserve ~90s of the global deadline for the guaranteed backfill loop.
  const deadlineAt = Date.now() + GLOBAL_DEADLINE_MS;
  const mainPassDeadline = Math.min(deadlineAt, Date.now() + (GLOBAL_DEADLINE_MS - 90_000));

  const allQuestions: { spec: TierSpec; q: GeneratedQuestion }[] = [];
  let creditsExhausted = false;
  const tierErrors: Record<string, string> = {};

  const tierResults = await Promise.allSettled(
    TIER_SPEC.map((spec) =>
      generateTier(
        spec,
        course.name ?? "Course",
        weekNumber,
        weekRow.week_name ?? "",
        conceptByCode,
        lovableKey,
        mainPassDeadline,
        [],
      ).then((qs) => ({ spec, qs })),
    ),
  );
  for (let i = 0; i < tierResults.length; i++) {
    const r = tierResults[i];
    const spec = TIER_SPEC[i];
    if (r.status === "fulfilled") {
      for (const q of r.value.qs) allQuestions.push({ spec, q });
    } else {
      const err = r.reason;
      if (err instanceof CreditsExhaustedError) creditsExhausted = true;
      tierErrors[spec.tier] = err instanceof Error ? err.message : String(err);
      console.warn(`[weekly-quiz] tier ${spec.tier} failed:`, tierErrors[spec.tier]);
    }
  }
  if (creditsExhausted && allQuestions.length === 0) {
    return { status: 402, payload: { error: "AI credits exhausted", code: "CREDITS_EXHAUSTED" } };
  }
  if (allQuestions.length === 0) {
    return {
      status: 502,
      payload: {
        error: "Failed to generate any questions",
        code: "GENERATION_FAILED",
        tier_errors: tierErrors,
      },
    };
  }

  // Post-assembly cross-tier dedup. Priority: standard → hard → medium → easy
  // (standard is canonical; easy is the most likely offender).
  const tierPriority: Tier[] = ["standard", "hard", "medium", "easy"];
  const kept: { spec: TierSpec; q: GeneratedQuestion }[] = [];
  const crossTierDrops: Record<string, number> = {};
  for (const tier of tierPriority) {
    for (const item of allQuestions.filter((x) => x.spec.tier === tier)) {
      const dup = kept.find((k) => isLikelyDuplicate(k.q, item.q));
      if (dup) {
        crossTierDrops[tier] = (crossTierDrops[tier] ?? 0) + 1;
        console.warn(`[weekly-quiz] cross-tier dedup: dropped ${tier} "${item.q.content_text.slice(0, 80)}" (duplicates ${dup.spec.tier} "${dup.q.content_text.slice(0, 80)}")`);
        continue;
      }
      kept.push(item);
    }
  }
  for (const [tier, n] of Object.entries(crossTierDrops)) {
    const existing = tierErrors[tier];
    tierErrors[tier] = existing ? `${existing}; dropped ${n} cross-tier duplicate(s)` : `dropped ${n} cross-tier duplicate(s)`;
  }
  allQuestions.splice(0, allQuestions.length, ...kept);
  // Guaranteed backfill loop: for any tier still short, run focused
  // generateTier calls in parallel using identical validators + difficulty
  // band. Bounded by pass count AND global deadline so we cannot overshoot.
  const MAX_BACKFILL_PASSES = 3;
  for (let pass = 1; pass <= MAX_BACKFILL_PASSES; pass++) {
    const shortSpecs = TIER_SPEC
      .map((spec) => ({
        spec,
        shortfall: spec.count - allQuestions.filter((x) => x.spec.tier === spec.tier).length,
      }))
      .filter((s) => s.shortfall > 0);
    if (shortSpecs.length === 0) break;
    if (deadlineAt - Date.now() < 10_000) {
      console.warn(`[weekly-quiz] backfill pass ${pass} skipped: deadline budget too low`);
      break;
    }

    const backfillJobs = shortSpecs.map(({ spec, shortfall }) => {
      const tierItems = allQuestions.filter((x) => x.spec.tier === spec.tier);
      const tierQuota = buildConceptQuota(Object.keys(conceptByCode), spec.count);
      const tierAudit = auditBatchQuotas(
        tierItems.map((x) => x.q),
        { perConcept: tierQuota },
      ).perConcept;
      const focus = shortConcepts(tierAudit);
      const backfillSpec: TierSpec = { ...spec, count: shortfall };
      const avoid = allQuestions.map((x) => x.q);
      return generateTier(
        backfillSpec,
        course.name ?? "Course",
        weekNumber,
        weekRow.week_name ?? "",
        conceptByCode,
        lovableKey,
        deadlineAt,
        avoid,
        { focusConcepts: focus.length ? focus : undefined, maxAttempts: 2 },
      )
        .then((extra) => ({ spec, shortfall, focus, extra }))
        .catch((err) => ({ spec, shortfall, focus, err }));
    });

    const results = await Promise.all(backfillJobs);
    for (const r of results) {
      if ("err" in r) {
        const err = r.err as unknown;
        if (err instanceof CreditsExhaustedError) creditsExhausted = true;
        const msg = err instanceof Error ? err.message : String(err);
        const existing = tierErrors[r.spec.tier];
        tierErrors[r.spec.tier] = existing ? `${existing}; backfill p${pass} failed: ${msg}` : `backfill p${pass} failed: ${msg}`;
        console.warn(`[weekly-quiz] backfill pass ${pass} tier=${r.spec.tier} failed:`, msg);
        continue;
      }
      let delivered = 0;
      for (const q of r.extra) {
        if (delivered >= r.shortfall) break;
        if (allQuestions.some((k) => isLikelyDuplicate(k.q, q))) continue;
        allQuestions.push({ spec: r.spec, q });
        delivered++;
      }
      console.log(`[weekly-quiz] backfill p${pass} tier=${r.spec.tier} focus=[${r.focus.join(",")}] requested=${r.shortfall} delivered=${delivered}`);
    }
  }

  /* ----------------------------------------------------------------------
   * Final selection per tier: take up to spec.count primaries.
   * -------------------------------------------------------------------- */

  const finalItems: FinalItem[] = [];
  for (const spec of TIER_SPEC) {
    let taken = 0;
    for (const it of allQuestions) {
      if (it.spec.tier !== spec.tier) continue;
      if (taken >= spec.count) break;
      finalItems.push({ spec, q: it.q });
      taken++;
    }
  }


  /* ----------------------------------------------------------------------
   * Persistence
   * -------------------------------------------------------------------- */

  await admin
    .from("assessment_questions")
    .delete()
    .eq("course_id", courseId)
    .eq("mode", "daily_quiz")
    .eq("quiz_day", weekNumber);

  const primaryRows = finalItems.map(({ spec, q }, i) => {
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

  const { error: insErr } = await admin
    .from("assessment_questions")
    .insert(primaryRows);
  if (insErr) throw new Error(`Insert failed: ${insErr.message}`);


  const byTier: Record<string, number> = {};
  for (const { spec } of finalItems) byTier[spec.tier] = (byTier[spec.tier] ?? 0) + 1;
  const expected = TIER_SPEC.reduce((s, t) => s + t.count, 0);
  const partial = primaryRows.length < expected;

  if (creditsExhausted && primaryRows.length === 0) {
    return { status: 402, payload: { error: "AI credits exhausted", code: "CREDITS_EXHAUSTED" } };
  }

  return {
    status: 200,
    payload: {
      ok: true,
      generated: primaryRows.length,
      requested: expected,
      partial,
      by_tier: byTier,
      tier_errors: Object.keys(tierErrors).length ? tierErrors : undefined,

      tier_errors: Object.keys(tierErrors).length ? tierErrors : undefined,
    },
  };
}


Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  // NDJSON stream: emit heartbeats every 20s so the connection is never
  // idle for more than the Edge Runtime's 150s IDLE_TIMEOUT. Final frame is
  // either {type:"result", status, payload} or {type:"error", status, code, message}.
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const write = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          // stream already closed by peer; ignore
        }
      };

      // Initial heartbeat lands before any Gemini call so the first byte is
      // always sent well within 150s of request start.
      write({ type: "heartbeat", t: 0, stage: "start" });
      const hb = setInterval(() => {
        write({ type: "heartbeat", t: Date.now() - startedAt });
      }, 20_000);

      try {
        const { status, payload } = await run(req, write);
        write({ type: "result", status, payload });

      } catch (e: any) {
        console.error("generate-weekly-quiz error:", e);
        let status = 500;
        let code = "INTERNAL";
        if (e instanceof CreditsExhaustedError) {
          status = 402;
          code = "CREDITS_EXHAUSTED";
        } else if (e instanceof DeadlineExceededError) {
          status = 504;
          code = "DEADLINE";
        }
        write({ type: "error", status, code, message: e?.message ?? String(e) });
      } finally {
        clearInterval(hb);
        closed = true;
        try {
          controller.close();
        } catch {
          // ignore
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
});
