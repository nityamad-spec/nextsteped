import { describe, it, expect } from "vitest";
import { dayKey, pickDailyExercise, solvedStreak, recentSolvedDays } from "@/lib/dailyDsa";
import type { PublishedCodingExercise } from "@/lib/codingExercises";

const ex = (id: string, week: number, position: number) =>
  ({ id, week_number: week, position } as PublishedCodingExercise);

describe("pickDailyExercise", () => {
  const bank = [ex("a", 2, 1), ex("b", 1, 2), ex("c", 1, 1), ex("d", 5, 1)];

  it("picks the earliest unsolved exercise from an unlocked week", () => {
    const pick = pickDailyExercise(bank, new Set(), new Set([1, 2]));
    expect(pick?.id).toBe("c");
  });

  it("skips solved exercises", () => {
    const pick = pickDailyExercise(bank, new Set(["c", "b"]), new Set([1, 2]));
    expect(pick?.id).toBe("a");
  });

  it("falls back to locked weeks when unlocked ones are exhausted", () => {
    const pick = pickDailyExercise(bank, new Set(["a", "b", "c"]), new Set([1, 2]));
    expect(pick?.id).toBe("d");
  });

  it("returns null when everything is solved", () => {
    expect(pickDailyExercise(bank, new Set(["a", "b", "c", "d"]), new Set([1]))).toBeNull();
  });
});

describe("solvedStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(solvedStreak(["2026-03-10", "2026-03-11", "2026-03-12"], "2026-03-12")).toBe(3);
  });

  it("keeps the streak alive on a day not yet solved", () => {
    expect(solvedStreak(["2026-03-10", "2026-03-11"], "2026-03-12")).toBe(2);
  });

  it("resets after a missed day", () => {
    expect(solvedStreak(["2026-03-08", "2026-03-09"], "2026-03-12")).toBe(0);
  });

  it("is zero with no solves", () => {
    expect(solvedStreak([], "2026-03-12")).toBe(0);
  });
});

describe("recentSolvedDays", () => {
  it("returns unique days newest first", () => {
    expect(recentSolvedDays(["2026-03-10", "2026-03-12", "2026-03-10"], 2)).toEqual([
      "2026-03-12",
      "2026-03-10",
    ]);
  });
});

describe("dayKey", () => {
  it("formats a local date", () => {
    expect(dayKey(new Date(2026, 2, 5))).toBe("2026-03-05");
  });
});
