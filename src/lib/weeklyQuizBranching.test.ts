import { describe, it, expect } from "vitest";
import {
  pickWeeklyBranchTier,
  computeWeeklyLearnerLevel,
  WQ_STANDARD_COUNT,
  WQ_ADAPTIVE_COUNT,
  WQ_TOTAL_COUNT,
} from "./weeklyQuizBranching";

describe("weeklyQuizBranching constants", () => {
  it("uses a 5+5 split totalling 10", () => {
    expect(WQ_STANDARD_COUNT).toBe(5);
    expect(WQ_ADAPTIVE_COUNT).toBe(5);
    expect(WQ_TOTAL_COUNT).toBe(10);
  });
});

describe("pickWeeklyBranchTier", () => {
  it("returns easy for 0 or 1 correct", () => {
    expect(pickWeeklyBranchTier(0)).toBe("easy");
    expect(pickWeeklyBranchTier(1)).toBe("easy");
  });
  it("returns medium for 2 or 3 correct", () => {
    expect(pickWeeklyBranchTier(2)).toBe("medium");
    expect(pickWeeklyBranchTier(3)).toBe("medium");
  });
  it("returns hard for 4 or 5 correct", () => {
    expect(pickWeeklyBranchTier(4)).toBe("hard");
    expect(pickWeeklyBranchTier(5)).toBe("hard");
  });
});

describe("computeWeeklyLearnerLevel", () => {
  it("returns beginner when total is zero", () => {
    expect(computeWeeklyLearnerLevel(0, 0)).toBe("beginner");
  });
  it("maps ratios to tiers", () => {
    expect(computeWeeklyLearnerLevel(9, 10)).toBe("expert");      // 0.9
    expect(computeWeeklyLearnerLevel(7, 10)).toBe("proficient");  // 0.7
    expect(computeWeeklyLearnerLevel(4, 10)).toBe("developing");  // 0.4
    expect(computeWeeklyLearnerLevel(2, 10)).toBe("beginner");    // 0.2
  });
  it("respects exact thresholds", () => {
    expect(computeWeeklyLearnerLevel(85, 100)).toBe("expert");
    expect(computeWeeklyLearnerLevel(60, 100)).toBe("proficient");
    expect(computeWeeklyLearnerLevel(35, 100)).toBe("developing");
  });
});
