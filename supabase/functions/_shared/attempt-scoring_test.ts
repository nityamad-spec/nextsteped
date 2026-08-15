import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BLOOM_WEIGHT,
  EXPECTED_TIME_BASE_MS,
  PACE_GUESS_FLOOR,
  REASONING_PARTIAL_FACTOR,
  difficultyTimeFactor,
  paceCurve,
  reasoningEarnedFactor,
  scoreAttempt,
  scoreAttemptByConcept,
  type ScoreItem,
} from "./attempt-scoring.ts";

const expectedMs = (bloom: number, difficulty: number) =>
  EXPECTED_TIME_BASE_MS[bloom] * difficultyTimeFactor(difficulty);

Deno.test("reasoningEarnedFactor: bloom <= 2 ignores the verdict", () => {
  assertEquals(reasoningEarnedFactor({ bloom: 1, isCorrect: true, verdict: "rejected" }), 1);
  assertEquals(reasoningEarnedFactor({ bloom: 2, isCorrect: false, verdict: "accepted" }), 0);
});

Deno.test("reasoningEarnedFactor: flat 0.5 partial credit at bloom 3+", () => {
  assertEquals(reasoningEarnedFactor({ bloom: 3, isCorrect: true, verdict: "accepted" }), 1);
  assertEquals(reasoningEarnedFactor({ bloom: 6, isCorrect: true, verdict: null }), 1);
  assertEquals(
    reasoningEarnedFactor({ bloom: 3, isCorrect: true, verdict: "rejected" }),
    REASONING_PARTIAL_FACTOR,
  );
  assertEquals(
    reasoningEarnedFactor({ bloom: 6, isCorrect: false, verdict: "accepted" }),
    REASONING_PARTIAL_FACTOR,
  );
  assertEquals(reasoningEarnedFactor({ bloom: 4, isCorrect: false, verdict: "rejected" }), 0);
  assertEquals(reasoningEarnedFactor({ bloom: 4, isCorrect: false, verdict: null }), 0);
});

Deno.test("reasoningEarnedFactor: ordering invariant holds at every bloom 3+", () => {
  for (const bloom of [3, 4, 5, 6]) {
    const ca = reasoningEarnedFactor({ bloom, isCorrect: true, verdict: "accepted" });
    const cr = reasoningEarnedFactor({ bloom, isCorrect: true, verdict: "rejected" });
    const ia = reasoningEarnedFactor({ bloom, isCorrect: false, verdict: "accepted" });
    const ir = reasoningEarnedFactor({ bloom, isCorrect: false, verdict: "rejected" });
    assertEquals(ca > cr, true);
    assertEquals(cr >= ia, true);
    assertEquals(ia > ir, true);
  }
});

Deno.test("paceCurve boundaries", () => {
  assertEquals(paceCurve(0.1), PACE_GUESS_FLOOR);
  assertEquals(paceCurve(0), PACE_GUESS_FLOOR);
  assertAlmostEquals(paceCurve(0.25), PACE_GUESS_FLOOR, 1e-9);
  assertAlmostEquals(paceCurve(1), 1, 1e-9);
  assertEquals(paceCurve(2) < 1 && paceCurve(2) > 0, true);
});

Deno.test("scoreAttempt: all correct at expected pace scores 100", () => {
  const items: ScoreItem[] = [
    { difficulty: 0.5, bloom: 2, is_correct: true, time_ms: expectedMs(2, 0.5) },
    { difficulty: 0.7, bloom: 3, is_correct: true, time_ms: expectedMs(3, 0.7) },
  ];
  const r = scoreAttempt(items);
  assertAlmostEquals(r.accuracy, 1, 1e-9);
  assertAlmostEquals(r.pace, 1, 1e-9);
  assertEquals(r.displayScore, 100);
  assertEquals(r.reasoningAdjustment, 0);
});

Deno.test("scoreAttempt: missing timing scores as on-pace", () => {
  const r = scoreAttempt([{ difficulty: 0.5, bloom: 2, is_correct: true }]);
  assertAlmostEquals(r.pace, 1, 1e-9);
  assertEquals(r.displayScore, 100);
});

Deno.test("scoreAttempt: a rejected rationale halves points, never the max", () => {
  const base: ScoreItem = {
    difficulty: 0.8,
    bloom: 4,
    is_correct: true,
    time_ms: expectedMs(4, 0.8),
  };
  const accepted = scoreAttempt([{ ...base, verdict: "accepted" }]);
  const rejected = scoreAttempt([{ ...base, verdict: "rejected" }]);
  assertAlmostEquals(accepted.accuracy, 1, 1e-9);
  assertAlmostEquals(rejected.accuracy, 0.5, 1e-9);
  assertEquals(rejected.reasoningAdjustment, rejected.displayScore - accepted.displayScore);
  assertEquals(rejected.correctCount, 1);
});

Deno.test("scoreAttempt: counts bloom 3+ questions with no verdict", () => {
  const r = scoreAttempt([
    { difficulty: 0.5, bloom: 4, is_correct: true },
    { difficulty: 0.5, bloom: 2, is_correct: true },
  ]);
  assertEquals(r.unverifiedReasoning, 1);
});

Deno.test("scoreAttempt: guessing floor applies to very fast answers", () => {
  const r = scoreAttempt([
    { difficulty: 0.5, bloom: 1, is_correct: true, time_ms: 1_000 },
  ]);
  assertAlmostEquals(r.pace, PACE_GUESS_FLOOR, 1e-9);
  assertEquals(r.displayScore, Math.round((0.8 + 0.2 * PACE_GUESS_FLOOR) * 100));
});

Deno.test("scoreAttemptByConcept: splits and scores each concept independently", () => {
  const items: ScoreItem[] = [
    { difficulty: 0.5, bloom: 1, is_correct: true, time_ms: expectedMs(1, 0.5), concept_code: "loops" },
    { difficulty: 0.5, bloom: 1, is_correct: false, time_ms: expectedMs(1, 0.5), concept_code: "loops" },
    { difficulty: 0.5, bloom: 1, is_correct: true, time_ms: expectedMs(1, 0.5), concept_code: "oop" },
    { difficulty: 0.5, bloom: 1, is_correct: true, time_ms: expectedMs(1, 0.5) },
  ];
  const byConcept = scoreAttemptByConcept(items);
  assertEquals(byConcept.size, 2);
  assertAlmostEquals(byConcept.get("loops")!.accuracy, 0.5, 1e-9);
  assertAlmostEquals(byConcept.get("oop")!.accuracy, 1, 1e-9);
  assertEquals(byConcept.get("loops")!.questionCount, 2);
  // Items with neither concept_id nor concept_code are skipped.
  assertEquals([...byConcept.keys()].sort(), ["loops", "oop"]);
});

Deno.test("bloom weights scale max points as documented", () => {
  const hard = scoreAttempt([
    { difficulty: 1, bloom: 6, is_correct: true, time_ms: expectedMs(6, 1) },
    { difficulty: 1, bloom: 1, is_correct: false, time_ms: expectedMs(1, 1) },
  ]);
  // 2.5 of 3.5 possible points.
  assertAlmostEquals(hard.accuracy, BLOOM_WEIGHT[6] / (BLOOM_WEIGHT[6] + BLOOM_WEIGHT[1]), 1e-9);
});
