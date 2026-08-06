/**
 * update-mastery
 *
 * Purpose:
 *   Authoritative writer of student_concept_mastery and student_course_mastery.
 *   Applies three layers per concept: Beta-prior shrinkage → EMA blend with prior
 *   → evidence-gated display cap. Called after quizzes, exams, and practice.
 *
 * Auth / Access:
 *   Bearer token; typically invoked server-to-server from scoring flows.
 *
 * Inputs:
 *   - studentId, courseId
 *   - source: "weekly_quiz" | "exam" | "practice" | "diagnostic"
 *   - answers: per-question outcomes with concept, difficulty, bloom
 *
 * Steps:
 *   1. Validate inputs and load prior mastery rows for the student × course.
 *   2. For each concept row aggregate earned = Σ(difficulty * BLOOM_WEIGHT[bloom]) on
 *      correct answers vs Σmax; if per-question data missing, fall back to correct/attempted.
 *   3. Shrink toward 0.5 with a Beta prior: w = n/(n+8); shrunk = w * raw + (1-w) * 0.5.
 *   4. EMA blend with prior score using α by source (weekly_quiz 0.4, exam 0.6,
 *      practice 0.1, diagnostic 0.4).
 *   5. Compute displayed level (beginner/developing/proficient/expert) using the
 *      evidence-gated cap; for practice-only evidence the cap tops out at proficient.
 *   6. Compute course mastery as concept-weight-weighted average of all concept rows,
 *      with a practice-only gate at the course level.
 *   7. Upsert student_concept_mastery and student_course_mastery; bump cache_versions.
 *
 * Side effects:
 *   student_concept_mastery / student_course_mastery upserts; cache_versions bump.
 */

// Edge function: update-mastery
// SOLE writer of public.student_course_mastery and public.student_concept_mastery.
// EMA blend per concept; course mastery derived as weighted avg of concept rows.
//
// Live callers: weekly_quiz, exam, practice. The diagnostic intentionally does
// NOT call this function — it is a pure assessment-of-record that writes only
// to diagnostic_results. The "diagnostic" value remains in the source enum for
// backward compatibility with any historical payloads, but no live caller in
// the app sends it.
//
// Pace and confidence are diagnostic-only signals and live exclusively in
// diagnostic_results — they MUST NOT be folded into course-level mastery here.
//
// Input (one of per_question or per_concept is required; per_question preferred):
// {
//   course_id: uuid,
//   source: "diagnostic" | "weekly_quiz" | "exam" | "practice",
//   source_id: uuid | null,
//   // Preferred (weighted): per-question rows. Signal per concept becomes
//   //   sum(difficulty * BLOOM_WEIGHT[bloom] for correct) / sum(...for all attempted)
//   per_question?: [
//     { concept_id?: uuid, concept_code?: string,
//       difficulty: number /*0..1*/, bloom: number /*1..6*/, is_correct: boolean }
//   ],
//   // Legacy (flat correct/attempted) — still used by exam/practice callers.
//   per_concept?: [
//     { concept_id?: uuid, concept_code?: string, attempted: number, correct: number }
//   ]
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  MASTERY_CONFIG,
  bandFor,
  cappedLevel,
  clamp01,
  shrink,
  applyPracticeOnlyGate,
} from "./mastery.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PerConceptSchema = z
  .object({
    concept_id: z.string().uuid().optional(),
    concept_code: z.string().optional(),
    attempted: z.number().int().nonnegative(),
    correct: z.number().int().nonnegative(),
  })
  .refine((v) => v.concept_id || v.concept_code, {
    message: "concept_id or concept_code required",
  });

const PerQuestionSchema = z
  .object({
    concept_id: z.string().uuid().optional(),
    concept_code: z.string().optional(),
    difficulty: z.number().min(0).max(1),
    bloom: z.number().int().min(1).max(6),
    is_correct: z.boolean(),
  })
  .refine((v) => v.concept_id || v.concept_code, {
    message: "concept_id or concept_code required",
  });

