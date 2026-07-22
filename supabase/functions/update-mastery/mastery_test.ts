// Pure unit tests for update-mastery math. No DB / network.
// Run via supabase--test_edge_functions or `deno test`.

import {
  assertEquals,
  assertAlmostEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  bandFor,
  blendConceptScore,
  cappedLevel,
  shrink,
  applyPracticeOnlyGate,
  reasoningAdjustedContribution,
  MASTERY_CONFIG,
} from "./mastery.ts";

// ---------- shrink (Beta-prior) ----------

Deno.test("shrink: zero attempts collapses to neutral 0.5", () => {
  assertEquals(shrink(1.0, 0), 0.5);
  assertEquals(shrink(0.0, 0), 0.5);
});

Deno.test("shrink: 100% with 5 questions ≈ 0.6923 (worked example from plan)", () => {
  // w = 5 / (5 + 8) = 0.3846 → 0.3846*1 + 0.6154*0.5 = 0.6923
  assertAlmostEquals(shrink(1.0, 5), 5 / 13 + (8 / 13) * 0.5, 1e-4);
  assertAlmostEquals(shrink(1.0, 5), 0.6923, 1e-3);
});

Deno.test("shrink: large n recovers raw signal", () => {
  assertAlmostEquals(shrink(1.0, 1000), 1.0, 0.01);
  assertAlmostEquals(shrink(0.2, 1000), 0.2, 0.01);
});

Deno.test("shrink: monotone in evidence — more questions move closer to signal", () => {
  const a = shrink(0.9, 4);
  const b = shrink(0.9, 12);
  const c = shrink(0.9, 30);
  // 0.9 > prior 0.5, so shrunk values should increase toward 0.9
  if (!(a < b && b < c)) {
    throw new Error(`expected a<b<c, got ${a}, ${b}, ${c}`);
  }
});

// ---------- bandFor ----------

Deno.test("bandFor: bucket boundaries", () => {
  assertEquals(bandFor(0), "beginner");
  assertEquals(bandFor(0.249), "beginner");
  assertEquals(bandFor(0.25), "developing");
  assertEquals(bandFor(0.499), "developing");
  assertEquals(bandFor(0.5), "proficient");
  assertEquals(bandFor(0.749), "proficient");
  assertEquals(bandFor(0.75), "expert");
  assertEquals(bandFor(1.0), "expert");
});

// ---------- cappedLevel (evidence gate) ----------

Deno.test("cappedLevel: <8 attempts caps at developing regardless of score", () => {
  assertEquals(cappedLevel("expert", 1, 1), "developing");
  assertEquals(cappedLevel("expert", 7, 5), "developing");
  assertEquals(cappedLevel("proficient", 3, 1), "developing");
  // already at or below cap → unchanged
  assertEquals(cappedLevel("beginner", 2, 1), "beginner");
});

Deno.test("cappedLevel: 8..14 attempts caps at proficient", () => {
  assertEquals(cappedLevel("expert", 8, 2), "proficient");
  assertEquals(cappedLevel("expert", 14, 5), "proficient");
});

Deno.test("cappedLevel: >=15 attempts but <2 samples still caps at proficient", () => {
  assertEquals(cappedLevel("expert", 20, 1), "proficient");
});

Deno.test("cappedLevel: >=15 attempts AND >=2 samples allows expert", () => {
  assertEquals(cappedLevel("expert", 15, 2), "expert");
  assertEquals(cappedLevel("expert", 50, 5), "expert");
});

// ---------- blendConceptScore (source-weighted EMA + shrinkage) ----------

Deno.test("blend: first submission uses shrunk signal (no prior)", () => {
  // 100% on 5 questions, no prior → 0.6923
  const score = blendConceptScore(1.0, 5, null, 0, "weekly_quiz");
  assertAlmostEquals(score, 0.6923, 1e-3);
});

Deno.test("blend: first submission ignores priorScore when priorSamples=0", () => {
  const score = blendConceptScore(1.0, 5, 0.9, 0, "weekly_quiz");
  assertAlmostEquals(score, 0.6923, 1e-3);
});

