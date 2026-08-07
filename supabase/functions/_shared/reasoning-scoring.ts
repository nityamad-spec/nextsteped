/**
 * Deno mirror of the reasoning-scoring block in `src/lib/reasoning.ts`.
 * Edge functions cannot import from `src/`, so the two files are a synced pair:
 * change both together.
 */

export const REASONING_BLOOM_THRESHOLD = 3;

/** Master switch — set false to score exactly as before the verdict landed. */
export const REASONING_SCORING_ENABLED = true;

/** Bloom-2 weight used when the verdict is `rejected`, or the answer is wrong. */
export const REASONING_REJECTED_WEIGHT = 1.2;

export type ReasoningVerdict = "accepted" | "rejected";

export function requiresReasoning(bloom: number | undefined | null): boolean {
  return Number(bloom ?? 0) >= REASONING_BLOOM_THRESHOLD;
}

/**
 * Multiplier applied to a question's max points to obtain the points earned.
 *
 *   correct + accepted / no verdict → 1
 *   correct + rejected             → min(1, 1.2 / bloomWeight)
 *   incorrect + accepted           → min(1, 1.2 / bloomWeight)
 *   incorrect + rejected / none    → 0
 */
export function reasoningEarnedFactor(args: {
  bloom: number;
  bloomWeight: number;
  isCorrect: boolean;
  verdict?: ReasoningVerdict | null;
}): number {
  const base = args.isCorrect ? 1 : 0;
  if (!REASONING_SCORING_ENABLED) return base;
  if (!requiresReasoning(args.bloom)) return base;

  const w = Number(args.bloomWeight);
  const reduced = !isFinite(w) || w <= 0 ? 1 : Math.min(1, REASONING_REJECTED_WEIGHT / w);

  if (args.isCorrect) return args.verdict === "rejected" ? reduced : 1;
  return args.verdict === "accepted" ? reduced : 0;
}
