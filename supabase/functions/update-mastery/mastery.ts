// Pure mastery math extracted from index.ts so it can be unit-tested
// without a database. Keep this file dependency-free.

export const MASTERY_CONFIG = {
  EMA_ALPHA_BY_SOURCE: {
    weekly_quiz: 0.4,
    exam: 0.6,
    practice: 0.3,
    diagnostic: 0.4,
  } as Record<string, number>,
  EMA_ALPHA_DEFAULT: 0.4,
  PRIOR: 0.5,
  PRIOR_STRENGTH: 8,
  CAP_DEVELOPING_BELOW_ATTEMPTED: 8,
  CAP_PROFICIENT_BELOW_ATTEMPTED: 15,
  CAP_PROFICIENT_MIN_SAMPLES: 2,
  BLOOM_WEIGHT: { 1: 1.0, 2: 1.2, 3: 1.5, 4: 1.8, 5: 2.1, 6: 2.5 } as Record<number, number>,
  LEVEL_BANDS: [
    { max: 0.25, level: "beginner" },
    { max: 0.5, level: "developing" },
    { max: 0.75, level: "proficient" },
    { max: 1.0001, level: "expert" },
  ],
} as const;

export type LearnerLevel = "beginner" | "developing" | "proficient" | "expert";

export const LEVEL_ORDER: Record<LearnerLevel, number> = {
  beginner: 0,
  developing: 1,
  proficient: 2,
  expert: 3,
};

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function bandFor(score: number): LearnerLevel {
  const s = clamp01(score);
  for (const b of MASTERY_CONFIG.LEVEL_BANDS) {
    if (s < b.max) return b.level as LearnerLevel;
  }
  return "expert";
}

/** Pull signal toward neutral prior 0.5 based on total questions seen so far. */
export function shrink(signal: number, attemptedSoFar: number): number {
  const n = Math.max(0, attemptedSoFar);
  const w = n / (n + MASTERY_CONFIG.PRIOR_STRENGTH);
  return clamp01(w * signal + (1 - w) * MASTERY_CONFIG.PRIOR);
}

/** Evidence-gated cap on displayed level. Numeric score is unchanged. */
export function cappedLevel(rawLevel: LearnerLevel, attempted: number, samples: number): LearnerLevel {
  let cap: LearnerLevel = "expert";
  if (attempted < MASTERY_CONFIG.CAP_DEVELOPING_BELOW_ATTEMPTED) {
    cap = "developing";
  } else if (
    attempted < MASTERY_CONFIG.CAP_PROFICIENT_BELOW_ATTEMPTED ||
    samples < MASTERY_CONFIG.CAP_PROFICIENT_MIN_SAMPLES
  ) {
    cap = "proficient";
  }
  return LEVEL_ORDER[rawLevel] <= LEVEL_ORDER[cap] ? rawLevel : cap;
}

/** Blend a new shrunk signal with a prior concept score using source-specific EMA alpha. */
export function blendConceptScore(
  rawSignal: number,
  attemptedAfter: number,
  priorScore: number | null,
  priorSamples: number,
  source: string,
): number {
  const alpha = MASTERY_CONFIG.EMA_ALPHA_BY_SOURCE[source] ?? MASTERY_CONFIG.EMA_ALPHA_DEFAULT;
  const shrunk = shrink(rawSignal, attemptedAfter);
  if (priorScore == null || priorSamples === 0) return shrunk;
  return clamp01(alpha * shrunk + (1 - alpha) * priorScore);
}

/** Course-level practice-only gate: block "expert" when every contributor was practice. */
export function applyPracticeOnlyGate(
  rawLevel: LearnerLevel,
  contributing: number,
  nonPracticeContributors: number,
): LearnerLevel {
  if (rawLevel === "expert" && contributing > 0 && nonPracticeContributors === 0) {
    return "proficient";
  }
  return rawLevel;
}
