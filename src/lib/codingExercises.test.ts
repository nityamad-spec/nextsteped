import { describe, it, expect } from "vitest";
import {
  selectTerminalExercise,
  shouldAutoSelectExercise,
  type PublishedCodingExercise,
} from "./codingExercises";

const makeExercise = (
  id: string,
  weekNumber: number,
  title = `Exercise ${id}`,
): PublishedCodingExercise => ({
  id,
  week_number: weekNumber,
  position: 1,
  title,
  problem_statement: "Do things",
  language: "python",
  input_spec: "in",
  output_spec: "out",
  constraints: null,
  examples: [],
  starter_code: null,
  primary_language: null,
  standard_test_cases: [],
});

describe("selectTerminalExercise", () => {
  const exercises = [
    makeExercise("ex-a", 1, "First"),
    makeExercise("ex-b", 1, "Second"),
    makeExercise("ex-c", 2, "Other unit"),
  ];

  it("selects the exercise matching the exercise id param", () => {
    expect(selectTerminalExercise(exercises, 1, "ex-b")?.title).toBe("Second");
  });

  it("falls back to the unit's first exercise when the id is unknown", () => {
    expect(selectTerminalExercise(exercises, 1, "missing")?.id).toBe("ex-a");
  });

  it("falls back to the unit's first exercise when no id is given", () => {
    expect(selectTerminalExercise(exercises, 2)?.id).toBe("ex-c");
  });

  it("returns null when nothing matches", () => {
    expect(selectTerminalExercise(exercises, 9)).toBeNull();
    expect(selectTerminalExercise([], 1, "ex-a")).toBeNull();
  });
});

describe("shouldAutoSelectExercise", () => {
  it("skips exercise selection for freeform (Practice step) deep links", () => {
    expect(shouldAutoSelectExercise("1")).toBe(false);
  });

  it("auto-selects an exercise for exercise step-card deep links", () => {
    expect(shouldAutoSelectExercise(null)).toBe(true);
    expect(shouldAutoSelectExercise("0")).toBe(true);
  });
});

import { regenerateBlockedReason, summariseRegen } from "@/lib/codingExercises";

describe("reference solution regeneration helpers", () => {
  const base = {
    title: "t", problem_statement: "p", language: "python", input_spec: "i", output_spec: "o",
    constraints: null, examples: [], starter_code: "", standard_test_cases: [{ input: "1", expected_output: "1" }],
    reference_solution: "", hidden_test_cases: [],
  } as any;
  const pass = { passed: true } as any;
  const fail = { passed: false } as any;
  const chk = (status: string) => ({ id: "x", label: "x", status, note: "" }) as any;

  it("blocks without specs or cases", () => {
    expect(regenerateBlockedReason({ ...base, input_spec: " " })).toMatch(/input/i);
    expect(regenerateBlockedReason({ ...base, standard_test_cases: [] })).toMatch(/test case/i);
    expect(regenerateBlockedReason(base)).toBeNull();
  });

  it("summarises verified / needs review / failed", () => {
    expect(summariseRegen({ cases: [pass], checks: [chk("pass")] })).toBe("verified");
    expect(summariseRegen({ cases: [pass], checks: [chk("warning")] })).toBe("needs_review");
    expect(summariseRegen({ cases: [pass, fail], checks: [chk("pass")] })).toBe("failed");
    expect(summariseRegen({ cases: [], checks: [] })).toBe("failed");
  });
});
