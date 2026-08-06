import { describe, it, expect } from "vitest";
import {
  computeWeeklyQuizScore,
  paceCurve,
  PACE_GUESS_FLOOR,
  EXPECTED_TIME_BASE_MS,
  type ScoreItem,
} from "./masteryScoring";

const expected = (bloom: number, difficulty: number) =>
  EXPECTED_TIME_BASE_MS[bloom] * (0.6 + 1.0 * difficulty);

describe("paceCurve", () => {
  it("returns guess floor for very fast answers", () => {
    expect(paceCurve(0.1)).toBe(PACE_GUESS_FLOOR);
  });
  it("returns 1.0 at expected time", () => {
    expect(paceCurve(1.0)).toBeCloseTo(1.0, 5);
  });
  it("decays below 1.0 past expected time", () => {
    expect(paceCurve(2.0)).toBeLessThan(1.0);
    expect(paceCurve(2.0)).toBeGreaterThan(0);
  });
});

describe("computeWeeklyQuizScore", () => {
  it("all correct at expected pace → 100", () => {
    const items: ScoreItem[] = [
      { difficulty: 0.5, bloom: 2, is_correct: true, time_ms: expected(2, 0.5) },
      { difficulty: 0.7, bloom: 3, is_correct: true, time_ms: expected(3, 0.7) },
    ];
    const r = computeWeeklyQuizScore(items);
    expect(r.accuracyScore).toBeCloseTo(1, 5);
    expect(r.paceScore).toBeCloseTo(1, 5);
    expect(r.displayScore).toBe(100);
  });

  it("all correct but very slow → score drops below 100 (pace penalty)", () => {
    const items: ScoreItem[] = [
      { difficulty: 0.5, bloom: 2, is_correct: true, time_ms: expected(2, 0.5) * 4 },
      { difficulty: 0.5, bloom: 2, is_correct: true, time_ms: expected(2, 0.5) * 4 },
    ];
    const r = computeWeeklyQuizScore(items);
    expect(r.accuracyScore).toBeCloseTo(1, 5);
    expect(r.paceScore).toBeLessThan(1);
    expect(r.displayScore).toBeLessThan(100);
    expect(r.displayScore).toBeGreaterThanOrEqual(80); // accuracy floor of 80/20 blend
  });

  it("half correct → accuracy roughly 0.5", () => {
    const items: ScoreItem[] = [
      { difficulty: 0.5, bloom: 2, is_correct: true, time_ms: expected(2, 0.5) },
      { difficulty: 0.5, bloom: 2, is_correct: false, time_ms: expected(2, 0.5) },
    ];
    const r = computeWeeklyQuizScore(items);
    expect(r.accuracyScore).toBeCloseTo(0.5, 5);
  });

  it("missing timing falls back to expected (pace = 1.0)", () => {
    const items: ScoreItem[] = [
      { difficulty: 0.5, bloom: 2, is_correct: true, time_ms: 0 },
    ];
    const r = computeWeeklyQuizScore(items);
    expect(r.paceScore).toBeCloseTo(1, 5);
    expect(r.displayScore).toBe(100);
  });

});
