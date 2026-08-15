import { describe, it, expect } from "vitest";
import {
  scoreAttempt,
  scoreAttemptByConcept,
  reasoningEarnedFactor,
  computeWeeklyQuizScore,
  EXPECTED_TIME_BASE_MS,
  difficultyTimeFactor,
  type ScoreItem,
} from "@/lib/masteryScoring";
import * as shared from "../../supabase/functions/_shared/attempt-scoring";

const expected = (bloom: number, difficulty: number) =>
  EXPECTED_TIME_BASE_MS[bloom] * difficultyTimeFactor(difficulty);

describe("browser scoring entry", () => {
  it("is the same implementation the edge functions use (no mirrored copy)", () => {
    expect(scoreAttempt).toBe(shared.scoreAttempt);
    expect(reasoningEarnedFactor).toBe(shared.reasoningEarnedFactor);
    expect(scoreAttemptByConcept).toBe(shared.scoreAttemptByConcept);
  });

  it("scores an attempt with the 80/20 blend", () => {
    const items: ScoreItem[] = [
      { difficulty: 0.5, bloom: 2, is_correct: true, time_ms: expected(2, 0.5) },
      { difficulty: 0.5, bloom: 2, is_correct: false, time_ms: expected(2, 0.5) },
    ];
    const r = scoreAttempt(items);
    expect(r.accuracy).toBeCloseTo(0.5, 5);
    expect(r.pace).toBeCloseTo(1, 5);
    expect(r.displayScore).toBe(60);
  });

  it("applies flat 0.5 partial credit for a rejected rationale", () => {
    const item: ScoreItem = {
      difficulty: 0.6,
      bloom: 5,
      is_correct: true,
      time_ms: expected(5, 0.6),
      verdict: "rejected",
    };
    expect(scoreAttempt([item]).accuracy).toBeCloseTo(0.5, 5);
  });

  it("keeps the legacy field names working", () => {
    const r = computeWeeklyQuizScore([
      { difficulty: 0.5, bloom: 1, is_correct: true, time_ms: expected(1, 0.5) },
    ]);
    expect(r.accuracyScore).toBeCloseTo(1, 5);
    expect(r.paceScore).toBeCloseTo(1, 5);
    expect(r.displayScore).toBe(100);
  });
});
