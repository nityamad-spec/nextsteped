/**
 * Pure layout helper for the Learning Path rail.
 *
 * Turns the full unit list into the items rendered on a single horizontal
 * line: individual unit nodes around the current unit, plus collapsed pills
 * standing in for long runs of past / future units. Expanding a pill splices
 * its units back onto the same line (the line then scrolls horizontally).
 */

export type RailItem =
  | { kind: "unit"; day: number; index: number }
  | { kind: "pill"; id: RailPillId; from: number; to: number; count: number; side: "past" | "future" };

export type RailPillId = "past" | "future";

export interface BuildRailInput {
  /** Unit (week) numbers in order. */
  days: number[];
  /** The unit currently in focus. */
  currentDay: number;
  /** Pills the student has expanded in place. */
  expanded?: ReadonlySet<RailPillId> | RailPillId[];
  /** How many units to always show on each side of the current one. */
  neighbours?: number;
}

export function buildRail({ days, currentDay, expanded, neighbours = 2 }: BuildRailInput): RailItem[] {
  if (days.length === 0) return [];
  const open = new Set<RailPillId>(Array.isArray(expanded) ? expanded : Array.from(expanded ?? []));

  const currentIndex = Math.max(0, days.indexOf(currentDay));
  const windowStart = Math.max(0, currentIndex - neighbours);
  const windowEnd = Math.min(days.length - 1, currentIndex + neighbours);

  const items: RailItem[] = [];
  const pushUnits = (from: number, to: number) => {
    for (let i = from; i <= to; i++) items.push({ kind: "unit", day: days[i], index: i });
  };

  // Past run — collapsed unless expanded. A single hidden unit is never worth
  // a pill, so show it inline instead.
  if (windowStart > 0) {
    if (open.has("past") || windowStart === 1) {
      pushUnits(0, windowStart - 1);
    } else {
      items.push({
        kind: "pill",
        id: "past",
        from: days[0],
        to: days[windowStart - 1],
        count: windowStart,
        side: "past",
      });
    }
  }

  pushUnits(windowStart, windowEnd);

  const remaining = days.length - 1 - windowEnd;
  if (remaining > 0) {
    if (open.has("future") || remaining === 1) {
      pushUnits(windowEnd + 1, days.length - 1);
    } else {
      items.push({
        kind: "pill",
        id: "future",
        from: days[windowEnd + 1],
        to: days[days.length - 1],
        count: remaining,
        side: "future",
      });
    }
  }

  return items;
}

/** Label shown inside a collapsed pill. */
export function pillLabel(item: Extract<RailItem, { kind: "pill" }>, doneCount: number): string {
  if (item.side === "past") {
    return doneCount >= item.count ? `${item.from}–${item.to} done` : `${item.from}–${item.to}`;
  }
  return `+${item.count} more`;
}
