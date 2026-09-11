import { describe, expect, it } from "vitest";
import { buildPathwayStages, resolveUnitStages } from "./pathwayStages";

describe("resolveUnitStages", () => {
  it("falls back to a first-half / second-half split", () => {
    const out = resolveUnitStages([1, 2, 3, 4], {});
    expect(out).toEqual({ 1: "foundations", 2: "foundations", 3: "advanced", 4: "advanced" });
  });

  it("honours professor assignments", () => {
    const out = resolveUnitStages([1, 2], { 1: "advanced", 2: "foundations" });
    expect(out).toEqual({ 1: "advanced", 2: "foundations" });
  });
});

const base = {
  days: [1, 2, 3, 4],
  stageByDay: {},
  hoursByDay: { 1: 10, 2: 10, 3: 5, 4: 5 },
  doneDays: new Set<number>(),
  softSkillsCount: 2,
  softSkillsHours: 30,
  capstoneCount: 1,
  capstoneHours: 25,
};

describe("buildPathwayStages", () => {
  it("locks later stages until earlier ones complete", () => {
    const { stages } = buildPathwayStages(base);
    expect(stages.map((s) => s.status)).toEqual(["in_progress", "locked", "locked", "locked"]);
  });

  it("completes stage 1 and opens stage 2", () => {
    const { stages, overallPct } = buildPathwayStages({ ...base, doneDays: new Set([1, 2]) });
    expect(stages[0].status).toBe("complete");
    expect(stages[1].status).toBe("in_progress");
    expect(overallPct).toBe(29);
  });

  it("sums hours per stage and overall", () => {
    const { stages, totalHours } = buildPathwayStages(base);
    expect(stages[0].hours).toBe(20);
    expect(stages[1].hours).toBe(10);
    expect(totalHours).toBe(85);
  });

  it("treats an empty stage as not complete", () => {
    const { stages } = buildPathwayStages({ ...base, softSkillsCount: 0, doneDays: new Set([1, 2, 3, 4]) });
    expect(stages[2].status).toBe("in_progress");
    expect(stages[3].status).toBe("locked");
  });
});
