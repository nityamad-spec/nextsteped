import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ------- AI gateway call logger (fire-and-forget) --------------------------
const FUNCTION_NAME = "generate-diagnostic-questions";
let _logClient: ReturnType<typeof createClient> | null = null;
function logClient() {
  if (_logClient) return _logClient;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  _logClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return _logClient;
}

type LogOutcome = "ok" | "retryable" | "client_error" | "timeout" | "network_error" | "aborted";
function classifyOutcome(status: number | null, err: unknown): LogOutcome {
  if (status != null) {
    if (status >= 200 && status < 300) return "ok";
    if (status === 429 || status >= 500) return "retryable";
    return "client_error";
  }
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (msg.includes("abort") || msg.includes("timeout") || msg.includes("timed out")) return "timeout";
  return "network_error";
}

interface LogRow {
  model?: string;
  purpose?: string;
  http_status?: number | null;
  outcome: LogOutcome;
  attempt?: number;
  total_attempts?: number;
  duration_ms?: number;
  request_id?: string;
  teacher_id?: string | null;
  course_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  context?: Record<string, unknown>;
}
function logGatewayCall(row: LogRow) {
  try {
    const c = logClient();
    if (!c) return;
    const payload = {
      function_name: FUNCTION_NAME,
      model: row.model ?? null,
      purpose: row.purpose ?? null,
      http_status: row.http_status ?? null,
      outcome: row.outcome,
      attempt: row.attempt ?? null,
      total_attempts: row.total_attempts ?? null,
      duration_ms: row.duration_ms ?? null,
      request_id: row.request_id ?? null,
      teacher_id: row.teacher_id ?? null,
      course_id: row.course_id ?? null,
      error_code: row.error_code ?? null,
      error_message: row.error_message ? row.error_message.slice(0, 500) : null,
      context: row.context ?? {},
    };
    const p = c.from("ai_gateway_call_log").insert(payload).then(({ error }: { error: unknown }) => {
      if (error) console.error("ai_gateway_call_log insert failed:", (error as { message?: string })?.message);
    });
    // @ts-ignore EdgeRuntime is available in Supabase functions
    if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as { waitUntil?: (p: Promise<unknown>) => void })?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(p);
    }
  } catch (e) {
    console.error("ai_gateway_call_log threw:", e);
  }
}
// ---------------------------------------------------------------------------

interface GeneratedQuestion {
  content_text: string;
  format: string;
  options: string[] | null;
  answer: string;
  difficulty_estimate: number;
  bloom_level: number;
  explanation: string;
  topic: string;
  bloom_justification: string;
  difficulty_justification: string;
}

interface TierSpec {
  tier: "standard" | "easy" | "medium" | "hard";
  count: number;
  difficulty: number;
  label: string;
  band: number;          // ± allowed delta around `difficulty` during validation
  maxAttempts: number;   // per-tier retry budget
}

const TIER_SPEC: TierSpec[] = [
  { tier: "standard", count: 10, difficulty: 0.5, band: 0.15, maxAttempts: 2, label: "Standard (medium difficulty, common to all students)" },
  { tier: "easy", count: 10, difficulty: 0.2, band: 0.15, maxAttempts: 2, label: "Easy adaptive tier (for struggling students)" },
  { tier: "medium", count: 10, difficulty: 0.5, band: 0.15, maxAttempts: 2, label: "Medium adaptive tier (for average students)" },
  // Hard tier widened: difficulty 0.80 ± 0.20 → [0.60, 1.00] covers both
  // EDGE_CASE (0.60-0.80) and COMPOSITE_REASONING (0.75-0.95) categories.
  // One extra attempt because hard joint constraints (difficulty + bloom ≥ 3
  // + category band) reject more candidates per batch.
  { tier: "hard", count: 10, difficulty: 0.80, band: 0.20, maxAttempts: 3, label: "Hard adaptive tier (for advanced students)" },
];
const TOTAL_QUESTIONS = TIER_SPEC.reduce((s, t) => s + t.count, 0);

// Use flash (not pro) — pro runs 40-60s per call and with 4 parallel tiers ×
// retries it blows past the 150s client invoke timeout.
const MODEL = "google/gemini-2.5-flash";
// Per-gateway-call timeout. Worst case per tier (parallel): maxAttempts ×
// GATEWAY_RETRIES × GATEWAY_CALL_TIMEOUT_MS must stay under the 150s client
// invoke timeout. Hard tier: 3 × 2 × 35s ≈ 210s — bounded by GLOBAL_DEADLINE_MS.
const GATEWAY_CALL_TIMEOUT_MS = 35_000;
// Global wall-clock budget for the whole function. Supabase invoke timeout is
// 150s; leave headroom for DB writes + JSON serialization.
const GLOBAL_DEADLINE_MS = 130_000;

// Sentinel error thrown when the AI Gateway returns 402 (credits exhausted).
// Caught at the top level and converted into a structured response so the UI
// can show an actionable "Add credits" message instead of an opaque 500.
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

interface RunCtx {
  requestId: string;
  teacherId: string | null;
  courseId: string | null;
  deadlineAt: number;       // epoch ms
  abortSignal: AbortSignal; // shared across tiers; aborted on 402
  abort: (reason: Error) => void;
  // Live per-tier progress tracking — used by the UI to render real progress.
  runId: string;
  admin: ReturnType<typeof createClient>;
  // Number of in-callGateway transient-error retries. Single-tier regen runs
  // set this to 1 so the worst-case wall-clock fits inside the deadline.
  gatewayRetries: number;
}

type DgrStatus = "pending" | "calling_model" | "validating" | "done" | "failed" | "skipped";

