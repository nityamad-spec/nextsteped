// Pure helpers behind the student "Daily DSA" card: which published exercise
// is today's problem, and how the solved-day streak is counted.

import type { PublishedCodingExercise } from "@/lib/codingExercises";

/** Local calendar day key (YYYY-MM-DD) for a date or ISO timestamp. */
export function dayKey(value: Date | string = new Date()): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDayKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + deltaDays);
  return dayKey(date);
}

/**
 * Today's problem: the first unsolved published exercise from a week the
 * student has already unlocked, ordered by week then position. Falls back to
 * unsolved exercises from locked weeks only when no unlocked one is left.
 */
export function pickDailyExercise(
  exercises: PublishedCodingExercise[],
  solvedIds: Set<string>,
  unlockedWeeks: Set<number>,
): PublishedCodingExercise | null {
  const unsolved = exercises
    .filter((e) => !solvedIds.has(e.id))
    .sort((a, b) => a.week_number - b.week_number || a.position - b.position);
  if (unsolved.length === 0) return null;
  return unsolved.find((e) => unlockedWeeks.has(e.week_number)) ?? unsolved[0];
}

/**
 * Strict daily streak: consecutive days with at least one solved problem,
 * counting back from today. A solve yesterday but not today still keeps the
 * streak alive for the rest of today.
 */
export function solvedStreak(
  solvedDayKeys: Iterable<string>,
  today: string = dayKey(),
): number {
  const days = new Set(solvedDayKeys);
  if (days.size === 0) return 0;
  let cursor = days.has(today) ? today : shiftDayKey(today, -1);
  if (!days.has(cursor)) return 0;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return streak;
}

/** Most recent solved days, newest first. */
export function recentSolvedDays(
  solvedDayKeys: Iterable<string>,
  limit = 7,
): string[] {
  return Array.from(new Set(solvedDayKeys)).sort().reverse().slice(0, limit);
}

/** Short label for a solved day chip, e.g. "Today" / "Mon 14". */
export function solvedDayLabel(key: string, today: string = dayKey()): string {
  if (key === today) return "Today";
  if (key === shiftDayKey(today, -1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}