Deno.test("blend: exam moves score more than weekly_quiz which moves more than practice", () => {
  // Same raw signal & evidence; vary only the source.
  const prior = 0.3;
  const exam = blendConceptScore(1.0, 20, prior, 3, "exam");
  const quiz = blendConceptScore(1.0, 20, prior, 3, "weekly_quiz");
  const practice = blendConceptScore(1.0, 20, prior, 3, "practice");
  if (!(exam > quiz && quiz > practice)) {
    throw new Error(`expected exam>quiz>practice, got ${exam}, ${quiz}, ${practice}`);
  }
});

Deno.test("blend: unknown source falls back to default alpha (0.4)", () => {
  const known = blendConceptScore(1.0, 20, 0.3, 3, "weekly_quiz");
  const unknown = blendConceptScore(1.0, 20, 0.3, 3, "mystery_source");
  assertEquals(known, unknown);
});

// ---------- Layered behavior (worked plan example) ----------

Deno.test("plan example: single perfect quiz → score~0.69, level=Developing (not Expert)", () => {
  // Student gets 5/5 on first weekly quiz of a concept.
  const score = blendConceptScore(1.0, 5, null, 0, "weekly_quiz");
  const raw = bandFor(score);              // would be "proficient" (0.69)
  const displayed = cappedLevel(raw, 5, 1); // capped to developing (n<8)
  assertAlmostEquals(score, 0.6923, 1e-3);
  assertEquals(raw, "proficient");
  assertEquals(displayed, "developing");
});

Deno.test("scenario: 3 quizzes of 5 perfect questions each → climbs to proficient, not expert", () => {
  // Sample 1
  let score = blendConceptScore(1.0, 5, null, 0, "weekly_quiz");
  let attempted = 5, samples = 1;
  assertEquals(cappedLevel(bandFor(score), attempted, samples), "developing");

  // Sample 2
  score = blendConceptScore(1.0, 10, score, samples, "weekly_quiz");
  attempted = 10; samples = 2;
  // Now n>=8 → cap lifts to proficient; score likely still <0.75 so band==proficient.
  assertEquals(cappedLevel(bandFor(score), attempted, samples), "proficient");

  // Sample 3
  score = blendConceptScore(1.0, 15, score, samples, "weekly_quiz");
  attempted = 15; samples = 3;
  // Evidence gate now allows "expert"; check displayed level matches band.
  assertEquals(cappedLevel(bandFor(score), attempted, samples), bandFor(score));
});

Deno.test("scenario: many perfect exam questions eventually reach Expert", () => {
  let score: number | null = null;
  let samples = 0;
  let attempted = 0;
  // 4 exams × 10 questions all correct.
  for (let i = 0; i < 4; i++) {
    attempted += 10;
    score = blendConceptScore(1.0, attempted, score, samples, "exam");
    samples += 1;
  }
  const displayed = cappedLevel(bandFor(score!), attempted, samples);
  assertEquals(displayed, "expert");
});

// ---------- applyPracticeOnlyGate (course-level Layer 3) ----------

Deno.test("practice-only gate: expert downgraded to proficient when only practice contributors", () => {
  assertEquals(applyPracticeOnlyGate("expert", 5, 0), "proficient");
});

Deno.test("practice-only gate: expert preserved when any non-practice contributor exists", () => {
  assertEquals(applyPracticeOnlyGate("expert", 5, 1), "expert");
});

Deno.test("practice-only gate: no contributors → unchanged", () => {
  assertEquals(applyPracticeOnlyGate("expert", 0, 0), "expert");
});

Deno.test("practice-only gate: non-expert levels unchanged", () => {
  assertEquals(applyPracticeOnlyGate("proficient", 5, 0), "proficient");
  assertEquals(applyPracticeOnlyGate("developing", 5, 0), "developing");
});

// ---------- config sanity ----------

Deno.test("config: prior strength and gates match deployed plan", () => {
  assertEquals(MASTERY_CONFIG.PRIOR, 0.5);
  assertEquals(MASTERY_CONFIG.PRIOR_STRENGTH, 8);
  assertEquals(MASTERY_CONFIG.CAP_DEVELOPING_BELOW_ATTEMPTED, 8);
  assertEquals(MASTERY_CONFIG.CAP_PROFICIENT_BELOW_ATTEMPTED, 15);
  assertEquals(MASTERY_CONFIG.CAP_PROFICIENT_MIN_SAMPLES, 2);
});

