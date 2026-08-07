/**
 * Client-side mirror of `supabase/functions/score-diagnostic/index.ts` scoring math.
 *
 * Keep these constants in sync with the edge function's CONFIG block. If the
 * diagnostic scoring formula changes there, update it here as well.
 */

import { reasoningEarnedFactor, type ReasoningVerdict } from "@/lib/reasoning";



export const BLOOM_WEIGHT: Record<number, number> = {
  1: 1.0, 2: 1.2, 3: 1.5, 4: 1.8, 5: 2.1, 6: 2.5,
};

export const EXPECTED_TIME_BASE_MS: Record<number, number> = {
  1: 20_000, 2: 30_000, 3: 45_000, 4: 60_000, 5: 80_000, 6: 110_000,
};

export const PACE_GUESS_FLOOR = 0.2;
export const PACE_FAST_CUTOFF = 0.25;
export const PACE_SLOW_DECAY = 2.0;

export const WEIGHTS = { accuracy: 0.80, pace: 0.20 } as const;

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export const clampBloom = (n: number) => Math.min(6, Math.max(1, Math.round(n)));

export const difficultyTimeFactor = (d: number) => 0.6 + 1.0 * clamp01(d);

export function paceCurve(r: number): number {
  if (!isFinite(r) || r <= 0) return PACE_GUESS_FLOOR;
  if (r < PACE_FAST_CUTOFF) return PACE_GUESS_FLOOR;
  if (r <= 1.0) {
    const t = (r - PACE_FAST_CUTOFF) / (1.0 - PACE_FAST_CUTOFF);
    return PACE_GUESS_FLOOR + t * (1.0 - PACE_GUESS_FLOOR);
  }
  return Math.exp(-(r - 1.0) / PACE_SLOW_DECAY);
}

export interface ScoreItem {
  difficulty: number;
  bloom: number;
  is_correct: boolean;
  /** ms actually spent on the question */
  time_ms: number;
  /** LLM verdict on the Bloom 3+ rationale; null/undefined = treated as accepted. */
  verdict?: ReasoningVerdict | null;
}

export interface ScoreResult {
  accuracyScore: number;
  paceScore: number;
  masteryScore: number;
  displayScore: number;
  /**
   * displayScore minus the score the same attempt would have received with the
   * reasoning verdicts ignored. Negative when rejected rationales cost points,
   * positive when accepted rationales earned partial credit on wrong answers.
   */
  reasoningAdjustment: number;
}


/**
 * Compute weekly-quiz score using the same 80% accuracy + 20% pace blend as
 * `score-diagnostic`.
 */
export function computeWeeklyQuizScore(items: ScoreItem[]): ScoreResult {
  let earned = 0;
  let earnedNoVerdict = 0;
  let maxSum = 0;
  const paceScores: number[] = [];

  for (const it of items) {
    // Unknown/NaN Bloom with a verdict present is evidence the question was
    // Bloom 3+ (the rationale widget only renders at level 3 and above), so the
    // verdict is never silently ignored. Mirrors buildReasoningRows' fallback.
    const bloom = Number.isFinite(it.bloom)
      ? clampBloom(it.bloom)
      : it.verdict
        ? 3
        : 1;
    const difficulty = clamp01(it.difficulty);
    const bloomWeight = BLOOM_WEIGHT[bloom] ?? 1.0;
    const maxPoints = difficulty * bloomWeight;

    maxSum += maxPoints;
    // Reasoning verdict only moves points earned; maxPoints is untouched.
    earned += maxPoints * reasoningEarnedFactor({
      bloom,
      bloomWeight,
      isCorrect: it.is_correct,
      verdict: it.verdict ?? null,
    });
    if (it.is_correct) earnedNoVerdict += maxPoints;

    // Pace. Missing/zero time falls back to expected → pace 1.0.
    const expectedMs = (EXPECTED_TIME_BASE_MS[bloom] ?? 30_000) * difficultyTimeFactor(difficulty);
    const actualMs = it.time_ms > 0 ? it.time_ms : expectedMs;
    paceScores.push(paceCurve(actualMs / expectedMs));
  }

  const accuracyScore = maxSum > 0 ? clamp01(earned / maxSum) : 0;
  const baseAccuracy = maxSum > 0 ? clamp01(earnedNoVerdict / maxSum) : 0;
  const paceScore = paceScores.length
    ? paceScores.reduce((s, x) => s + x, 0) / paceScores.length
    : 0;
  const masteryScore = clamp01(WEIGHTS.accuracy * accuracyScore + WEIGHTS.pace * paceScore);
  const displayScore = Math.round(masteryScore * 100);
  const baseDisplay = Math.round(
    clamp01(WEIGHTS.accuracy * baseAccuracy + WEIGHTS.pace * paceScore) * 100,
  );

  return {
    accuracyScore,
    paceScore,
    masteryScore,
    displayScore,
    reasoningAdjustment: displayScore - baseDisplay,
  };

}
