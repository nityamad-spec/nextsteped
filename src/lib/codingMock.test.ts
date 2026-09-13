import { describe, expect, it } from "vitest";
import {
  CODING_COACH_CHECKLIST,
  CODING_MOCK_CONFIG,
  CODING_MOCK_MINUTES,
  CODING_PREP_STEPS,
  CODING_PROMPT,
  CODING_REVIEW_NOTES,
  SYSTEM_DESIGN_MOCK_CONFIG,
  formatElapsedTime,
} from "./codingMock";

describe("codingMock", () => {
  it("has four prep steps in order", () => {
    expect(CODING_PREP_STEPS).toHaveLength(4);
    CODING_PREP_STEPS.forEach((step, i) => {
      expect(step.number).toBe(i + 1);
      expect(step.text.length).toBeGreaterThan(0);
    });
  });

  it("exposes the prompt question and follow-up", () => {
    expect(CODING_PROMPT.question).toContain("K largest");
    expect(CODING_PROMPT.followUp).toContain("trade-off");
  });

  it("has six coach checklist items", () => {
    expect(CODING_COACH_CHECKLIST).toHaveLength(6);
    expect(new Set(CODING_COACH_CHECKLIST.map((c) => c.id)).size).toBe(6);
  });

  it("has at least one review note", () => {
    expect(CODING_REVIEW_NOTES.length).toBeGreaterThan(0);
  });

  it("formats elapsed time as mm:ss", () => {
    expect(formatElapsedTime(0)).toBe("00:00");
    expect(formatElapsedTime(43)).toBe("00:43");
    expect(formatElapsedTime(CODING_MOCK_MINUTES * 60)).toBe("45:00");
    expect(formatElapsedTime(61)).toBe("01:01");
  });

  it("clamps negative elapsed time to zero", () => {
    expect(formatElapsedTime(-10)).toBe("00:00");
  });
});
