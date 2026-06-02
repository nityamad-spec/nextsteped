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
const MODEL = "google/gemini-2.5-pro";
const DIFFICULTY_BAND = 0.15;

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
  if (diff < spec.difficulty - DIFFICULTY_BAND || diff > spec.difficulty + DIFFICULTY_BAND) {
    return { ok: false, reason: `difficulty ${diff.toFixed(2)} outside ±${DIFFICULTY_BAND} band` };
  }

  const bloom = Math.round(Number(q.bloom_level));
  if (!Number.isInteger(bloom) || bloom < 1 || bloom > 6) {
    return { ok: false, reason: "bloom_level out of range" };
  }
  if (spec.tier === "easy" && bloom > 4) return { ok: false, reason: `bloom ${bloom} too high for easy tier` };
  if (spec.tier === "hard" && bloom < 3) return { ok: false, reason: `bloom ${bloom} too low for hard tier` };

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
      topic: canonicalTopic,
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
): Promise<GeneratedQuestion[]> {
  const remainingList = Object.entries(remainingQuota)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `  - ${k}: ${v} more`)
    .join("\n");

  const systemPrompt = `You are an expert assessment designer creating diagnostic quiz questions for a course titled "${courseName}". Generate exactly ${needed} ${spec.tier} tier diagnostic questions.

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
      model: await resolveModel("generate-diagnostic-questions", null, MODEL),
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate ${needed} ${spec.tier} tier MCQ diagnostic questions now, respecting the concept quota.` },
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
  distribution: Record<string, number>; // accepted count by concept_code
}

async function runTier(
  spec: TierSpec,
  courseName: string,
  units: UnitInfo[],
  conceptByCode: Record<string, ConceptInfo>,
  lovableKey: string,
): Promise<TierResult> {
  const seed = `${courseName}:${spec.tier}:${Date.now()}:${Math.random()}`;
  const quota = computeTierQuota(units, spec.count, seed);
  const quotaBlock = formatQuotaForPrompt(units, quota);

  const accepted: ValidatedQuestion[] = [];
  const acceptedByCode: Record<string, number> = {};
  const reasons: string[] = [];
  let attempts = 0;
  let lastInvalidCount = 0;

  while (accepted.length < spec.count && attempts < MAX_ATTEMPTS) {
    attempts++;
    // Compute remaining quota
    const remaining: Record<string, number> = {};
    for (const [code, n] of Object.entries(quota)) {
      const got = acceptedByCode[code] || 0;
      if (got < n) remaining[code] = n - got;
    }
    const needed = Object.values(remaining).reduce((a, b) => a + b, 0);
    if (needed === 0) break;

    const retryHint = attempts > 1
      ? `Previous batch had ${lastInvalidCount} invalid or over-quota questions. Common issues: ${[...new Set(reasons)].slice(0, 3).join("; ")}. Generate exactly the REMAINING NEED counts shown above.`
      : null;

    let batch: GeneratedQuestion[] = [];
    try {
      batch = await callGateway(spec, needed, courseName, quotaBlock, remaining, lovableKey, retryHint);
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
      // Quota enforcement
      const code = v.normalized.topic;
      const cap = quota[code] || 0;
      if (cap === 0) {
        reasons.push(`concept ${code} not in tier quota`);
        lastInvalidCount++;
        continue;
      }
      if ((acceptedByCode[code] || 0) >= cap) {
        reasons.push(`over-quota for ${code}`);
        lastInvalidCount++;
        continue;
      }
      if (isDuplicate(v.normalized, accepted)) {
        reasons.push("duplicate content");
        lastInvalidCount++;
        continue;
      }
      accepted.push(v.normalized);
      acceptedByCode[code] = (acceptedByCode[code] || 0) + 1;
      if (accepted.length >= spec.count) break;
    }
  }

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

    // Run all tiers in parallel with retries
    const settled = await Promise.allSettled(
      TIER_SPEC.map((spec) => runTier(spec, course.name, units, conceptByCode, lovableKey)),
    );

    const tierResults: TierResult[] = settled.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return {
        tier: TIER_SPEC[i].tier,
        accepted: [],
        attempts: MAX_ATTEMPTS,
        requested: TIER_SPEC[i].count,
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

    if (!allComplete) {
      return new Response(
        JSON.stringify({
          error: "Could not produce a complete diagnostic set after retries.",
          breakdown,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Note: Unit selection is randomized per tier (weighted reservoir sampling),
    // so we intentionally do NOT enforce a per-unit quota floor here. Coverage
    // across the full 20 questions is probabilistic by design.

    // Build rows for insertion
    const rows: any[] = [];
    let counter = 1;
    for (const t of tierResults) {
      const spec = TIER_SPEC.find((s) => s.tier === t.tier)!;
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
        rows.push({
          item_code: `${course.course_code || "Q"}-${t.tier.toUpperCase()}-${String(counter).padStart(3, "0")}`,
          content_text: recheck.normalized.content_text,
          format: recheck.normalized.format,
          options: recheck.normalized.options,
          answer: recheck.normalized.answer,
          difficulty_estimate: recheck.normalized.difficulty_estimate,
          bloom_level: recheck.normalized.bloom_level,
          explanation: recheck.normalized.explanation,
          topic: recheck.normalized.topic,
          concept_id: conceptInfo.id,
          course_id: course.id,
          teacher_id: course.teacher_id,
          in_test: true,
          is_distractor: false,
        });
        counter++;
      }
    }

    if (rows.length !== 20) {
      return new Response(
        JSON.stringify({
          error: "Pre-insert revalidation reduced row count below 20.",
          finalCount: rows.length,
          breakdown,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await admin.from("diagnostic_questions").delete().eq("course_id", course.id);
    const { error: insertErr } = await admin.from("diagnostic_questions").insert(rows);
    if (insertErr) throw insertErr;

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


    return new Response(
      JSON.stringify({
        message: `Generated ${rows.length} diagnostic questions across ${distributionByUnit.length} units`,
        breakdown,
        distributionByUnit,
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
