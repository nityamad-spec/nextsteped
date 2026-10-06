import { describe, it, expect } from "vitest";
import { computeCoverage, skillStatus } from "./jobCoverage";

describe("jobCoverage", () => {
  it("scores levels", () => {
    expect(skillStatus("working", "advanced")).toBe("covered");
    expect(skillStatus("advanced", "basic")).toBe("partial");
    expect(skillStatus("basic", undefined)).toBe("missing");
  });
  it("computes half credit and gaps", () => {
    const r = computeCoverage(
      [
        { id: "1", title: "A", company: "x", tier: "accessible", skills: [{ skill: "SQL", level: "working" }, { skill: "Python", level: "advanced" }] },
        { id: "2", title: "B", company: "y", tier: "competitive", skills: [{ skill: "sql", level: "basic" }, { skill: "Tableau", level: "basic" }] },
      ],
      [{ skill: "SQL", level: "working" }, { skill: "Python", level: "basic" }],
    );
    expect(r.overallPct).toBe(63); // (0.75 + 0.5)/2
    expect(r.fullyCovered).toBe(0);
    expect(r.gaps.map((g) => g.kind)).toEqual(["Needs more depth", "Not taught"]);
    expect(r.covered).toEqual(["SQL"]);
  });
});