const BodySchema = z
  .object({
    course_id: z.string().uuid(),
    source: z.enum(["diagnostic", "weekly_quiz", "exam", "practice"]),
    source_id: z.string().uuid().nullable().optional(),
    per_concept: z.array(PerConceptSchema).optional(),
    per_question: z.array(PerQuestionSchema).optional(),
  })
  .refine(
    (v) => (v.per_question && v.per_question.length > 0) || (v.per_concept && v.per_concept.length > 0),
    { message: "per_question or per_concept required" },
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "missing_auth" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "invalid_auth" }, 401);
  const studentId = userRes.user.id;

  let body: z.infer<typeof BodySchema>;
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
    }
    body = parsed.data;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Resolve concept rows for this course (id + code + weight) — used for
  // code→id mapping and final weighted average.
  const { data: courseConcepts, error: cErr } = await admin
    .from("concepts")
    .select("id, concept_code, weight")
    .eq("course_id", body.course_id);
  if (cErr) {
    console.error("concepts load failed", cErr);
    return json({ error: "concepts_lookup_failed" }, 500);
  }
  const byId = new Map<string, { id: string; concept_code: string; weight: number }>();
  const byCode = new Map<string, { id: string; concept_code: string; weight: number }>();
  for (const c of courseConcepts ?? []) {
    const row = { id: c.id as string, concept_code: c.concept_code as string, weight: Number(c.weight ?? 0) };
    byId.set(row.id, row);
    byCode.set(row.concept_code, row);
  }

  // Aggregate input by concept_id (defensive — caller may pass duplicates).
  // Track both raw counts (for questions_attempted/correct counters) and
  // weighted earned/max (for the EMA signal when per_question is provided).
  type Agg = {
    concept_code: string;
    attempted: number;
    correct: number;
    earned: number;
    max: number;
    weighted: boolean;
  };
  const agg = new Map<string, Agg>();
  const unresolved: Array<{ concept_id?: string; concept_code?: string }> = [];

  const resolve = (concept_id?: string, concept_code?: string) => {
    let r = concept_id ? byId.get(concept_id) : undefined;
    if (!r && concept_code) r = byCode.get(concept_code);
    return r;
  };
  const ensure = (resolved: { id: string; concept_code: string }): Agg => {
    const cur = agg.get(resolved.id) ?? {
      concept_code: resolved.concept_code,
      attempted: 0, correct: 0, earned: 0, max: 0, weighted: false,
    };
    agg.set(resolved.id, cur);
    return cur;
  };

  if (body.per_question && body.per_question.length > 0) {
    for (const item of body.per_question) {
      const resolved = resolve(item.concept_id, item.concept_code);
      if (!resolved) {
        unresolved.push({ concept_id: item.concept_id, concept_code: item.concept_code });
        continue;
      }
      const cur = ensure(resolved);
      const bloom = Math.min(6, Math.max(1, Math.round(item.bloom)));
      const bloomWeight = MASTERY_CONFIG.BLOOM_WEIGHT[bloom] ?? 1.0;
      const difficulty = clamp01(item.difficulty);
      const maxPoints = difficulty * bloomWeight;
      cur.attempted += 1;
      if (item.is_correct) cur.correct += 1;
      cur.earned += item.is_correct ? maxPoints : 0;
      cur.max += maxPoints;

      cur.weighted = true;
    }
  } else if (body.per_concept) {
    for (const item of body.per_concept) {
      const resolved = resolve(item.concept_id, item.concept_code);
      if (!resolved) {
        unresolved.push({ concept_id: item.concept_id, concept_code: item.concept_code });
        continue;
      }
      const cur = ensure(resolved);
      cur.attempted += item.attempted;
      cur.correct += item.correct;
    }
  }

  // Load existing concept rows for this student+course
  const conceptIds = Array.from(agg.keys());
  const { data: existingRows, error: exErr } = await admin
    .from("student_concept_mastery")
    .select("concept_id, mastery_score, sample_count, questions_attempted, questions_correct")
    .eq("student_id", studentId)
    .eq("course_id", body.course_id)
    .in("concept_id", conceptIds.length > 0 ? conceptIds : ["00000000-0000-0000-0000-000000000000"]);
  if (exErr) {
    console.error("existing concept rows load failed", exErr);
    return json({ error: "existing_lookup_failed" }, 500);
  }
  const existingMap = new Map<string, { mastery_score: number; sample_count: number; questions_attempted: number; questions_correct: number }>();
  for (const r of existingRows ?? []) {
    existingMap.set(r.concept_id as string, {
      mastery_score: Number(r.mastery_score ?? 0),
      sample_count: Number(r.sample_count ?? 0),
      questions_attempted: Number(r.questions_attempted ?? 0),
      questions_correct: Number(r.questions_correct ?? 0),
    });
  }

  const nowIso = new Date().toISOString();
  const conceptUpserts: Array<Record<string, unknown>> = [];
  const alpha = MASTERY_CONFIG.EMA_ALPHA_BY_SOURCE[body.source]
    ?? MASTERY_CONFIG.EMA_ALPHA_DEFAULT;

  for (const [conceptId, info] of agg) {
    if (info.attempted <= 0) continue;
    const rawSignal = info.weighted && info.max > 0
      ? clamp01(info.earned / info.max)
      : clamp01(info.correct / info.attempted);
    const prior = existingMap.get(conceptId);
    const attemptedAfter = (prior?.questions_attempted ?? 0) + info.attempted;
    const correctAfter = (prior?.questions_correct ?? 0) + info.correct;
    const samplesAfter = (prior?.sample_count ?? 0) + 1;

    // Layer 1: Beta-prior shrinkage toward 0.5. As evidence (n) grows,
    // the signal speaks for itself.
    const shrunkSignal = shrink(rawSignal, attemptedAfter);

    const newScore = !prior || prior.sample_count === 0
      ? shrunkSignal
      : clamp01(alpha * shrunkSignal + (1 - alpha) * prior.mastery_score);

    // Layer 2: evidence-gated cap on displayed level.
    const displayedLevel = cappedLevel(bandFor(newScore), attemptedAfter, samplesAfter);

    conceptUpserts.push({
      student_id: studentId,
      course_id: body.course_id,
      concept_id: conceptId,
      concept_code: info.concept_code,
      mastery_score: Number(newScore.toFixed(4)),
      mastery_level: displayedLevel,
      questions_attempted: attemptedAfter,
      questions_correct: correctAfter,
      sample_count: samplesAfter,
      last_source: body.source,
      last_source_id: body.source_id ?? null,
      last_assessed_at: nowIso,
    });
  }

  if (conceptUpserts.length > 0) {
    const { error: upErr } = await admin
      .from("student_concept_mastery")
      .upsert(conceptUpserts, { onConflict: "student_id,course_id,concept_id" });
    if (upErr) {
      console.error("concept upsert failed", upErr);
      return json({ error: "concept_upsert_failed", details: upErr.message }, 500);
    }
  }

  // Derive course mastery = weighted avg over ALL concept rows for this student+course
  const { data: allRows, error: allErr } = await admin
    .from("student_concept_mastery")
    .select("concept_id, mastery_score, last_source")
    .eq("student_id", studentId)
    .eq("course_id", body.course_id);
  if (allErr) {
    console.error("all concept rows load failed", allErr);
    return json({ error: "course_recompute_failed" }, 500);
  }

  // Denominator = total weight of EVERY concept in the course (unexplored
  // concepts count as 0), so course mastery reflects true course-wide progress.
  let totalCourseWeight = 0;
  for (const c of byId.values()) totalCourseWeight += c.weight;

  let weightedSum = 0;
  let contributing = 0;
  let nonPracticeContributors = 0;
  for (const r of allRows ?? []) {
    const w = byId.get(r.concept_id as string)?.weight ?? 0;
    if (w <= 0) continue;
    weightedSum += Number(r.mastery_score) * w;
    contributing += 1;
    if (r.last_source && r.last_source !== "practice") nonPracticeContributors += 1;
  }
  const courseScore = totalCourseWeight > 0 ? clamp01(weightedSum / totalCourseWeight) : 0;
  // Layer 3: practice-only gate — block "expert" at the course level if every
  // contributing concept's most-recent submission was practice.
  const courseLevel = applyPracticeOnlyGate(bandFor(courseScore), contributing, nonPracticeContributors);

  if (totalCourseWeight === 0) {
    console.warn("update-mastery: totalCourseWeight is 0 — course has no weighted concepts", {
      student_id: studentId,
      course_id: body.course_id,
    });
  }

  const { error: courseErr } = await admin
    .from("student_course_mastery")
    .upsert(
      {
        student_id: studentId,
        course_id: body.course_id,
        mastery_score: Number(courseScore.toFixed(4)),
        learner_level: courseLevel,
        accuracy_component: Number(courseScore.toFixed(4)),
        last_source: body.source,
        last_source_id: body.source_id ?? null,
        sample_count: contributing,
      },
      { onConflict: "student_id,course_id" },
    );
  if (courseErr) {
    console.error("course upsert failed", courseErr);
    return json({ error: "course_upsert_failed", details: courseErr.message }, 500);
  }

  // Invalidate professor-chat class mastery cache so the next teacher chat reflects fresh numbers.
  try {
    await admin.rpc("bump_cache_version", { _scope: "mastery", _scope_id: body.course_id });
  } catch (e) {
    console.warn("bump_cache_version(mastery) failed", e);
  }

  return json({
    course_mastery: courseScore,
    course_level: courseLevel,
    concepts_updated: conceptUpserts.length,
    unresolved,
  });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
