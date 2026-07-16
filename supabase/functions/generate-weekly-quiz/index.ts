import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateExplanation as sharedValidateExplanation } from "../_shared/question-validation.ts";

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
  maxAttempts: number; // tier-level retry budget
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
    perCallTimeoutMs: 45_000,
    maxAttempts: 3,
  },
  {
    tier: "easy",
    count: 5,
    difficulty: 0.2,
    label: "Easy adaptive tier (for struggling students)",
    batchSize: 3,
    perCallTimeoutMs: 45_000,
    maxAttempts: 3,
  },
  {
    tier: "medium",
    count: 5,
    difficulty: 0.5,
    label: "Medium adaptive tier (for average students)",
    batchSize: 3,
    perCallTimeoutMs: 45_000,
    maxAttempts: 3,
  },
  {
    tier: "hard",
    count: 5,
    difficulty: 0.85,
    label: "Hard adaptive tier (for advanced students)",
    batchSize: 3,
    perCallTimeoutMs: 60_000,
    maxAttempts: 4,
  },
];

const MODEL = "google/gemini-2.5-pro";
// Global wall-clock budget. Supabase edge invoke is bounded at ~150s; leave
// headroom for auth, DB reads, insert, and JSON serialization.
const GLOBAL_DEADLINE_MS = 130_000;

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

const QUESTION_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "should",
  "that",
  "the",
  "their",
  "this",
  "to",
  "what",
  "when",
  "which",
  "why",
  "with",
]);

const ANSWER_STOP_WORDS = new Set([
  ...QUESTION_STOP_WORDS,
  "about",
  "because",
  "best",
  "correct",
  "describes",
  "means",
  "option",
  "statement",
]);

function stripDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function stemToken(token: string): string {
  let t = token.toLowerCase();
  if (t.length > 5 && t.endsWith("ies")) t = `${t.slice(0, -3)}y`;
  else if (t.length > 6 && t.endsWith("ing")) t = t.slice(0, -3);
  else if (t.length > 5 && t.endsWith("ed")) t = t.slice(0, -2);
  else if (t.length > 4 && t.endsWith("es")) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith("s") && !/(ss|us|is|ias)$/.test(t)) t = t.slice(0, -1);
  return t;
}

function tokenize(value: string, stopWords = QUESTION_STOP_WORDS): string[] {
  const normalized = stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized) return [];
  return normalized
    .split(/\s+/)
    .map(stemToken)
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function normalizedQuestionKey(value: string): string {
  return tokenize(value).join(" ");
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union ? intersection / union : 0;
}

function containmentSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  return intersection / Math.min(setA.size, setB.size);
}

function questionSimilarity(a: GeneratedQuestion, b: GeneratedQuestion): number {
  const aTokens = tokenize(a.content_text);
  const bTokens = tokenize(b.content_text);
  const stemJaccard = jaccardSimilarity(aTokens, bTokens);
  const stemContainment = containmentSimilarity(aTokens, bTokens);

  // Include answer/topic overlap so close paraphrases targeting the same fact
  // are caught, while unrelated questions that share generic course terms pass.
  const answerJaccard = jaccardSimilarity(tokenize(a.answer), tokenize(b.answer));
  const sameTopicBoost = a.topic === b.topic ? 0.08 : 0;
  return Math.max(stemJaccard, stemContainment * 0.85, stemJaccard * 0.75 + answerJaccard * 0.2 + sameTopicBoost);
}

function isLikelyDuplicateQuestion(a: GeneratedQuestion, b: GeneratedQuestion): boolean {
  const keyA = normalizedQuestionKey(a.content_text);
  const keyB = normalizedQuestionKey(b.content_text);
  if (keyA && keyA === keyB) return true;

  const similarity = questionSimilarity(a, b);
  if (similarity >= 0.72) return true;

  const answerOverlap = jaccardSimilarity(tokenize(a.answer), tokenize(b.answer));
  const stemContainment = containmentSimilarity(tokenize(a.content_text), tokenize(b.content_text));
  return a.topic === b.topic && stemContainment >= 0.62 && answerOverlap >= 0.35;
}

