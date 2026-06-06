// Edge function: score-diagnostic
// Computes a single course-level mastery score (0..1) + learner level for a
// student's diagnostic submission, and writes the row to diagnostic_results.
//
// All tuning numbers live in CONFIG below.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------- Tuning block (single source of truth) ----------
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const CONFIG = {
  // Cognitive depth weights (Bloom 1..6).
  BLOOM_WEIGHT: { 1: 1.0, 2: 1.2, 3: 1.5, 4: 1.8, 5: 2.1, 6: 2.5 } as Record<number, number>,

  // Expected solve time per bloom level (baseline at difficulty 0.5), in ms.
  EXPECTED_TIME_BASE_MS: {
    1: 20_000, 2: 30_000, 3: 45_000, 4: 60_000, 5: 80_000, 6: 110_000,
  } as Record<number, number>,
  DIFFICULTY_TIME_FACTOR: (d: number) => 0.6 + 1.0 * clamp01(d), // 0.6x..1.6x

  // Pace curve constants
  PACE_GUESS_FLOOR: 0.2,    // score when r < PACE_FAST_CUTOFF
  PACE_FAST_CUTOFF: 0.25,   // r below this is treated as guessing
  PACE_SLOW_DECAY: 2.0,     // exp decay scale for r > 1

  // Final mastery combination weights (sum should be 1.0)
  WEIGHTS: { accuracy: 0.70, pace: 0.15, confidence: 0.15 },

  // Equal 25% bands. Lower inclusive, upper exclusive, except top band includes 1.0.
  // Use 1.0001 sentinel so 1.0 lands in "expert".
  LEVEL_BANDS: [
    { max: 0.25,   level: "beginner" },
    { max: 0.50,   level: "developing" },
    { max: 0.75,   level: "proficient" },
    { max: 1.0001, level: "expert" },
  ],

  // Confidence: 3-level discrete scale from UI [0,1,2] mapped to [0..1].
  CONFIDENCE_LEVELS: { 0: 0.0, 1: 0.5, 2: 1.0 } as Record<number, number>,
  CONFIDENCE_DEFAULT: 1,
} as const;

type LearnerLevel = "beginner" | "developing" | "proficient" | "expert";

function bandFor(score: number): LearnerLevel {
  const s = clamp01(score);
  for (const b of CONFIG.LEVEL_BANDS) {
    if (s < b.max) return b.level as LearnerLevel;
  }
  return "expert";
}

// Pace curve: r = actual / expected. Smooth, no hard cliff on slow side.
function paceCurve(r: number): number {
  if (!isFinite(r) || r <= 0) return CONFIG.PACE_GUESS_FLOOR;
  if (r < CONFIG.PACE_FAST_CUTOFF) return CONFIG.PACE_GUESS_FLOOR;
  if (r <= 1.0) {
    // Linear ramp from (PACE_FAST_CUTOFF, PACE_GUESS_FLOOR) → (1.0, 1.0)
    const t = (r - CONFIG.PACE_FAST_CUTOFF) / (1.0 - CONFIG.PACE_FAST_CUTOFF);
    return CONFIG.PACE_GUESS_FLOOR + t * (1.0 - CONFIG.PACE_GUESS_FLOOR);
  }
  // Gentle exponential decay past expected time
  return Math.exp(-(r - 1.0) / CONFIG.PACE_SLOW_DECAY);
}

// ---------- Request schema ----------
const AnswerSchema = z.object({
  question_id: z.string().optional(),
  question_text: z.string().optional(),
  type: z.string().optional(),
  topic: z.string().nullable().optional(),
  tier: z.string().optional(),
  selected: z.string().optional(),
  correct: z.string().optional(),
  is_correct: z.boolean().optional(),
  time_ms: z.number().optional(),
  confidence: z.number().int().min(0).max(2).optional(),
});

