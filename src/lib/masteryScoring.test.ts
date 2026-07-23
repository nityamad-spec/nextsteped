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

  it("reasoning correct boosts accuracy above primary-only", () => {
    const base: ScoreItem = { difficulty: 0.5, bloom: 3, is_correct: true, time_ms: expected(3, 0.5) };
    const withoutFu = computeWeeklyQuizScore([base]);
    const withBoost = computeWeeklyQuizScore([{ ...base, reasoning_is_correct: true }]);
    expect(withBoost.accuracyScore).toBeGreaterThanOrEqual(withoutFu.accuracyScore);
    // Both are 1.0 already; ensure boost never lowers score.
    expect(withBoost.displayScore).toBeGreaterThanOrEqual(withoutFu.displayScore);
  });

  it("reasoning wrong penalises but stays ≥ wrong-primary baseline", () => {
    const bloom3Corr: ScoreItem = { difficulty: 0.5, bloom: 3, is_correct: true, time_ms: expected(3, 0.5) };
    const bloom3Wrong: ScoreItem = { difficulty: 0.5, bloom: 3, is_correct: false, time_ms: expected(3, 0.5) };
    const primaryOnly = computeWeeklyQuizScore([bloom3Corr]).accuracyScore;
    const penalised = computeWeeklyQuizScore([{ ...bloom3Corr, reasoning_is_correct: false }]).accuracyScore;
    const wrongPrimary = computeWeeklyQuizScore([bloom3Wrong]).accuracyScore;
    expect(penalised).toBeLessThan(primaryOnly);
    expect(penalised).toBeGreaterThanOrEqual(wrongPrimary);
  });

  it("penalty magnitude is smaller than boost magnitude (asymmetry)", () => {
    const base: ScoreItem = { difficulty: 0.5, bloom: 3, is_correct: true, time_ms: expected(3, 0.5) };
    // Use two items so boost has room to move the ratio (single item both stay at 1.0).
    const items = (rc: boolean | null): ScoreItem[] => [
      { ...base, reasoning_is_correct: rc },
      { difficulty: 0.5, bloom: 3, is_correct: false, time_ms: expected(3, 0.5) },
    ];
    const baseline = computeWeeklyQuizScore(items(null)).accuracyScore;
    const boost = computeWeeklyQuizScore(items(true)).accuracyScore - baseline;
    const penalty = baseline - computeWeeklyQuizScore(items(false)).accuracyScore;
    expect(boost).toBeGreaterThan(0);
    expect(penalty).toBeGreaterThan(0);
    expect(penalty).toBeLessThan(boost);
  });

  it("missing timing falls back to expected (pace = 1.0)", () => {
    const items: ScoreItem[] = [
      { difficulty: 0.5, bloom: 2, is_correct: true, time_ms: 0 },
    ];
    const r = computeWeeklyQuizScore(items);
    expect(r.paceScore).toBeCloseTo(1, 5);
    expect(r.displayScore).toBe(100);
  });

  it("reasoning_is_correct null / undefined is ignored", () => {
    const base: ScoreItem = { difficulty: 0.5, bloom: 3, is_correct: true, time_ms: expected(3, 0.5) };
    const a = computeWeeklyQuizScore([base]);
    const b = computeWeeklyQuizScore([{ ...base, reasoning_is_correct: null }]);
    expect(a.accuracyScore).toBeCloseTo(b.accuracyScore, 6);
  });
});