function topAnswerTokens(answer: string): string[] {
  const tokens = tokenize(answer, ANSWER_STOP_WORDS);
  const seen = new Set<string>();
  return tokens.filter((token) => {
    if (seen.has(token)) return false;
    seen.add(token);
    return true;
  });
}

function explanationSupportsAnswer(q: GeneratedQuestion): { ok: true } | { ok: false; reason: string } {
  const explanation = q.explanation.trim();
  if (!explanation) return { ok: false, reason: "empty explanation" };

  if (q.format === "true_false") {
    const lower = explanation.toLowerCase();
    if (q.answer === "True" && /\bfalse\b|\bincorrect\b|\bnot true\b/.test(lower) && !/\bnot false\b/.test(lower)) {
      return { ok: false, reason: "true/false explanation appears to contradict True answer" };
    }
    if (q.answer === "False" && /\btrue\b|\bcorrect\b/.test(lower) && !/\bnot true\b|\bincorrect\b/.test(lower)) {
      return { ok: false, reason: "true/false explanation appears to contradict False answer" };
    }
    return { ok: true };
  }

  const answerTokens = topAnswerTokens(q.answer);
  if (answerTokens.length === 0) return { ok: true };
  const explanationTokens = new Set(tokenize(explanation, ANSWER_STOP_WORDS));
  const matched = answerTokens.filter((token) => explanationTokens.has(token)).length;
  const required = answerTokens.length <= 2 ? 1 : Math.max(2, Math.ceil(answerTokens.length * 0.3));
  if (matched < required) {
    return { ok: false, reason: "explanation does not reference enough key terms from the correct answer" };
  }

  for (const option of q.options) {
    if (option === q.answer) continue;
    const wrongTokens = topAnswerTokens(option);
    if (wrongTokens.length === 0) continue;
    const wrongMatches = wrongTokens.filter((token) => explanationTokens.has(token)).length;
    const wrongRequired = wrongTokens.length <= 2 ? wrongTokens.length : Math.ceil(wrongTokens.length * 0.6);
    if (wrongMatches >= wrongRequired && matched < wrongMatches) {
      return { ok: false, reason: "explanation appears to support a distractor more than the correct answer" };
    }
  }

  return { ok: true };
}

function validateTierQuestionSet(
  questions: GeneratedQuestion[],
): { questions: GeneratedQuestion[]; rejections: string[] } {
  const survivors: GeneratedQuestion[] = [];
  const rejections: string[] = [];

  for (const q of questions) {
    const duplicateOf = survivors.find((existing) => isLikelyDuplicateQuestion(existing, q));
    if (duplicateOf) {
      rejections.push(`duplicate/paraphrase rejected: "${q.content_text.slice(0, 90)}" duplicates "${duplicateOf.content_text.slice(0, 90)}"`);
      continue;
    }

    const explanationCheck = explanationSupportsAnswer(q);
    if (!explanationCheck.ok) {
      rejections.push(`${explanationCheck.reason}: "${q.content_text.slice(0, 90)}"`);
      continue;
    }

    survivors.push(q);
  }

  return { questions: survivors, rejections };
}

function formatExistingQuestionsForPrompt(questions: GeneratedQuestion[]): string {
  if (!questions.length) return "";
  const compact = questions.slice(-8).map((q, index) => {
    return `${index + 1}. Stem: ${q.content_text}\n   Topic: ${q.topic}\n   Correct answer: ${q.answer}\n   Explanation: ${q.explanation}`;
  });

  return `\n\nEXISTING QUESTIONS IN THIS SAME TIER (do not duplicate, paraphrase, or test the same underlying fact/application; also avoid reusing the same answer rationale):\n${compact.join("\n")}`;
}

