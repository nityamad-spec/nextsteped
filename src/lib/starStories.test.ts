import { describe, expect, it } from "vitest";
import { STAR_COMPLETION_THRESHOLD, writtenLabel } from "./starStories";

describe("writtenLabel", () => {
  const now = new Date("2026-01-10T12:00:00.000Z");

  it("labels a fresh save", () => {
    expect(writtenLabel("2026-01-10T11:59:40.000Z", now)).toBe("just now");
  });

  it("labels minutes, hours, days and weeks", () => {
    expect(writtenLabel("2026-01-10T11:30:00.000Z", now)).toBe("30m ago");
    expect(writtenLabel("2026-01-10T09:00:00.000Z", now)).toBe("3h ago");
    expect(writtenLabel("2026-01-08T12:00:00.000Z", now)).toBe("2d ago");
    expect(writtenLabel("2025-12-27T12:00:00.000Z", now)).toBe("2w ago");
  });

  it("returns an empty label for bad input", () => {
    expect(writtenLabel("not-a-date", now)).toBe("");
  });
});

describe("completion threshold", () => {
  it("marks Prepare complete at six stories", () => {
    expect(STAR_COMPLETION_THRESHOLD).toBe(6);
  });
});
