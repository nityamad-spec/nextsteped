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