function formatCrossTierAvoidForPrompt(questions: GeneratedQuestion[]): string {
  if (!questions.length) return "";
  const compact = questions.slice(0, 12).map((q, index) => {
    return `${index + 1}. Stem: ${q.content_text}\n   Topic: ${q.topic}\n   Correct answer: ${q.answer}`;
  });
  return `\n\nQUESTIONS ALREADY USED IN THE STANDARD TIER OF THIS SAME WEEKLY QUIZ — do NOT repeat, paraphrase, or test the same fact/application. Pick a different concept, a different angle on the same concept, or a different scenario. Every student sees the standard tier plus this tier, so overlap wastes the quiz:\n${compact.join("\n")}`;
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
    // Length parity: prevent "longest = correct" giveaway.
    const lens = options.map((o) => o.length);
    const maxLen = Math.max(...lens);
    const minLen = Math.min(...lens);
    if (minLen > 0 && maxLen / minLen > 1.6) {
      return { ok: false, reason: `option length imbalance ${minLen}->${maxLen} (>1.6x)` };
    }
    const answerStr = typeof q.answer === "string" ? q.answer.trim() : "";
    const answerLen = answerStr.length;
    const avgLen = lens.reduce((s, n) => s + n, 0) / 4;
    const strictlyLongest = lens.filter((l) => l === maxLen).length === 1 && answerLen === maxLen;
    if (strictlyLongest && answerLen > avgLen * 1.25) {
      return { ok: false, reason: "correct option is strictly longest and >25% above avg length" };
    }
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
      if (code.toLowerCase() === lower) {
        canonical = code;
        break;
      }
    }
  }
  if (!canonical) return { ok: false, reason: `topic '${rawTopic}' not in week concepts` };

  let diff = Number(q.difficulty_estimate);
  if (!Number.isFinite(diff)) diff = spec.difficulty;
  diff = Math.max(0, Math.min(1, diff));

  const bloom = Math.round(Number(q.bloom_level));
  if (!Number.isInteger(bloom) || bloom < 1 || bloom > 4) {
    return { ok: false, reason: `bloom_level ${q.bloom_level} not allowed for MCQ/TF (must be 1-4)` };
  }
  const bloomSafe = bloom;

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
  deadlineAt: number,
  crossTierAvoid: GeneratedQuestion[] = [],
): Promise<GeneratedQuestion[]> {
  const conceptList = Object.keys(conceptByCode)
    .map((c) => `  - ${c}`)
    .join("\n");
  const accepted: GeneratedQuestion[] = [];
  let retryHint: string | null = null;


  outer: for (let attempt = 0; attempt < spec.maxAttempts && accepted.length < spec.count; attempt++) {
    // Within an attempt, chunk into sub-calls. Each sub-call asks for a small
    // batch (≤spec.batchSize) plus a +1 over-generation buffer so validator
    // rejections don't immediately force a new full round-trip.
    while (accepted.length < spec.count) {
      if (Date.now() >= deadlineAt) break outer;
      const remaining = spec.count - accepted.length;
      const subNeed = Math.min(spec.batchSize, remaining);
      const askFor = subNeed + 1; // over-generation buffer

      const systemPrompt = `You are an expert assessment designer for a course titled "${courseName}". Generate exactly ${askFor} ${spec.tier}-tier WEEKLY QUIZ questions for Week ${weekNumber}${weekName ? ` — ${weekName}` : ""}.

Tier: ${spec.label}
Target difficulty (0=easy, 1=hard): ${spec.difficulty}

CONCEPTS for this week — the 'topic' field of each question MUST be one of these exact concept codes (case-sensitive):
${conceptList}

STRICT RULES:
- Each question MUST be either multiple-choice (format="mcq") or true/false (format="true_false"). NO short answer, NO problem solving.
- MCQ: exactly 4 distinct non-empty options (no "A)" prefixes). 'answer' is the FULL TEXT of the correct option.
- True/False: options MUST be exactly ["True", "False"]. 'answer' must be "True" or "False".
- difficulty_estimate: number near ${spec.difficulty} (±0.15).
- bloom_level: integer 1-4 ONLY (1=Remember, 2=Understand, 3=Apply, 4=Analyze). Do NOT use 5 (Evaluate) or 6 (Create) — these cannot be fairly assessed with MCQ or True/False.
${spec.tier === "easy" ? "- Bloom target: mostly 1-2 (Remember/Understand)." : spec.tier === "medium" || spec.tier === "standard" ? "- Bloom target: mostly 2-3 (Understand/Apply); at least 40% at bloom 3." : "- Bloom target: 3-4 (Apply/Analyze); at least 60% at bloom 3-4. Prefer scenario, code-trace, or comparison stems over single-fact recall."}
- content_text: question stem only, ≤ 600 chars.
- explanation: 1-2 sentences explaining the correct answer.
- explanation: 1-2 sentences that explicitly support the exact correct answer and do not support any distractor.
- topic: MUST exactly match one of the concept codes above.
- Distribute questions across the listed concepts (don't pile all on one).
- Do NOT duplicate or closely paraphrase any question already generated in this same tier. If existing same-tier questions are provided below, create new stems, new examples, and distinct answer rationales.

ANSWER-OBVIOUSNESS RULES (critical — questions are rejected if violated):
- LENGTH PARITY: all 4 MCQ options must be within ±20% character length of each other (max/min ≤ 1.6). The correct option must NOT be the longest or the most hedged/qualified — match the syntactic shape, specificity, and hedging level across all 4 options.
- ELABORATE DISTRACTORS: each wrong option must encode a specific, plausible student misconception (a wrong rule, a swapped operator, an off-by-one, a confused term) — written with the same level of detail as the correct answer. No throwaway one-word distractors against a long correct answer. No obviously absurd choices.
- POSITION ROTATION: across this batch of ${askFor} MCQs, spread the correct option's index roughly evenly across positions 0, 1, 2, 3. Do not put the correct answer at the same index more than twice in a row, and do not put more than ~40% of correct answers at any single index.${formatExistingQuestionsForPrompt(accepted)}${formatCrossTierAvoidForPrompt(crossTierAvoid)}${retryHint ? `\n\nRETRY CONTEXT: ${retryHint}` : ""}`;

      let response: Response;
      try {
        response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          signal: AbortSignal.timeout(spec.perCallTimeoutMs),
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
        // Timeout / abort / network — log, break to next attempt.
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[weekly-quiz] ${spec.tier} sub-call failed (attempt ${attempt + 1}):`, msg);
        retryHint = `Previous sub-call timed out or errored: ${msg.slice(0, 120)}`;
        break; // next attempt
      }

      if (!response.ok) {
        const txt = await response.text().catch(() => "");
        if (response.status === 429) {
          retryHint = "Rate limited by gateway";
          break; // next attempt (small backoff is implicit)
        }
        if (response.status === 402) throw new CreditsExhaustedError();
        console.warn(`[weekly-quiz] ${spec.tier} gateway ${response.status}:`, txt.slice(0, 200));
        retryHint = `Gateway returned ${response.status}`;
        break;
      }

      const data = await response.json().catch(() => null);
      const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) {
        retryHint = "no tool call returned";
        continue;
      }
      let parsed: any;
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch {
        retryHint = "invalid JSON";
        continue;
      }
      const arr: any[] = Array.isArray(parsed?.questions) ? parsed.questions : [];

      const rejects: string[] = [];
      for (const q of arr) {
        if (accepted.length >= spec.count) break;
        const v = validateQuestion(q, spec, conceptByCode);
        if (!v.ok) {
          rejects.push(v.reason);
          continue;
        }
        const explanationCheck = explanationSupportsAnswer(v.q);
        if (!explanationCheck.ok) {
          rejects.push(explanationCheck.reason);
          continue;
        }
        const duplicateOf = accepted.find((a) => isLikelyDuplicateQuestion(a, v.q));
        if (duplicateOf) {
          rejects.push(`duplicate/paraphrase of existing same-tier question: "${duplicateOf.content_text.slice(0, 90)}"`);
          continue;
        }
        const crossDup = crossTierAvoid.find((a) => isLikelyDuplicateQuestion(a, v.q));
        if (crossDup) {
          rejects.push(`duplicate/paraphrase of standard-tier question: "${crossDup.content_text.slice(0, 90)}"`);
          continue;
        }

        accepted.push(v.q);
      }
      if (accepted.length < spec.count && rejects.length) {
        retryHint = `Previous sub-call had ${rejects.length} rejected questions. Reasons: ${rejects.slice(0, 3).join("; ")}`;
      }

      // If the sub-call produced zero survivors, break out to start a fresh
      // attempt rather than spinning on the same prompt with identical hint.
      if (arr.length > 0 && accepted.length === 0) break;

      // Post-batch position-skew check — only meaningful once tier is full.
      if (accepted.length >= spec.count) {
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

        const finalCheck = validateTierQuestionSet(accepted);
        if (finalCheck.rejections.length) {
          accepted.splice(0, accepted.length, ...finalCheck.questions);
          retryHint = `Final tier validation removed ${finalCheck.rejections.length} question(s): ${finalCheck.rejections.slice(0, 3).join("; ")}. Generate replacements that are unique and whose explanations support the exact correct answer.`;
        }
      }
    }
  }

  const finalCheck = validateTierQuestionSet(accepted);
  if (finalCheck.rejections.length) {
    console.warn(`[weekly-quiz] ${spec.tier} final validation removed ${finalCheck.rejections.length} question(s):`, finalCheck.rejections.slice(0, 5));
  }
  // Return whatever we have — caller decides whether to accept a partial tier.
  return finalCheck.questions;
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
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice("Bearer ".length);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const courseId = typeof body?.course_id === "string" ? body.course_id : null;
    const weekNumber = Number(body?.week_number);
    if (!courseId || !Number.isInteger(weekNumber) || weekNumber < 1) {
      return new Response(JSON.stringify({ error: "course_id and week_number required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const weekConceptNames: string[] = Array.isArray(weekRow.concepts)
      ? (weekRow.concepts as any[]).map((c) => String(c?.name ?? "").trim()).filter(Boolean)
      : [];
    if (weekConceptNames.length === 0) {
      return new Response(JSON.stringify({ error: "This week has no concepts. Add concepts first." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      return new Response(
        JSON.stringify({
          error: "Week concepts are not registered in the course concept list. Confirm them in Concept Review.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Sequence: standard first (canonical), then easy/medium/hard in parallel
    // with the accepted standard set injected as cross-tier avoid context.
    // If standard fails outright, fall back to all-parallel so we never zero
    // out the whole quiz.
    const deadlineAt = Date.now() + GLOBAL_DEADLINE_MS;
    const allQuestions: { spec: TierSpec; q: GeneratedQuestion }[] = [];
    let creditsExhausted = false;
    const tierErrors: Record<string, string> = {};

    const standardSpec = TIER_SPEC.find((t) => t.tier === "standard")!;
    const adaptiveSpecs = TIER_SPEC.filter((t) => t.tier !== "standard");

    let standardQs: GeneratedQuestion[] = [];
    try {
      standardQs = await generateTier(
        standardSpec,
        course.name ?? "Course",
        weekNumber,
        weekRow.week_name ?? "",
        conceptByCode,
        lovableKey,
        deadlineAt,
        [],
      );
      for (const q of standardQs) allQuestions.push({ spec: standardSpec, q });
    } catch (err) {
      if (err instanceof CreditsExhaustedError) creditsExhausted = true;
      tierErrors[standardSpec.tier] = err instanceof Error ? err.message : String(err);
      console.warn(`[weekly-quiz] tier standard failed:`, tierErrors[standardSpec.tier]);
    }

    const adaptiveResults = await Promise.allSettled(
      adaptiveSpecs.map((spec) =>
        generateTier(
          spec,
          course.name ?? "Course",
          weekNumber,
          weekRow.week_name ?? "",
          conceptByCode,
          lovableKey,
          deadlineAt,
          standardQs,
        ).then((qs) => ({ spec, qs })),
      ),
    );
    for (let i = 0; i < adaptiveResults.length; i++) {
      const r = adaptiveResults[i];
      const spec = adaptiveSpecs[i];
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
      return new Response(JSON.stringify({ error: "AI credits exhausted", code: "CREDITS_EXHAUSTED" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (allQuestions.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Failed to generate any questions",
          code: "GENERATION_FAILED",
          tier_errors: tierErrors,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Post-assembly cross-tier dedup. Priority: standard → hard → medium → easy
    // (standard is canonical; easy is the most likely offender).
    const tierPriority: Tier[] = ["standard", "hard", "medium", "easy"];
    const kept: { spec: TierSpec; q: GeneratedQuestion }[] = [];
    const crossTierDrops: Record<string, number> = {};
    for (const tier of tierPriority) {
      for (const item of allQuestions.filter((x) => x.spec.tier === tier)) {
        const dup = kept.find((k) => isLikelyDuplicateQuestion(k.q, item.q));
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

    // Backfill: any tier short of spec.count after dedup gets one extra
    // generation call, with all currently kept questions as cross-tier avoid.
    for (const spec of TIER_SPEC) {
      const currentCount = allQuestions.filter((x) => x.spec.tier === spec.tier).length;
      const shortfall = spec.count - currentCount;
      if (shortfall <= 0) continue;
      if (deadlineAt - Date.now() < 25_000) {
        console.warn(`[weekly-quiz] backfill tier=${spec.tier} skipped: deadline budget too low`);
        continue;
      }
      const backfillSpec: TierSpec = { ...spec, count: shortfall };
      const avoid = allQuestions.map((x) => x.q);
      try {
        const extra = await generateTier(
          backfillSpec,
          course.name ?? "Course",
          weekNumber,
          weekRow.week_name ?? "",
          conceptByCode,
          lovableKey,
          deadlineAt,
          avoid,
        );
        let delivered = 0;
        for (const q of extra) {
          if (delivered >= shortfall) break;
          if (allQuestions.some((k) => isLikelyDuplicateQuestion(k.q, q))) continue;
          allQuestions.push({ spec, q });
          delivered++;
        }
        console.log(`[weekly-quiz] backfill tier=${spec.tier} requested=${shortfall} delivered=${delivered}`);
      } catch (err) {
        if (err instanceof CreditsExhaustedError) creditsExhausted = true;
        const msg = err instanceof Error ? err.message : String(err);
        const existing = tierErrors[spec.tier];
        tierErrors[spec.tier] = existing ? `${existing}; backfill failed: ${msg}` : `backfill failed: ${msg}`;
        console.warn(`[weekly-quiz] backfill tier=${spec.tier} failed:`, msg);
      }
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
    const expected = TIER_SPEC.reduce((s, t) => s + t.count, 0);
    const partial = rows.length < expected;

    return new Response(
      JSON.stringify({
        ok: true,
        generated: rows.length,
        requested: expected,
        partial,
        by_tier: byTier,
        tier_errors: Object.keys(tierErrors).length ? tierErrors : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e: any) {
    console.error("generate-weekly-quiz error:", e);
    if (e instanceof CreditsExhaustedError) {
      return new Response(JSON.stringify({ error: e.message, code: "CREDITS_EXHAUSTED" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (e instanceof DeadlineExceededError) {
      return new Response(JSON.stringify({ error: e.message, code: "DEADLINE" }), {
        status: 504,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: e?.message ?? String(e), code: "INTERNAL" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
