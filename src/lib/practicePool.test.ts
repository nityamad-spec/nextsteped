import { describe, expect, it } from "vitest";
import { planPoolBatches } from "./practicePool";

describe("planPoolBatches", () => {
  it("spreads questions evenly across weeks", () => {
    const b = planPoolBatches([1, 2, 3], 10, "non_coding");
    expect(b).toEqual([{ week: 1, count: 4 }, { week: 2, count: 3 }, { week: 3, count: 3 }]);
  });
  it("splits coding into batches of at most 3", () => {
    const b = planPoolBatches([5], 7, "coding");
    expect(b.map((x) => x.count)).toEqual([3, 3, 1]);
  });
  it("skips weeks that get no questions", () => {
    expect(planPoolBatches([1, 2, 3], 2, "non_coding")).toEqual([{ week: 1, count: 1 }, { week: 2, count: 1 }]);
  });
  it("handles empty input", () => {
    expect(planPoolBatches([], 10, "coding")).toEqual([]);
  });
});