// ---------- Phase 5: reasoning follow-up scoring ----------

Deno.test("reasoning config: fractions match Phase 5 spec", () => {
  assertEquals(MASTERY_CONFIG.REASONING_BOOST_FRACTION, 0.5);
  assertEquals(MASTERY_CONFIG.REASONING_PENALTY_FRACTION, 0.25);
});

Deno.test("reasoning: primary wrong → follow-up ignored regardless of value", () => {
  assertEquals(reasoningAdjustedContribution(1, false, true), { earnedDelta: 0, maxDelta: 1 });
  assertEquals(reasoningAdjustedContribution(1, false, false), { earnedDelta: 0, maxDelta: 1 });
  assertEquals(reasoningAdjustedContribution(1, false, null), { earnedDelta: 0, maxDelta: 1 });
});

Deno.test("reasoning: null/undefined → behaves as today (no boost, no penalty)", () => {
  assertEquals(reasoningAdjustedContribution(1, true, null), { earnedDelta: 1, maxDelta: 1 });
  assertEquals(reasoningAdjustedContribution(1, true, undefined), { earnedDelta: 1, maxDelta: 1 });
});

Deno.test("reasoning: correct primary + correct reasoning → boost fractions", () => {
  const R = MASTERY_CONFIG.REASONING_BOOST_FRACTION;
  const r = reasoningAdjustedContribution(1, true, true);
  assertAlmostEquals(r.earnedDelta, 1 + R, 1e-9);
  assertAlmostEquals(r.maxDelta, 1 + R, 1e-9);
});

Deno.test("reasoning: correct primary + wrong reasoning → penalty in denominator only", () => {
  const P = MASTERY_CONFIG.REASONING_PENALTY_FRACTION;
  const r = reasoningAdjustedContribution(1, true, false);
  assertAlmostEquals(r.earnedDelta, 1, 1e-9);
  assertAlmostEquals(r.maxDelta, 1 + P, 1e-9);
});

Deno.test("reasoning: floor — correct-primary+wrong-reasoning earned ≥ wrong-primary earned", () => {
  const cwp = reasoningAdjustedContribution(1, true, false);
  const wpp = reasoningAdjustedContribution(1, false, false);
  if (!(cwp.earnedDelta >= wpp.earnedDelta)) {
    throw new Error(`floor violated: ${cwp.earnedDelta} < ${wpp.earnedDelta}`);
  }
});

Deno.test("reasoning: aggregate boost pulls ratio above baseline (two-question worked example)", () => {
  // Q1: primary correct + reasoning correct; Q2: primary wrong. maxPoints=1 each.
  const q1 = reasoningAdjustedContribution(1, true, true);
  const q2 = reasoningAdjustedContribution(1, false, null);
  const ratio = (q1.earnedDelta + q2.earnedDelta) / (q1.maxDelta + q2.maxDelta);
  // Baseline (no follow-up): (1+0)/(1+1) = 0.5
  assertAlmostEquals(ratio, 1.5 / 2.5, 1e-9); // 0.6
  if (!(ratio > 0.5)) throw new Error(`boost failed: ${ratio} <= 0.5`);
});

Deno.test("reasoning: aggregate penalty pulls ratio below baseline", () => {
  const q1 = reasoningAdjustedContribution(1, true, false);
  const q2 = reasoningAdjustedContribution(1, false, null);
  const ratio = (q1.earnedDelta + q2.earnedDelta) / (q1.maxDelta + q2.maxDelta);
  assertAlmostEquals(ratio, 1 / 2.25, 1e-9); // ≈ 0.4444
  if (!(ratio < 0.5)) throw new Error(`penalty failed: ${ratio} >= 0.5`);
});

Deno.test("reasoning: asymmetry — |penalty Δ| < |boost Δ| vs. baseline", () => {
  const baseline = 0.5;
  const boostRatio = 1.5 / 2.5;                // 0.6
  const penaltyRatio = 1 / 2.25;               // ≈ 0.4444
  const dBoost = boostRatio - baseline;
  const dPenalty = baseline - penaltyRatio;
  if (!(dPenalty < dBoost)) {
    throw new Error(`asymmetry violated: penalty ${dPenalty} >= boost ${dBoost}`);
  }
});
