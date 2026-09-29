export type PoolKind = "non_coding" | "coding";

/** Max items per generate-practice-pool call (coding is slower: Judge0 validation). */
export const POOL_BATCH_SIZE: Record<PoolKind, number> = { non_coding: 10, coding: 3 };

/**
 * Spread `total` questions across the selected weeks as evenly as possible,
 * then split each week's share into server-sized batches.
 */
export function planPoolBatches(weeks: number[], total: number, kind: PoolKind): { week: number; count: number }[] {
  if (!weeks.length || total <= 0) return [];
  const size = POOL_BATCH_SIZE[kind];
  const base = Math.floor(total / weeks.length);
  let extra = total % weeks.length;
  const out: { week: number; count: number }[] = [];
  for (const week of weeks) {
    let n = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    while (n > 0) {
      const c = Math.min(size, n);
      out.push({ week, count: c });
      n -= c;
    }
  }
  return out;
}