const BodySchema = z.object({
  course_id: z.string().uuid(),
  branch_tier: z.enum(["easy", "medium", "hard"]).nullable().optional(),
  answers: z.array(AnswerSchema),
  confidences: z.array(z.number()),
  question_times: z.array(z.number()),
  question_ids: z.array(z.string()),
});

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // Auth: validate JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "missing_auth" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "invalid_auth" }, 401);
  const studentId = userRes.user.id;

  // Parse body
  let body: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
    }
    body = parsed.data;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Defensive duplicate check (same as previous client flow)
  const { data: existing } = await admin
    .from("diagnostic_results")
    .select("id")
    .eq("student_id", studentId)
    .eq("course_id", body.course_id)
    .maybeSingle();
  if (existing) {
    return json({ error: "already_submitted" }, 409);
  }

  // Load question metadata for scoring
  const qIds = Array.from(new Set((body.answers.map((a) => a.question_id).filter(Boolean) as string[])));
  const qMap = new Map<string, { difficulty: number; bloom: number; concept_id: string | null }>();
  if (qIds.length > 0) {
    const { data: qs, error: qErr } = await admin
      .from("diagnostic_questions")
      .select("id, difficulty_estimate, bloom_level, course_id, concept_id")
      .in("id", qIds)
      .eq("course_id", body.course_id);
    if (qErr) {
      console.error("diagnostic_questions load error", qErr);
      return json({ error: "question_lookup_failed" }, 500);
    }
    for (const q of qs ?? []) {
      qMap.set(q.id as string, {
        difficulty: Number(q.difficulty_estimate ?? 0.5),
        bloom: Number(q.bloom_level ?? 1),
        concept_id: (q as { concept_id?: string }).concept_id ?? null,
      });
    }
  }

  // ---------- Score ----------
  let earnedSum = 0;
  let maxSum = 0;
  const paceScores: number[] = [];
  const confidenceScores: number[] = [];
  let correctCount = 0;
  let answeredCount = 0;
  const droppedQuestionIds: string[] = [];
  const perConceptTally = new Map<string, { attempted: number; correct: number }>();

  for (const a of body.answers) {
    const responseStr = (a.selected ?? "").toString();
    const isAnswered = responseStr.trim().length > 0;
    if (!isAnswered) continue;

    if (!a.question_id || !qMap.has(a.question_id)) {
      if (a.question_id) droppedQuestionIds.push(a.question_id);
      console.warn("score-diagnostic: dropping unknown question_id", {
        question_id: a.question_id,
        course_id: body.course_id,
      });
      continue;
    }

    const meta = qMap.get(a.question_id)!;
    const bloom = Math.min(6, Math.max(1, Math.round(meta.bloom)));
    const bloomWeight = CONFIG.BLOOM_WEIGHT[bloom] ?? 1.0;
    const difficulty = clamp01(meta.difficulty);

    const maxPoints = difficulty * bloomWeight;
    const isCorrect = !!a.is_correct;
    const earned = isCorrect ? maxPoints : 0;

    earnedSum += earned;
    maxSum += maxPoints;
    answeredCount += 1;
    if (isCorrect) correctCount += 1;

    if (meta.concept_id) {
      const t = perConceptTally.get(meta.concept_id) ?? { attempted: 0, correct: 0 };
      t.attempted += 1;
      if (isCorrect) t.correct += 1;
      perConceptTally.set(meta.concept_id, t);
    }

    // Pace
    const expectedMs =
      (CONFIG.EXPECTED_TIME_BASE_MS[bloom] ?? 30_000) *
      CONFIG.DIFFICULTY_TIME_FACTOR(difficulty);
    const actualMs = typeof a.time_ms === "number" && a.time_ms > 0 ? a.time_ms : expectedMs;
    paceScores.push(paceCurve(actualMs / expectedMs));

    // Confidence
    const rawC = Number.isInteger(a.confidence) ? (a.confidence as number) : CONFIG.CONFIDENCE_DEFAULT;
    const keyC = Math.min(2, Math.max(0, rawC));
    confidenceScores.push(CONFIG.CONFIDENCE_LEVELS[keyC] ?? 0.5);
  }

  const accuracyScore = maxSum > 0 ? clamp01(earnedSum / maxSum) : 0;
  const paceScore = paceScores.length
    ? paceScores.reduce((s, x) => s + x, 0) / paceScores.length
    : 0;
  const confidenceScore = confidenceScores.length
    ? confidenceScores.reduce((s, x) => s + x, 0) / confidenceScores.length
    : 0;

  const W = CONFIG.WEIGHTS;
  const masteryScore = clamp01(
    W.accuracy * accuracyScore +
      W.pace * paceScore +
      W.confidence * confidenceScore,
  );
  const learnerLevel = bandFor(masteryScore);

  // ---------- Persist ----------
  const { data: inserted, error: insertErr } = await admin
    .from("diagnostic_results")
    .insert({
      student_id: studentId,
      course_id: body.course_id,
      score: correctCount,
      total_questions: answeredCount,
      learner_level: learnerLevel,
      mastery_score: Number(masteryScore.toFixed(4)),
      branch_tier: body.branch_tier ?? null,
      answers: body.answers,
      confidences: body.confidences,
      question_times: body.question_times,
      question_ids: body.question_ids,
    })
    .select("id")
    .single();

  if (insertErr) {
    if ((insertErr as { code?: string }).code === "23505") {
      return json({ error: "already_submitted" }, 409);
    }
    console.error("diagnostic_results insert failed", insertErr);
    return json({ error: "insert_failed", details: insertErr.message }, 500);
  }

  // Mirror learner level on profile
  await admin.from("profiles").update({ learner_level: learnerLevel }).eq("id", studentId);

  return json({
    id: inserted?.id,
    mastery_score: masteryScore,
    learner_level: learnerLevel,
    components: {
      accuracy: accuracyScore,
      pace: paceScore,
      confidence: confidenceScore,
    },
    score: correctCount,
    total_questions: answeredCount,
    dropped_question_ids: droppedQuestionIds,
  });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
