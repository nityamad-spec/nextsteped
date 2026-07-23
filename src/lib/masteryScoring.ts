/**
 * Client-side mirror of `supabase/functions/score-diagnostic/index.ts` scoring math.
 *
 * Keep these constants in sync with the edge function's CONFIG block. If the
 * diagnostic scoring formula changes there, update it here as well.
 */

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

// Phase 5 reasoning follow-up weights (mirrors supabase/functions/update-mastery/mastery.ts).
export const REASONING_BOOST_FRACTION = 0.5;
export const REASONING_PENALTY_FRACTION = 0.25;

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
  /** ms actually spent on the primary question */
  time_ms: number;
  /** tri-state; null / undefined = no follow-up considered */
  reasoning_is_correct?: boolean | null;
}

export interface ScoreResult {
  accuracyScore: number;
  paceScore: number;
  masteryScore: number;
  displayScore: number;
}

/**
 * Compute weekly-quiz score using the same 80% accuracy + 20% pace blend as
 * `score-diagnostic`, extended with the Phase 5 reasoning boost/penalty in the
 * accuracy ratio. Pace uses primaries only.
 */
export function computeWeeklyQuizScore(items: ScoreItem[]): ScoreResult {
  let earned = 0;
  let maxSum = 0;
  const paceScores: number[] = [];

  for (const it of items) {
    const bloom = clampBloom(it.bloom);
    const difficulty = clamp01(it.difficulty);
    const bloomWeight = BLOOM_WEIGHT[bloom] ?? 1.0;
    const maxPoints = difficulty * bloomWeight;

    // Primary contribution
    maxSum += maxPoints;
    if (it.is_correct) earned += maxPoints;

    // Reasoning follow-up (only when primary correct and tri-state is boolean)
    if (it.is_correct && it.reasoning_is_correct === true) {
      earned += REASONING_BOOST_FRACTION * maxPoints;
      maxSum += REASONING_BOOST_FRACTION * maxPoints;
    } else if (it.is_correct && it.reasoning_is_correct === false) {
      maxSum += REASONING_PENALTY_FRACTION * maxPoints;
    }

    // Pace (primaries only). Missing/zero time falls back to expected → pace 1.0.
    const expectedMs = (EXPECTED_TIME_BASE_MS[bloom] ?? 30_000) * difficultyTimeFactor(difficulty);
    const actualMs = it.time_ms > 0 ? it.time_ms : expectedMs;
    paceScores.push(paceCurve(actualMs / expectedMs));
  }

  const accuracyScore = maxSum > 0 ? clamp01(earned / maxSum) : 0;
  const paceScore = paceScores.length
    ? paceScores.reduce((s, x) => s + x, 0) / paceScores.length
    : 0;
  const masteryScore = clamp01(WEIGHTS.accuracy * accuracyScore + WEIGHTS.pace * paceScore);
  const displayScore = Math.round(masteryScore * 100);

  return { accuracyScore, paceScore, masteryScore, displayScore };
}
