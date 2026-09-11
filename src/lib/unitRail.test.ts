import { describe, it, expect } from "vitest";
import { buildRail, pillLabel } from "./unitRail";

const days = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("buildRail", () => {
  it("shows every unit when the course is short", () => {
    const items = buildRail({ days: days(5), currentDay: 3 });
    expect(items.every((i) => i.kind === "unit")).toBe(true);
    expect(items).toHaveLength(5);
  });

  it("collapses both sides on a 20-unit course", () => {
    const items = buildRail({ days: days(20), currentDay: 8 });
    expect(items[0]).toMatchObject({ kind: "pill", side: "past", count: 5 });
    expect(items[items.length - 1]).toMatchObject({ kind: "pill", side: "future", count: 10 });
    const units = items.filter((i) => i.kind === "unit");
    expect(units.map((u) => (u as { day: number }).day)).toEqual([6, 7, 8, 9, 10]);
  });

  it("keeps the line to a handful of items on a 40-unit course", () => {
    const items = buildRail({ days: days(40), currentDay: 25 });
    expect(items).toHaveLength(7);
  });

  it("expands a pill in place on the same line", () => {
    const items = buildRail({ days: days(20), currentDay: 8, expanded: ["past"] });
    expect(items.filter((i) => i.kind === "pill")).toHaveLength(1);
    expect((items[0] as { day: number }).day).toBe(1);
  });

  it("never renders a pill standing in for a single unit", () => {
    const items = buildRail({ days: days(8), currentDay: 4 });
    expect(items.some((i) => i.kind === "pill" && i.side === "past")).toBe(false);
  });

  it("labels pills", () => {
    const [past] = buildRail({ days: days(20), currentDay: 8 });
    expect(pillLabel(past as never, 5)).toBe("1–5 done");
    const items = buildRail({ days: days(20), currentDay: 8 });
    expect(pillLabel(items[items.length - 1] as never, 0)).toBe("+10 more");
  });
});
