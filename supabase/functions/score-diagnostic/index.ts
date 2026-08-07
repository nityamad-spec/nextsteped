/**
 * score-diagnostic
 *
 * Purpose:
 *   Scores a completed diagnostic quiz submission and derives the student's
 *   overall diagnostic mastery + assigned learner_level. Concept weights are
 *   NOT used here — only Bloom × difficulty weight questions.
 *
 * Auth / Access:
 *   Bearer token of the student.
 *
 * Inputs:
 *   - courseId: uuid
 *   - answers: [{ question_id, selected, elapsed_ms }]
 *
 * Steps:
 *   1. Authenticate student; load the diagnostic_questions for the submitted ids.
 *   2. For each answered item compute earned = difficulty * BLOOM_WEIGHT[bloom] on correct,
 *      accumulate against max points, and derive accuracyScore = sumEarned / sumMax.
 *   3. Compute paceScore using EXPECTED_TIME_BASE_MS[bloom] * (0.6 + 1.0 * difficulty)
 *      passed through paceCurve (exponential decay when actual/expected > 1).
 *   4. masteryScore = 0.80 * accuracy + 0.20 * pace.
 *   5. Map submission → learner_level via branch tier + correct count.
 *   6. Insert a diagnostic_results row; do NOT write student_concept_mastery.
 *   7. Return the score + level.
 *
 * Side effects:
 *   diagnostic_results insert.
 */

// Edge function: score-diagnostic
// Computes a single course-level mastery score (0..1) + learner level for a
// student's diagnostic submission, and writes the row to diagnostic_results.
//
// Scope:
//   - Writes ONLY to diagnostic_results.
//   - Does NOT write profiles.learner_level.
//   - Does NOT write student_concept_mastery or student_course_mastery. Those
//     are populated by weekly_quiz / exam / practice via update-mastery.
//     Pace is a diagnostic-only signal and stays scoped to diagnostic_results.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { reasoningEarnedFactor, requiresReasoning } from "../_shared/reasoning-scoring.ts";


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
  WEIGHTS: { accuracy: 0.80, pace: 0.20 },
} as const;

type LearnerLevel = "beginner" | "developing" | "proficient";

/**
 * Level from Phase A branch tier + total correct out of 20.
 * Mirrors client computeLearnerLevel in src/lib/diagnosticBranching.ts.
 * easy/medium: ≤10 → beginner, else developing.
 * hard: ≤10 → developing, else proficient.
 */
function levelFromBranch(
  branch: "easy" | "medium" | "hard" | null,
  correct: number,
  answered: number,
): LearnerLevel {
  if (!branch || answered <= 0) return "beginner";
  if (branch === "hard") return correct <= 10 ? "developing" : "proficient";
  return correct <= 10 ? "beginner" : "developing";
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
  /** LLM verdict on the Bloom 3+ rationale; omitted/null = treated as accepted. */
  reasoning_verdict: z.enum(["accepted", "rejected"]).nullable().optional(),
});


const BodySchema = z.object({
  course_id: z.string().uuid(),
  branch_tier: z.enum(["easy", "medium", "hard"]).nullable().optional(),
  answers: z.array(AnswerSchema),
  confidences: z.array(z.number()).optional(),
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
  let earnedNoVerdictSum = 0;
  let maxSum = 0;
  const paceScores: number[] = [];
  let correctCount = 0;
  let answeredCount = 0;
  let unverifiedReasoning = 0;
  const droppedQuestionIds: string[] = [];

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
    const verdict = a.reasoning_verdict ?? null;
    if (requiresReasoning(bloom) && !verdict) unverifiedReasoning += 1;
    // The verdict scales points earned only; maxPoints is unchanged.
    const earned = maxPoints * reasoningEarnedFactor({ bloom, bloomWeight, isCorrect, verdict });

    earnedSum += earned;
    earnedNoVerdictSum += isCorrect ? maxPoints : 0;
    maxSum += maxPoints;
    answeredCount += 1;
    if (isCorrect) correctCount += 1;

    // Pace
    const expectedMs =
      (CONFIG.EXPECTED_TIME_BASE_MS[bloom] ?? 30_000) *
      CONFIG.DIFFICULTY_TIME_FACTOR(difficulty);
    const actualMs = typeof a.time_ms === "number" && a.time_ms > 0 ? a.time_ms : expectedMs;
    paceScores.push(paceCurve(actualMs / expectedMs));
  }

  const accuracyScore = maxSum > 0 ? clamp01(earnedSum / maxSum) : 0;
  const baseAccuracy = maxSum > 0 ? clamp01(earnedNoVerdictSum / maxSum) : 0;
  const paceScore = paceScores.length
    ? paceScores.reduce((s, x) => s + x, 0) / paceScores.length
    : 0;

  const W = CONFIG.WEIGHTS;
  const masteryScore = clamp01(W.accuracy * accuracyScore + W.pace * paceScore);
  const baseMastery = clamp01(W.accuracy * baseAccuracy + W.pace * paceScore);
  const reasoningAdjustment = masteryScore - baseMastery;
  if (unverifiedReasoning > 0) {
    console.warn("score-diagnostic: rationales without a verdict", {
      course_id: body.course_id,
      unverified: unverifiedReasoning,
    });
  }
  const learnerLevel = levelFromBranch(body.branch_tier ?? null, correctCount, answeredCount);


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
      confidences: body.confidences ?? [],
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

  return json({
    id: inserted?.id,
    mastery_score: masteryScore,
    learner_level: learnerLevel,
    components: {
      accuracy: accuracyScore,
      pace: paceScore,
      reasoning_adjustment: reasoningAdjustment,
      unverified_reasoning: unverifiedReasoning,
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
