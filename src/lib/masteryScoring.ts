/**
 * Browser entry point for attempt scoring.
 *
 * The math lives in `supabase/functions/_shared/attempt-scoring.ts` so the edge
 * functions and the browser share ONE implementation — importing it here (the
 * file is plain, Deno-API-free TypeScript inside the project root) removes the
 * mirrored-copy drift risk entirely.
 */

export {
  BLOOM_WEIGHT,
  EXPECTED_TIME_BASE_MS,
  PACE_GUESS_FLOOR,
  PACE_FAST_CUTOFF,
  PACE_SLOW_DECAY,
  WEIGHTS,
  REASONING_BLOOM_THRESHOLD,
  REASONING_PARTIAL_FACTOR,
  REASONING_SCORING_ENABLED,
  clamp01,
  clampBloom,
  difficultyTimeFactor,
  paceCurve,
  requiresReasoning,
  reasoningEarnedFactor,
  effectiveBloom,
  maxPointsFor,
  expectedMsFor,
  scoreAttempt,
  scoreAttemptByConcept,
} from "../../supabase/functions/_shared/attempt-scoring";

export type {
  ScoreItem,
  ScoreResult,
  ConceptScore,
  ReasoningVerdict,
} from "../../supabase/functions/_shared/attempt-scoring";

import { scoreAttempt, type ScoreItem } from "../../supabase/functions/_shared/attempt-scoring";

/**
 * Back-compat wrapper for callers that still expect the old field names.
 * Prefer `scoreAttempt` in new code.
 */
export function computeWeeklyQuizScore(items: ScoreItem[]) {
  const r = scoreAttempt(items);
  return {
    accuracyScore: r.accuracy,
    paceScore: r.pace,
    masteryScore: r.signal,
    displayScore: r.displayScore,
    reasoningAdjustment: r.reasoningAdjustment,
  };
}
