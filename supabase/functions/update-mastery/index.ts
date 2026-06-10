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

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MASTERY_CONFIG = {
  // Per-source EMA alpha. The same signal moves a concept's score more when it
  // comes from a higher-stakes source (exam > weekly_quiz > practice). The
  // internal signal itself still weights hard, high-Bloom items more via
  // difficulty * BLOOM_WEIGHT — this only scales how much the blended score
  // shifts per submission.
  EMA_ALPHA_BY_SOURCE: {
    weekly_quiz: 0.4,
    exam: 0.6,
    practice: 0.1,
    diagnostic: 0.4, // kept for back-compat; no live caller
  } as Record<string, number>,
  EMA_ALPHA_DEFAULT: 0.4,
  // Cognitive depth weights (Bloom 1..6) — mirrors score-diagnostic CONFIG.BLOOM_WEIGHT.
  BLOOM_WEIGHT: { 1: 1.0, 2: 1.2, 3: 1.5, 4: 1.8, 5: 2.1, 6: 2.5 } as Record<number, number>,
  LEVEL_BANDS: [
    { max: 0.25, level: "beginner" },
    { max: 0.50, level: "developing" },
    { max: 0.75, level: "proficient" },
    { max: 1.0001, level: "expert" },
  ],
} as const;


type LearnerLevel = "beginner" | "developing" | "proficient" | "expert";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function bandFor(score: number): LearnerLevel {
  const s = clamp01(score);
  for (const b of MASTERY_CONFIG.LEVEL_BANDS) {
    if (s < b.max) return b.level as LearnerLevel;
  }
  return "expert";
}

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
      cur.max += maxPoints;
      if (item.is_correct) cur.earned += maxPoints;
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
    const signal = info.weighted && info.max > 0
      ? clamp01(info.earned / info.max)
      : clamp01(info.correct / info.attempted);
    const prior = existingMap.get(conceptId);
    const newScore = !prior || prior.sample_count === 0
      ? signal
      : clamp01(alpha * signal + (1 - alpha) * prior.mastery_score);



    conceptUpserts.push({
      student_id: studentId,
      course_id: body.course_id,
      concept_id: conceptId,
      concept_code: info.concept_code,
      mastery_score: Number(newScore.toFixed(4)),
      mastery_level: bandFor(newScore),
      questions_attempted: (prior?.questions_attempted ?? 0) + info.attempted,
      questions_correct: (prior?.questions_correct ?? 0) + info.correct,
      sample_count: (prior?.sample_count ?? 0) + 1,
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
    .select("concept_id, mastery_score")
    .eq("student_id", studentId)
    .eq("course_id", body.course_id);
  if (allErr) {
    console.error("all concept rows load failed", allErr);
    return json({ error: "course_recompute_failed" }, 500);
  }

  let weightedSum = 0;
  let weightTotal = 0;
  let contributing = 0;
  for (const r of allRows ?? []) {
    const w = byId.get(r.concept_id as string)?.weight ?? 0;
    if (w <= 0) continue;
    weightedSum += Number(r.mastery_score) * w;
    weightTotal += w;
    contributing += 1;
  }
  const courseScore = weightTotal > 0 ? clamp01(weightedSum / weightTotal) : 0;
  const courseLevel = bandFor(courseScore);

  if (weightTotal === 0) {
    console.warn("update-mastery: weightTotal is 0 — no contributing concepts", {
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