// Fire-and-forget progress update; never block the generation pipeline on it.
function updateRunRow(
  ctx: RunCtx,
  tier: string,
  patch: { status?: DgrStatus; accepted?: number; attempts?: number; error_code?: string | null },
) {
  const promise = ctx.admin
    .from("diagnostic_generation_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("run_id", ctx.runId)
    .eq("tier", tier)
    .then(({ error }) => {
      if (error) console.warn("dgr update failed", tier, error.message);
    });
  if (typeof (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime !== "undefined") {
    (globalThis as { EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime.waitUntil(promise);
  } else {
    void promise.catch(() => {});
  }
}

// Fire-and-forget event log for the admin diagnostic-runs viewer. Captures
// the full reasoning behind every step (start, gateway call, each validation
// reject, tier complete, etc.). Failures are swallowed — never block the run.
type EvtStatus = "info" | "ok" | "warn" | "error";
interface EvtRow {
  tier?: string | null;
  attempt?: number | null;
  status?: EvtStatus;
  message?: string;
  reason?: string;
  data?: Record<string, unknown>;
  gateway_call_id?: string | null;
  duration_ms?: number | null;
}
function logEvent(ctx: RunCtx | null, step: string, row: EvtRow = {}) {
  try {
    const c = logClient();
    if (!c || !ctx) return;
    const payload = {
      run_id: ctx.runId,
      course_id: ctx.courseId,
      tier: row.tier ?? null,
      attempt: row.attempt ?? null,
      step,
      status: row.status ?? "info",
      message: row.message ?? null,
      reason: row.reason ?? null,
      data: row.data ?? null,
      gateway_call_id: row.gateway_call_id ?? null,
      duration_ms: row.duration_ms ?? null,
    };
    const p = c.from("diagnostic_generation_events").insert(payload).then(({ error }: { error: unknown }) => {
      if (error) console.warn("dge insert failed:", (error as { message?: string })?.message);
    });
    if (typeof (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime !== "undefined") {
      (globalThis as { EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime.waitUntil(p);
    } else {
      void p.catch(() => {});
    }
  } catch (e) {
    console.warn("dge threw:", e);
  }
}

// Fixed categorization for bloom_justification (maps to bloom_level 1-6)
const BLOOM_CATEGORY_BY_LEVEL: Record<number, string> = {
  1: "RECALL",
  2: "COMPREHENSION",
  3: "APPLICATION",
  4: "ANALYSIS",
  5: "EVALUATION",
  6: "SYNTHESIS",
};
const BLOOM_CATEGORIES = new Set(Object.values(BLOOM_CATEGORY_BY_LEVEL));

// Fixed categorization for difficulty_justification with plausible difficulty bands
const DIFFICULTY_CATEGORY_BANDS: Record<string, [number, number]> = {
  SURFACE_RECOGNITION: [0.1, 0.3],
  SINGLE_STEP: [0.3, 0.5],
  MULTI_STEP: [0.4, 0.6],
  EDGE_CASE: [0.6, 0.8],
  COMPOSITE_REASONING: [0.75, 0.95],
};

const JUSTIFICATION_RE = /^([A-Z_]+):\s*(.+)$/;

interface ValidatedQuestion extends GeneratedQuestion {
  format: "mcq";
  options: string[];
}


interface ConceptInfo {
  id: string;
  code: string;
  weight: number;        // effective weight (>=0)
  weekNumber: number | null;
  weekName: string | null;
}

interface UnitInfo {
  weekNumber: number | null;
  weekName: string;
  concepts: ConceptInfo[];   // members
  weight: number;            // sum of member weights
}

type ValidationResult =
  | { ok: true; normalized: ValidatedQuestion }
  | { ok: false; reason: string };

function validateMcq(
  q: GeneratedQuestion,
  spec: TierSpec,
  conceptByCode: Record<string, ConceptInfo>,
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

  const rawTopic = typeof q.topic === "string" ? q.topic.trim() : "";
  if (!rawTopic) return { ok: false, reason: "empty topic" };
  let canonicalTopic: string | null = null;
  if (rawTopic in conceptByCode) {
    canonicalTopic = rawTopic;
  } else {
    const lower = rawTopic.toLowerCase();
    for (const code of Object.keys(conceptByCode)) {
      if (code.toLowerCase() === lower) { canonicalTopic = code; break; }
    }
  }
  if (!canonicalTopic || !conceptByCode[canonicalTopic]) {
    return { ok: false, reason: "topic not in concept list" };
  }

  let diff = Number(q.difficulty_estimate);
  if (!Number.isFinite(diff)) return { ok: false, reason: "difficulty not numeric" };
  diff = Math.max(0, Math.min(1, diff));
  if (diff < spec.difficulty - spec.band || diff > spec.difficulty + spec.band) {
    return { ok: false, reason: `difficulty ${diff.toFixed(2)} outside ±${spec.band} band` };
  }

  const bloom = Math.round(Number(q.bloom_level));
  if (!Number.isInteger(bloom) || bloom < 1 || bloom > 6) {
    return { ok: false, reason: "bloom_level out of range" };
  }
  if (spec.tier === "easy" && bloom > 4) return { ok: false, reason: `bloom ${bloom} too high for easy tier` };
  // Hard tier: bloom floor removed — difficulty + category band is sufficient signal.

  const explanation = typeof q.explanation === "string" ? q.explanation.trim() : "";
  if (!explanation) return { ok: false, reason: "empty explanation" };

  // bloom_justification: CATEGORY: rationale, non-empty, <=300 chars, category matches bloom_level
  const bj = typeof q.bloom_justification === "string" ? q.bloom_justification.trim() : "";
  if (!bj) return { ok: false, reason: "empty bloom_justification" };
  if (bj.length > 300) return { ok: false, reason: "bloom_justification > 300 chars" };
  const bjMatch = bj.match(JUSTIFICATION_RE);
  if (!bjMatch) return { ok: false, reason: "bloom_justification must be 'CATEGORY: rationale'" };
  const bjCat = bjMatch[1];
  if (!BLOOM_CATEGORIES.has(bjCat)) return { ok: false, reason: `bloom_justification category '${bjCat}' not allowed` };
  if (BLOOM_CATEGORY_BY_LEVEL[bloom] !== bjCat) {
    return { ok: false, reason: `bloom_justification category '${bjCat}' does not match bloom_level ${bloom}` };
  }

  // difficulty_justification: CATEGORY: rationale, non-empty, <=300 chars, category band contains difficulty_estimate
  const dj = typeof q.difficulty_justification === "string" ? q.difficulty_justification.trim() : "";
  if (!dj) return { ok: false, reason: "empty difficulty_justification" };
  if (dj.length > 300) return { ok: false, reason: "difficulty_justification > 300 chars" };
  const djMatch = dj.match(JUSTIFICATION_RE);
  if (!djMatch) return { ok: false, reason: "difficulty_justification must be 'CATEGORY: rationale'" };
  const djCat = djMatch[1];
  const band = DIFFICULTY_CATEGORY_BANDS[djCat];
  if (!band) return { ok: false, reason: `difficulty_justification category '${djCat}' not allowed` };
  if (diff < band[0] || diff > band[1]) {
    return { ok: false, reason: `difficulty_justification '${djCat}' band ${band[0]}-${band[1]} excludes difficulty ${diff.toFixed(2)}` };
  }

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
      topic: canonicalTopic,
      bloom_justification: bj,
      difficulty_justification: dj,
    },
  };
}


function isDuplicate(q: ValidatedQuestion, accepted: ValidatedQuestion[]): boolean {
  const key = q.content_text.slice(0, 120).toLowerCase();
  return accepted.some(
    (a) => a.content_text.slice(0, 120).toLowerCase() === key,
  );
}

// Hamilton (largest-remainder) allocation: distribute `total` slots across
// items proportional to weights, guaranteeing the integers sum exactly to total.
function hamiltonAllocate(weights: number[], total: number): number[] {
  const n = weights.length;
  if (n === 0 || total <= 0) return new Array(n).fill(0);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    // Uniform fallback
    const base = Math.floor(total / n);
    const rem = total - base * n;
    return weights.map((_, i) => base + (i < rem ? 1 : 0));
  }
  const exact = weights.map((w) => (w / sum) * total);
  const floors = exact.map((x) => Math.floor(x));
  let allocated = floors.reduce((a, b) => a + b, 0);
  const remainders = exact.map((x, i) => ({ i, frac: x - Math.floor(x) }));
  remainders.sort((a, b) => b.frac - a.frac);
  const result = floors.slice();
  let idx = 0;
  while (allocated < total && idx < remainders.length) {
    result[remainders[idx].i]++;
    allocated++;
    idx++;
  }
  return result;
}

// Seeded PRNG (mulberry32) for reproducible randomization within a tier.
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Weighted reservoir sampling without replacement: returns indices of `k`
// chosen units. Probability of selection is proportional to weight; with
// uniform weights this is a uniform random sample.
function pickUnitsWeighted(units: UnitInfo[], k: number, rng: () => number): number[] {
  const keys = units.map((u, i) => {
    const w = u.weight > 0 ? u.weight : 1e-9;
    const r = Math.max(rng(), 1e-12);
    return { i, key: Math.pow(r, 1 / w) };
  });
  keys.sort((a, b) => b.key - a.key);
  return keys.slice(0, k).map((x) => x.i);
}

// Compute per-tier quota: Map<conceptCode, count>
function computeTierQuota(units: UnitInfo[], totalSlots: number, seed: string): Record<string, number> {
  // 1) allocate slots across units. When there are more units than slots,
  // pick a random sample of units (weighted by aggregate weight) so we don't
  // always cover the same first-N weeks. Otherwise fall back to Hamilton so
  // every unit gets at least one slot.
  const rng = mulberry32(hashString(seed));
  let unitSlots: number[];
  if (units.length > totalSlots) {
    unitSlots = new Array(units.length).fill(0);
    const picked = pickUnitsWeighted(units, totalSlots, rng);
    for (const i of picked) unitSlots[i] = 1;
  } else {
    unitSlots = hamiltonAllocate(units.map((u) => u.weight), totalSlots);
  }

  const quota: Record<string, number> = {};
  units.forEach((unit, ui) => {
    const slots = unitSlots[ui];
    if (slots <= 0 || unit.concepts.length === 0) return;

    // 2) within unit, allocate to concepts by per-concept weight, capped at 1
    //    per concept until all concepts have one (avoids over-concentration).
    const conceptWeights = unit.concepts.map((c) => c.weight);
    let perConcept = hamiltonAllocate(conceptWeights, slots);

    // Cap: if slots <= concepts, no concept gets >1
    if (slots <= unit.concepts.length) {
      // Force binary distribution: pick top-`slots` by weight (Hamilton already approximates)
      // Convert any >1 entries into spread across zero-entries by descending weight
      const order = unit.concepts
        .map((c, i) => ({ i, w: c.weight }))
        .sort((a, b) => b.w - a.w);
      const desired: number[] = new Array(unit.concepts.length).fill(0);
      for (let k = 0; k < slots; k++) desired[order[k].i] = 1;
      perConcept = desired;
    }

    unit.concepts.forEach((c, ci) => {
      if (perConcept[ci] > 0) quota[c.code] = (quota[c.code] || 0) + perConcept[ci];
    });
  });
  return quota;
}

function formatQuotaForPrompt(units: UnitInfo[], quota: Record<string, number>): string {
  const lines: string[] = [];
  for (const unit of units) {
    const unitQuota = unit.concepts.reduce((sum, c) => sum + (quota[c.code] || 0), 0);
    if (unitQuota === 0) continue;
    const label = unit.weekNumber != null
      ? `Unit ${unit.weekNumber} — ${unit.weekName}`
      : unit.weekName;
    lines.push(`${label} (target: ${unitQuota} question${unitQuota === 1 ? "" : "s"})`);
    for (const c of unit.concepts) {
      const q = quota[c.code] || 0;
      if (q > 0) lines.push(`  - ${c.code} (target: ${q})`);
    }
  }
  return lines.join("\n");
}

async function callGateway(
  spec: TierSpec,
  needed: number,
  courseName: string,
  quotaBlock: string,
  remainingQuota: Record<string, number>,
  lovableKey: string,
  retryHint: string | null,
  ctx: RunCtx,
): Promise<GeneratedQuestion[]> {
  const logCtx = { requestId: ctx.requestId, teacherId: ctx.teacherId, courseId: ctx.courseId };
  // Hard tier over-generation: validation drops a higher share of hard
  // candidates, so ask for 1.5× needed (capped at 15) to absorb losses.
  const askFor = spec.tier === "hard" ? Math.min(15, Math.ceil(needed * 1.5)) : needed;
  const remainingList = Object.entries(remainingQuota)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `  - ${k}: ${v} more`)
    .join("\n");

  const systemPrompt = `You are an expert assessment designer creating diagnostic quiz questions for a course titled "${courseName}". Generate exactly ${askFor} ${spec.tier} tier diagnostic questions.

Tier: ${spec.label}
Target difficulty (0=easy, 1=hard): ${spec.difficulty}

CONCEPT QUOTA — distribute questions across units in the proportions below. The 'topic' field of each question MUST be one of the listed concept codes (exact match, case-sensitive). Do NOT exceed the per-concept target.

${quotaBlock}

REMAINING NEED for this batch (you must produce exactly these counts):
${remainingList || "  (none — quota satisfied)"}

STRICT RULES:
- ALL questions MUST be multiple-choice (format = "mcq"). Do NOT generate true_false or short_answer.
- Each question MUST have exactly 4 distinct, non-empty options in the options array (no letter prefixes like "A)").
- The answer field MUST be the FULL TEXT of one of the 4 options, character-for-character identical.
- The topic field MUST be one of the concept codes shown in the QUOTA above (exact match).
- Respect the per-concept quota above: do NOT over-generate for any concept.
- difficulty_estimate must be a number close to ${spec.difficulty} (within ±${spec.band}).
- bloom_level: integer 1-6 (1=Remember, 2=Understand, 3=Apply, 4=Analyze, 5=Evaluate, 6=Create).
- content_text: the question stem only, ≤ 600 characters, no embedded options.
- explanation: 1-2 sentences explaining why the correct option is correct.

CATEGORIZED JUSTIFICATIONS (required, ≤ 300 chars each, format "CATEGORY: 1-sentence rationale"):

bloom_justification — pick the CATEGORY that matches bloom_level EXACTLY:
  - RECALL (bloom_level=1): direct recall of a fact, syntax, or definition
  - COMPREHENSION (bloom_level=2): explain or interpret a concept or snippet
  - APPLICATION (bloom_level=3): apply a rule/procedure to a new but routine case
  - ANALYSIS (bloom_level=4): decompose, trace, compare, or debug
  - EVALUATION (bloom_level=5): judge correctness/quality against criteria
  - SYNTHESIS (bloom_level=6): design or construct a new solution

difficulty_justification — pick the CATEGORY whose band contains difficulty_estimate:
  - SURFACE_RECOGNITION (0.10-0.30): recognise a term/output, minimal reasoning
  - SINGLE_STEP (0.30-0.50): one rule or one line of code to reason about
  - MULTI_STEP (0.40-0.60): chain 2-3 concepts or steps
  - EDGE_CASE (0.60-0.80): corner case, subtle distractor, non-obvious behaviour
  - COMPOSITE_REASONING (0.75-0.95): integrate multiple concepts under constraints

Examples:
  bloom_justification: "APPLICATION: Student must apply the for-loop range pattern to a new iteration count."
  difficulty_justification: "SINGLE_STEP: One indexing operation determines the output."${retryHint ? `\n\nRETRY CONTEXT: ${retryHint}` : ""}`;


  // Retry transient upstream errors (5xx, 429) with exponential backoff so a
  // brief gateway hiccup doesn't burn one of the tier's MAX_ATTEMPTS.
  const GATEWAY_RETRIES = ctx.gatewayRetries;
  const baseBody = JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate ${askFor} ${spec.tier} tier MCQ diagnostic questions now, respecting the concept quota.` },
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
                      bloom_justification: { type: "string", description: "Format 'CATEGORY: rationale', ≤300 chars. CATEGORY must be one of RECALL, COMPREHENSION, APPLICATION, ANALYSIS, EVALUATION, SYNTHESIS and match bloom_level." },
                      difficulty_justification: { type: "string", description: "Format 'CATEGORY: rationale', ≤300 chars. CATEGORY must be one of SURFACE_RECOGNITION, SINGLE_STEP, MULTI_STEP, EDGE_CASE, COMPOSITE_REASONING and its band must contain difficulty_estimate." },
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
                      "bloom_justification",
                      "difficulty_justification",
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
    });

  let response: Response | null = null;
  let lastErr = "";
  for (let attempt = 0; attempt < GATEWAY_RETRIES; attempt++) {
    // Bail out early if a sibling tier triggered global abort (e.g. 402).
    if (ctx.abortSignal.aborted) {
      throw new Error(`aborted: ${(ctx.abortSignal.reason as Error)?.message || "sibling failure"}`);
    }
    // Reserve enough budget for at least one attempt; otherwise stop retrying.
    const budgetLeft = ctx.deadlineAt - Date.now();
    if (budgetLeft < GATEWAY_CALL_TIMEOUT_MS / 2) {
      throw new DeadlineExceededError(`tier ${spec.tier}: ${budgetLeft}ms left, need ≥${GATEWAY_CALL_TIMEOUT_MS / 2}ms`);
    }
    // Use the smaller of per-call timeout and remaining global budget.
    const perCallTimeout = Math.min(GATEWAY_CALL_TIMEOUT_MS, Math.max(5_000, budgetLeft - 1_000));
    const startedAt = Date.now();
    let statusForLog: number | null = null;
    let errMsgForLog: string | null = null;
    let errCodeForLog: string | null = null;
    try {
      // Combine per-call timeout with shared abort signal.
      const timeoutSignal = AbortSignal.timeout(perCallTimeout);
      const combinedSignal = AbortSignal.any
        ? AbortSignal.any([timeoutSignal, ctx.abortSignal])
        : timeoutSignal;
      updateRunRow(ctx, spec.tier, { status: "calling_model" });
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: combinedSignal,
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: baseBody,
      });
      statusForLog = response.status;
      if (response.ok) {
        logGatewayCall({
          model: MODEL,
          purpose: `tier:${spec.tier}`,
          http_status: statusForLog,
          outcome: "ok",
          attempt: attempt + 1,
          total_attempts: GATEWAY_RETRIES,
          duration_ms: Date.now() - startedAt,
          request_id: logCtx.requestId,
          teacher_id: logCtx.teacherId,
          course_id: logCtx.courseId,
          context: { needed, remaining_concepts: Object.keys(remainingQuota).length },
        });
        break;
      }
      // 402: credits exhausted — abort all sibling tiers + propagate typed error.
      if (response.status === 402) {
        const errText = await response.text();
        const credErr = new CreditsExhaustedError(errText.slice(0, 200) || "AI credits exhausted");
        logGatewayCall({
          model: MODEL,
          purpose: `tier:${spec.tier}`,
          http_status: 402,
          outcome: "client_error",
          attempt: attempt + 1,
          total_attempts: GATEWAY_RETRIES,
          duration_ms: Date.now() - startedAt,
          request_id: logCtx.requestId,
          teacher_id: logCtx.teacherId,
          course_id: logCtx.courseId,
          error_code: "credits_exhausted",
          error_message: errText.slice(0, 500),
          context: { needed },
        });
        ctx.abort(credErr);
        throw credErr;
      }
      // Retry on 429 / 5xx; fail fast on other 4xx (client errors won't fix themselves)
      if (response.status !== 429 && response.status < 500) {
        const errText = await response.text();
        errMsgForLog = errText.slice(0, 500);
        errCodeForLog = `http_${response.status}`;
        logGatewayCall({
          model: MODEL,
          purpose: `tier:${spec.tier}`,
          http_status: statusForLog,
          outcome: "client_error",
          attempt: attempt + 1,
          total_attempts: GATEWAY_RETRIES,
          duration_ms: Date.now() - startedAt,
          request_id: logCtx.requestId,
          teacher_id: logCtx.teacherId,
          course_id: logCtx.courseId,
          error_code: errCodeForLog,
          error_message: errMsgForLog,
          context: { needed },
        });
        throw new Error(`AI gateway ${response.status}: ${errText.slice(0, 200)}`);
      }
      const txt = await response.text();
      errMsgForLog = txt.slice(0, 500);
      errCodeForLog = `http_${response.status}`;
      lastErr = `${response.status}: ${txt.slice(0, 120)}`;
      logGatewayCall({
        model: MODEL,
        purpose: `tier:${spec.tier}`,
        http_status: statusForLog,
        outcome: "retryable",
        attempt: attempt + 1,
        total_attempts: GATEWAY_RETRIES,
        duration_ms: Date.now() - startedAt,
        request_id: logCtx.requestId,
        teacher_id: logCtx.teacherId,
        course_id: logCtx.courseId,
        error_code: errCodeForLog,
        error_message: errMsgForLog,
        context: { needed },
      });
    } catch (e) {
      // Re-throw fatal typed errors immediately so retries don't swallow them.
      if (e instanceof CreditsExhaustedError || e instanceof DeadlineExceededError) throw e;
      const msg = (e as Error).message ?? String(e);
      lastErr = msg.slice(0, 160);
      if (statusForLog == null) {
        const outcome = classifyOutcome(null, e);
        logGatewayCall({
          model: MODEL,
          purpose: `tier:${spec.tier}`,
          http_status: null,
          outcome,
          attempt: attempt + 1,
          total_attempts: GATEWAY_RETRIES,
          duration_ms: Date.now() - startedAt,
          request_id: logCtx.requestId,
          teacher_id: logCtx.teacherId,
          course_id: logCtx.courseId,
          error_code: outcome,
          error_message: msg.slice(0, 500),
          context: { needed },
        });
      }
      // network/timeout — fall through to backoff
    }
    if (attempt < GATEWAY_RETRIES - 1) {
      const backoff = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  if (!response || !response.ok) {
    throw new Error(`AI gateway transient failure after ${GATEWAY_RETRIES} retries: ${lastErr}`);
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
  distribution: Record<string, number>; // accepted count by concept_code
}

async function runTier(
  spec: TierSpec,
  courseName: string,
  units: UnitInfo[],
  conceptByCode: Record<string, ConceptInfo>,
  lovableKey: string,
  ctx: RunCtx,
  preSeed: ValidatedQuestion[] = [],
): Promise<TierResult> {
  const seed = `${courseName}:${spec.tier}:${Date.now()}:${Math.random()}`;
  const quota = computeTierQuota(units, spec.count, seed);
  const quotaBlock = formatQuotaForPrompt(units, quota);

  // Pre-seed with existing accepted rows so tier-only regens accumulate
  // instead of restarting from zero. Filter to entries that still satisfy
  // current validation + quota constraints.
  const accepted: ValidatedQuestion[] = [];
  const acceptedByCode: Record<string, number> = {};
  for (const ex of preSeed) {
    const v = validateMcq(ex, spec, conceptByCode);
    if (!v.ok) continue;
    const code = v.normalized.topic;
    const cap = quota[code] || 0;
    if (cap === 0) continue;
    if ((acceptedByCode[code] || 0) >= cap) continue;
    if (isDuplicate(v.normalized, accepted)) continue;
    accepted.push(v.normalized);
    acceptedByCode[code] = (acceptedByCode[code] || 0) + 1;
    if (accepted.length >= spec.count) break;
  }
  const reasons: string[] = [];
  let attempts = 0;
  let lastInvalidCount = 0;

  logEvent(ctx, "tier_started", {
    tier: spec.tier,
    message: `tier ${spec.tier}: need ${spec.count}, pre-seeded ${accepted.length}, maxAttempts ${spec.maxAttempts}`,
    data: {
      requested: spec.count,
      pre_seeded: accepted.length,
      max_attempts: spec.maxAttempts,
      difficulty: spec.difficulty,
      band: spec.band,
      quota,
    },
  });

  while (accepted.length < spec.count && attempts < spec.maxAttempts) {
    // Stop retry loop if global deadline or shared abort fired.
    if (ctx.abortSignal.aborted) {
      const m = `aborted: ${(ctx.abortSignal.reason as Error)?.message || "sibling failure"}`;
      reasons.push(m);
      logEvent(ctx, "tier_aborted", { tier: spec.tier, status: "warn", message: m });
      break;
    }
    if (Date.now() >= ctx.deadlineAt) {
      reasons.push("global deadline exceeded before next attempt");
      logEvent(ctx, "deadline_check", {
        tier: spec.tier,
        status: "warn",
        message: "global deadline exceeded before next attempt",
        data: { deadline_at: ctx.deadlineAt, now: Date.now() },
      });
      break;
    }
    attempts++;
    // Compute remaining quota
    const remaining: Record<string, number> = {};
    for (const [code, n] of Object.entries(quota)) {
      const got = acceptedByCode[code] || 0;
      if (got < n) remaining[code] = n - got;
    }
    const needed = Object.values(remaining).reduce((a, b) => a + b, 0);
    if (needed === 0) break;

    const budgetLeft = ctx.deadlineAt - Date.now();
    logEvent(ctx, "attempt_started", {
      tier: spec.tier,
      attempt: attempts,
      message: `attempt ${attempts}/${spec.maxAttempts}: need ${needed}, budget ${budgetLeft}ms`,
      data: { needed, remaining, budget_ms: budgetLeft, accepted_so_far: accepted.length },
    });

    const retryHint = attempts > 1
      ? `Previous batch had ${lastInvalidCount} invalid or over-quota questions. Common issues: ${[...new Set(reasons)].slice(0, 3).join("; ")}. Generate exactly the REMAINING NEED counts shown above.`
      : null;

    let batch: GeneratedQuestion[] = [];
    const gwStart = Date.now();
    try {
      batch = await callGateway(spec, needed, courseName, quotaBlock, remaining, lovableKey, retryHint, ctx);
      logEvent(ctx, "gateway_response", {
        tier: spec.tier,
        attempt: attempts,
        status: "ok",
        message: `gateway returned ${batch.length} candidates in ${Date.now() - gwStart}ms`,
        duration_ms: Date.now() - gwStart,
        data: { candidates: batch.length, needed },
      });
    } catch (e) {
      // Propagate fatal typed errors so the top-level handler can respond properly.
      if (e instanceof CreditsExhaustedError) {
        updateRunRow(ctx, spec.tier, { status: "failed", attempts, error_code: "credits_exhausted" });
        logEvent(ctx, "tier_skipped", {
          tier: spec.tier,
          attempt: attempts,
          status: "error",
          message: "credits exhausted",
          reason: (e as Error).message,
        });
        throw e;
      }
      if (e instanceof DeadlineExceededError) {
        const m = `deadline: ${(e as Error).message.slice(0, 120)}`;
        reasons.push(m);
        updateRunRow(ctx, spec.tier, { status: "skipped", attempts, error_code: "deadline" });
        logEvent(ctx, "tier_skipped", {
          tier: spec.tier,
          attempt: attempts,
          status: "error",
          message: m,
          reason: (e as Error).message,
        });
        break;
      }
      const m = `gateway error: ${(e as Error).message.slice(0, 200)}`;
      reasons.push(m);
      updateRunRow(ctx, spec.tier, { attempts });
      logEvent(ctx, "gateway_response", {
        tier: spec.tier,
        attempt: attempts,
        status: "error",
        message: m,
        reason: (e as Error).message,
        duration_ms: Date.now() - gwStart,
      });
      continue;
    }

    updateRunRow(ctx, spec.tier, { status: "validating", attempts });
    lastInvalidCount = 0;
    const rejectBreakdown: Record<string, number> = {};
    const recordReject = (reasonText: string, candidate: GeneratedQuestion) => {
      const key = reasonText.split(":")[0].trim().slice(0, 60) || "unknown";
      rejectBreakdown[key] = (rejectBreakdown[key] || 0) + 1;
      logEvent(ctx, "validation_reject", {
        tier: spec.tier,
        attempt: attempts,
        status: "warn",
        message: reasonText.slice(0, 200),
        reason: reasonText,
        data: {
          topic: candidate?.topic,
          difficulty_estimate: candidate?.difficulty_estimate,
          bloom_level: candidate?.bloom_level,
          difficulty_justification: candidate?.difficulty_justification,
          bloom_justification: candidate?.bloom_justification,
          content_preview: String(candidate?.content_text ?? "").slice(0, 160),
        },
      });
    };
    const acceptedThisAttempt: string[] = [];
    for (const q of batch) {
      const v = validateMcq(q, spec, conceptByCode);
      if (!v.ok) {
        reasons.push(v.reason);
        lastInvalidCount++;
        recordReject(v.reason, q);
        continue;
      }
      // Quota enforcement
      const code = v.normalized.topic;
      const cap = quota[code] || 0;
      if (cap === 0) {
        const r = `concept ${code} not in tier quota`;
        reasons.push(r);
        lastInvalidCount++;
        recordReject(r, q);
        continue;
      }
      if ((acceptedByCode[code] || 0) >= cap) {
        const r = `over-quota for ${code}`;
        reasons.push(r);
        lastInvalidCount++;
        recordReject(r, q);
        continue;
      }
      if (isDuplicate(v.normalized, accepted)) {
        reasons.push("duplicate content");
        lastInvalidCount++;
        recordReject("duplicate content", q);
        continue;
      }
      accepted.push(v.normalized);
      acceptedByCode[code] = (acceptedByCode[code] || 0) + 1;
      acceptedThisAttempt.push(code);
      if (accepted.length >= spec.count) break;
    }
    updateRunRow(ctx, spec.tier, { accepted: accepted.length, attempts });
    logEvent(ctx, "validation_summary", {
      tier: spec.tier,
      attempt: attempts,
      status: lastInvalidCount > 0 ? "warn" : "ok",
      message: `accepted ${acceptedThisAttempt.length} / rejected ${lastInvalidCount} (cumulative ${accepted.length}/${spec.count})`,
      data: {
        accepted_this_attempt: acceptedThisAttempt.length,
        rejected_this_attempt: lastInvalidCount,
        cumulative_accepted: accepted.length,
        reject_breakdown: rejectBreakdown,
        accepted_topics: acceptedThisAttempt,
      },
    });
  }

  const finalStatus: DgrStatus = accepted.length >= spec.count ? "done" : "failed";
  updateRunRow(ctx, spec.tier, {
    status: finalStatus,
    accepted: accepted.length,
    attempts,
    error_code: finalStatus === "failed" ? "incomplete" : null,
  });
  logEvent(ctx, finalStatus === "done" ? "tier_complete" : "tier_partial", {
    tier: spec.tier,
    status: finalStatus === "done" ? "ok" : "error",
    message: `tier ${spec.tier}: ${accepted.length}/${spec.count} after ${attempts} attempt${attempts === 1 ? "" : "s"}`,
    reason: finalStatus === "failed" ? [...new Set(reasons)].slice(0, 8).join(" | ") : undefined,
    data: {
      accepted: accepted.length,
      requested: spec.count,
      attempts,
      distribution: acceptedByCode,
      sample_reasons: [...new Set(reasons)].slice(0, 8),
    },
  });


  return {
    tier: spec.tier,
    accepted,
    attempts,
    requested: spec.count,
    sampleReasons: [...new Set(reasons)].slice(0, 5),
    distribution: acceptedByCode,
  };
}

// Build units from concepts + lesson_plan_weeks
function buildUnits(
  concepts: { id: string; concept_code: string; weight: number }[],
  weeks: { week_number: number; week_name: string; concepts: any }[],
): { units: UnitInfo[]; conceptByCode: Record<string, ConceptInfo> } {
  // Map concept_code (lowercased) -> {weekNumber, weekName}
  const codeToWeek: Record<string, { num: number; name: string }> = {};
  for (const w of weeks) {
    const arr = Array.isArray(w.concepts) ? w.concepts : [];
    for (const item of arr) {
      const name = typeof item?.name === "string" ? item.name.trim() : "";
      if (name) codeToWeek[name.toLowerCase()] = { num: w.week_number, name: w.week_name || `Week ${w.week_number}` };
    }
  }

  // Group concepts into units; concepts without a matching week go into "Unassigned"
  const unitMap = new Map<string, UnitInfo>();
  const conceptByCode: Record<string, ConceptInfo> = {};

  for (const c of concepts) {
    const match = codeToWeek[c.concept_code.toLowerCase()] || null;
    const info: ConceptInfo = {
      id: c.id,
      code: c.concept_code,
      // Effective weight: if all weights are 0 we fall back later; here keep 0.
      weight: Number.isFinite(c.weight) && c.weight > 0 ? Number(c.weight) : 0,
      weekNumber: match ? match.num : null,
      weekName: match ? match.name : null,
    };
    conceptByCode[c.concept_code] = info;
    const key = match ? `w${match.num}` : "unassigned";
    if (!unitMap.has(key)) {
      unitMap.set(key, {
        weekNumber: match ? match.num : null,
        weekName: match ? match.name : "Unassigned (no lesson-plan match)",
        concepts: [],
        weight: 0,
      });
    }
    unitMap.get(key)!.concepts.push(info);
  }

  // Apply uniform fallback per unit when all weights are 0
  for (const unit of unitMap.values()) {
    const total = unit.concepts.reduce((s, c) => s + c.weight, 0);
    if (total === 0 && unit.concepts.length > 0) {
      const w = 1 / unit.concepts.length;
      for (const c of unit.concepts) c.weight = w;
    }
    unit.weight = unit.concepts.reduce((s, c) => s + c.weight, 0);
  }

  // Sort units: real weeks ascending, unassigned last
  const units = Array.from(unitMap.values()).sort((a, b) => {
    if (a.weekNumber == null && b.weekNumber == null) return 0;
    if (a.weekNumber == null) return 1;
    if (b.weekNumber == null) return -1;
    return a.weekNumber - b.weekNumber;
  });

  return { units, conceptByCode };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const courseId: string | undefined = body?.courseId;
    const requestedTiersRaw: unknown = body?.tiers;
    if (!courseId) {
      return new Response(JSON.stringify({ error: "courseId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional tier filter — when provided, regenerate only those tiers and
    // leave existing rows for the other tiers untouched. Default: all tiers.
    const ALL_TIERS = TIER_SPEC.map((s) => s.tier);
    let activeSpecs: TierSpec[] = TIER_SPEC;
    if (Array.isArray(requestedTiersRaw) && requestedTiersRaw.length > 0) {
      const allowed = new Set(ALL_TIERS);
      const requested = (requestedTiersRaw as unknown[])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase())
        .filter((t) => allowed.has(t as TierSpec["tier"]));
      if (requested.length === 0) {
        return new Response(JSON.stringify({
          error: `tiers must be a subset of ${ALL_TIERS.join(", ")}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const set = new Set(requested);
      activeSpecs = TIER_SPEC.filter((s) => set.has(s.tier));
    }
    const isPartialRun = activeSpecs.length < TIER_SPEC.length;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [{ data: course, error: cErr }, { data: concepts }, { data: weeks }] = await Promise.all([
      admin.from("courses").select("id, name, teacher_id, course_code").eq("id", courseId).maybeSingle(),
      admin.from("concepts").select("id, concept_code, weight").eq("course_id", courseId),
      admin.from("lesson_plan_weeks").select("week_number, week_name, concepts").eq("course_id", courseId).order("week_number"),
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

    const { units, conceptByCode } = buildUnits(concepts, weeks || []);

    const requestId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const abortController = new AbortController();
    // Single-tier regen: give it the whole Supabase invoke budget (minus
    // headroom) and drop in-call retries to 1 so worst case fits comfortably.
    const isSingleTier = activeSpecs.length === 1;
    const deadlineBudgetMs = isSingleTier ? 145_000 : GLOBAL_DEADLINE_MS;
    const gatewayRetries = isSingleTier ? 1 : 2;
    const ctx: RunCtx = {
      requestId,
      teacherId: (course as { teacher_id?: string }).teacher_id ?? null,
      courseId: courseId as string,
      deadlineAt: Date.now() + deadlineBudgetMs,
      abortSignal: abortController.signal,
      abort: (reason: Error) => {
        if (!abortController.signal.aborted) abortController.abort(reason);
      },
      runId,
      admin,
      gatewayRetries,
    };

    // Seed one progress row per active tier so the client can render live status.
    const seedRows = activeSpecs.map((spec) => ({
      run_id: runId,
      course_id: courseId,
      tier: spec.tier,
      status: "pending" as DgrStatus,
      requested: spec.count,
      accepted: 0,
      attempts: 0,
    }));
    const { error: seedErr } = await admin.from("diagnostic_generation_runs").insert(seedRows);
    if (seedErr) console.warn("dgr seed failed:", seedErr.message);

    const runStartedAt = Date.now();
    logEvent(ctx, "run_started", {
      message: `run ${runId.slice(0, 8)}: ${activeSpecs.map((s) => s.tier).join(",")} (deadline ${deadlineBudgetMs}ms)`,
      data: {
        course_id: courseId,
        course_name: course.name,
        requested_tiers: activeSpecs.map((s) => s.tier),
        is_partial_run: isPartialRun,
        deadline_ms: deadlineBudgetMs,
        gateway_retries: gatewayRetries,
        concepts: concepts.length,
        weeks: (weeks || []).length,
      },
    });

    // Pre-seed accepted bank for tier-only regens: load existing rows for the
    // requested tiers so successive regens accumulate (e.g. 0 → 6 → 10) instead
    // of restarting from zero each time. Full-run regens (all 4 tiers) skip
    // this — they always replace the whole bank.
    const preSeedByTier: Record<string, ValidatedQuestion[]> = {};
    if (isPartialRun) {
      const { data: existing } = await admin
        .from("diagnostic_questions")
        .select("content_text, format, options, answer, difficulty_estimate, bloom_level, explanation, topic, bloom_justification, difficulty_justification, tier")
        .eq("course_id", courseId)
        .in("tier", activeSpecs.map((s) => s.tier));
      for (const r of (existing || []) as Array<Record<string, unknown>>) {
        const tier = r.tier as string | null;
        if (!tier) continue;
        (preSeedByTier[tier] ||= []).push({
          content_text: String(r.content_text ?? ""),
          format: "mcq",
          options: (r.options as string[]) || [],
          answer: String(r.answer ?? ""),
          difficulty_estimate: Number(r.difficulty_estimate ?? 0),
          bloom_level: Number(r.bloom_level ?? 1),
          explanation: String(r.explanation ?? ""),
          topic: String(r.topic ?? ""),
          bloom_justification: String(r.bloom_justification ?? ""),
          difficulty_justification: String(r.difficulty_justification ?? ""),
        });
      }
      logEvent(ctx, "preseed_loaded", {
        message: `preseed counts: ${Object.entries(preSeedByTier).map(([t, a]) => `${t}:${a.length}`).join(", ") || "none"}`,
        data: Object.fromEntries(activeSpecs.map((s) => [s.tier, (preSeedByTier[s.tier] || []).length])),
      });
    }

    logEvent(ctx, "specs_built", {
      message: `running ${activeSpecs.length} tier${activeSpecs.length === 1 ? "" : "s"}`,
      data: { specs: activeSpecs.map((s) => ({ tier: s.tier, count: s.count, max_attempts: s.maxAttempts })) },
    });

    // Run only the active tiers in parallel with retries
    const settled = await Promise.allSettled(
      activeSpecs.map((spec) => runTier(spec, course.name, units, conceptByCode, lovableKey, ctx, preSeedByTier[spec.tier] || [])),
    );


    // If any tier failed with CreditsExhaustedError, short-circuit with a
    // typed response so the UI can show an actionable billing message.
    const creditsRejected = settled.find(
      (r) => r.status === "rejected" && r.reason instanceof CreditsExhaustedError,
    );
    if (creditsRejected && creditsRejected.status === "rejected") {
      // Mark any tiers still 'pending'/'calling_model' as failed so the UI shows it immediately.
      await admin
        .from("diagnostic_generation_runs")
        .update({ status: "failed", error_code: "credits_exhausted", updated_at: new Date().toISOString() })
        .eq("run_id", runId)
        .in("status", ["pending", "calling_model", "validating"]);
      return new Response(
        JSON.stringify({
          error: "credits_exhausted",
          message: "AI credits are exhausted for this workspace. Add credits and try again.",
          detail: (creditsRejected.reason as Error).message.slice(0, 200),
          runId,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tierResults: TierResult[] = settled.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return {
        tier: activeSpecs[i].tier,
        accepted: [],
        attempts: activeSpecs[i].maxAttempts,
        requested: activeSpecs[i].count,
        sampleReasons: [`tier failed: ${(r.reason as Error)?.message?.slice(0, 80) || "unknown"}`],
        distribution: {},
      };
    });

    const allComplete = tierResults.every((t) => t.accepted.length === t.requested);
    const breakdown = tierResults.map((t) => ({
      tier: t.tier,
      accepted: t.accepted.length,
      requested: t.requested,
      attempts: t.attempts,
      sampleReasons: t.sampleReasons,
      distribution: t.distribution,
    }));

    // Per-tier resilient insert: persist EVERY tier that produced any accepted
    // questions, even if it fell short of its quota. The teacher can click
    // "Regenerate <tier>" again; pre-seeding will load these rows so the next
    // attempt fills the remainder instead of restarting from zero.
    // Only reject everything when ZERO tiers produced any accepts.
    const completeTiers = new Set(
      tierResults.filter((t) => t.accepted.length > 0).map((t) => t.tier),
    );

    if (completeTiers.size === 0) {
      return new Response(
        JSON.stringify({
          error: "Could not produce a complete diagnostic set after retries.",
          breakdown,
          runId,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build rows per tier (only tiers that hit full quota), then delete+insert
    // per tier. Tiers NOT in `activeSpecs` are never touched.
    const rowsByTier = new Map<string, any[]>();
    for (const t of tierResults) {
      if (!completeTiers.has(t.tier)) continue;
      const spec = TIER_SPEC.find((s) => s.tier === t.tier)!;
      let counter = 1;
      const list: any[] = [];
      for (const q of t.accepted) {
        const recheck = validateMcq(q, spec, conceptByCode);
        if (!recheck.ok) {
          console.warn("pre-insert revalidation dropped row:", recheck.reason);
          continue;
        }
        const conceptInfo = conceptByCode[recheck.normalized.topic];
        if (!conceptInfo?.id) {
          console.warn("pre-insert: missing concept_id for topic", recheck.normalized.topic);
          continue;
        }
        list.push({
          item_code: `${course.course_code || "Q"}-${t.tier.toUpperCase()}-${String(counter).padStart(3, "0")}`,
          content_text: recheck.normalized.content_text,
          format: recheck.normalized.format,
          options: recheck.normalized.options,
          answer: recheck.normalized.answer,
          difficulty_estimate: recheck.normalized.difficulty_estimate,
          bloom_level: recheck.normalized.bloom_level,
          explanation: recheck.normalized.explanation,
          topic: recheck.normalized.topic,
          bloom_justification: recheck.normalized.bloom_justification,
          difficulty_justification: recheck.normalized.difficulty_justification,

          concept_id: conceptInfo.id,
          course_id: course.id,
          teacher_id: course.teacher_id,
          in_test: true,
          is_distractor: false,
          tier: t.tier,
        });
        counter++;
      }
      if (list.length > 0) rowsByTier.set(t.tier, list);
    }

    const totalRows = Array.from(rowsByTier.values()).reduce((s, l) => s + l.length, 0);
    if (totalRows === 0) {
      return new Response(
        JSON.stringify({
          error: "Pre-insert revalidation dropped every row.",
          finalCount: 0,
          breakdown,
          runId,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Per-tier delete + insert. Only tiers that successfully regenerated are
    // touched; other tiers' existing questions remain intact.
    for (const [tier, list] of rowsByTier) {
      const dbStart = Date.now();
      const { error: delErr, count: deletedCount } = await admin
        .from("diagnostic_questions")
        .delete({ count: "exact" })
        .eq("course_id", course.id)
        .eq("tier", tier);
      if (delErr) {
        console.error(`per-tier delete failed (${tier}):`, delErr.message);
        logEvent(ctx, "db_replace", {
          tier,
          status: "error",
          message: `delete failed: ${delErr.message}`,
          reason: delErr.message,
          duration_ms: Date.now() - dbStart,
        });
        continue;
      }
      const { error: insertErr } = await admin.from("diagnostic_questions").insert(list);
      if (insertErr) {
        console.error(`per-tier insert failed (${tier}):`, insertErr.message);
        logEvent(ctx, "db_replace", {
          tier,
          status: "error",
          message: `insert failed: ${insertErr.message}`,
          reason: insertErr.message,
          duration_ms: Date.now() - dbStart,
          data: { deleted: deletedCount ?? null, attempted_insert: list.length },
        });
      } else {
        logEvent(ctx, "db_replace", {
          tier,
          status: "ok",
          message: `replaced tier ${tier}: deleted ${deletedCount ?? "?"} / inserted ${list.length}`,
          duration_ms: Date.now() - dbStart,
          data: { deleted: deletedCount ?? null, inserted: list.length },
        });
      }
    }


    const { count: orphanCount } = await admin
      .from("diagnostic_questions")
      .select("id", { count: "exact", head: true })
      .eq("course_id", course.id)
      .is("concept_id", null);
    if ((orphanCount ?? 0) > 0) {
      return new Response(
        JSON.stringify({ error: `Inserted ${orphanCount} orphan rows (concept_id null). Aborting.` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const unitAgg: Record<string, { weekNumber: number | null; weekName: string; count: number }> = {};
    for (const unit of units) {
      const key = unit.weekNumber == null ? "unassigned" : `w${unit.weekNumber}`;
      unitAgg[key] = { weekNumber: unit.weekNumber, weekName: unit.weekName, count: 0 };
    }
    for (const t of tierResults) {
      for (const [code, n] of Object.entries(t.distribution)) {
        const info = conceptByCode[code];
        if (!info) continue;
        const key = info.weekNumber == null ? "unassigned" : `w${info.weekNumber}`;
        if (unitAgg[key]) unitAgg[key].count += n;
      }
    }
    const distributionByUnit = Object.values(unitAgg)
      .filter((u) => u.count > 0)
      .map((u) => ({
        unit: u.weekNumber != null ? `Unit ${u.weekNumber} — ${u.weekName}` : u.weekName,
        weekNumber: u.weekNumber,
        count: u.count,
      }))
      .sort((a, b) => {
        if (a.weekNumber == null && b.weekNumber == null) return 0;
        if (a.weekNumber == null) return 1;
        if (b.weekNumber == null) return -1;
        return a.weekNumber - b.weekNumber;
      });


    // `partial` is scoped to THIS run's requested tiers. A successful
    // hard-only top-up returns partial=false even if other tiers were skipped.
    const requestedQuota = activeSpecs.reduce((s, sp) => s + sp.count, 0);
    const partial = !allComplete;
    const shortTiers = tierResults
      .filter((t) => t.accepted.length < t.requested)
      .map((t) => t.tier);
    const requestedTiers = activeSpecs.map((s) => s.tier);

    return new Response(
      JSON.stringify({
        message: partial
          ? `Generated ${totalRows}/${requestedQuota} diagnostic questions (short on: ${shortTiers.join(", ")}). Regenerate to top up.`
          : isPartialRun
            ? `Topped up ${requestedTiers.join(", ")} tier${requestedTiers.length === 1 ? "" : "s"} — ${totalRows} questions.`
            : `Generated ${totalRows} diagnostic questions across ${distributionByUnit.length} units`,
        partial,
        shortTiers,
        requestedTiers,
        breakdown,
        distributionByUnit,
        runId,
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
