/**
 * attempt-scoring — the single source of truth for how an attempt is scored.
 *
 * Every testing format (weekly quiz, exam, practice, diagnostic) and the
 * mastery pipeline use the identical blend:
 *
 *   maxPoints = clamp01(difficulty) × BLOOM_WEIGHT[bloom]
 *   factor    = reasoningEarnedFactor(...)   // flat 0.5 partial credit
 *   earned    = maxPoints × factor
 *
 *   accuracy  = Σ earned / Σ maxPoints
 *   pace      = mean(paceCurve(actualMs / expectedMs))
 *   signal    = 0.80 × accuracy + 0.20 × pace        (0..1, unrounded)
 *   display   = round(100 × signal)
 *
 * The mastery pipeline shrinks + EMA-blends `signal` (never the rounded
 * display value).
 *
 * NOTE: this file is the ONLY home of the scoring constants — including
 * `BLOOM_WEIGHT`. Never copy them elsewhere. `src/lib/masteryScoring.ts` is a
 * thin re-export of this module (the file is plain, Deno-API-free TypeScript,
 * so Vite bundles it directly); `src/lib/attemptScoring.test.ts` asserts the
 * browser exports are the very same function objects, so a copy cannot creep
 * back in.
 */

export type ReasoningVerdict = "accepted" | "rejected";

/** Bloom level at or above which a written rationale is collected. */
export const REASONING_BLOOM_THRESHOLD = 3;

/** Master switch — set false to ignore reasoning verdicts entirely. */
export const REASONING_SCORING_ENABLED = true;

/** Credit for "right answer, rejected reasoning" and "wrong answer, accepted reasoning". */
export const REASONING_PARTIAL_FACTOR = 0.5;

/** Cognitive depth weights (Bloom 1..6). */
export const BLOOM_WEIGHT: Record<number, number> = {
  1: 1.0, 2: 1.2, 3: 1.5, 4: 1.8, 5: 2.1, 6: 2.5,
};

/** Expected solve time per Bloom level at difficulty 0.5, in ms. */
export const EXPECTED_TIME_BASE_MS: Record<number, number> = {
  1: 20_000, 2: 30_000, 3: 45_000, 4: 60_000, 5: 80_000, 6: 110_000,
};

export const PACE_GUESS_FLOOR = 0.2;
export const PACE_FAST_CUTOFF = 0.25;
export const PACE_SLOW_DECAY = 2.0;
/**
 * Outlier guard: a single stale/idle-inflated `time_ms` (left the tab open over
 * lunch, legacy rows) must not crush the pace term. Ratios above this ceiling
 * are treated as the ceiling.
 */
export const PACE_MAX_RATIO = 10;


export const WEIGHTS = { accuracy: 0.80, pace: 0.20 } as const;

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export const clampBloom = (n: number) => Math.min(6, Math.max(1, Math.round(n)));

export const difficultyTimeFactor = (d: number) => 0.6 + 1.0 * clamp01(d);

/** True when a question's Bloom level requires a written rationale. */
export function requiresReasoning(bloom: number | undefined | null): boolean {
  return Number(bloom ?? 0) >= REASONING_BLOOM_THRESHOLD;
}

/**
 * Multiplier applied to a question's max points to obtain the points earned.
 *
 *   bloom ≤ 2                   → correct ? 1 : 0
 *   correct + accepted          → 1
 *   correct + no verdict        → 1   (never punish an AI outage)
 *   correct + rejected          → 0.5
 *   incorrect + accepted        → 0.5
 *   incorrect + rejected/none   → 0
 */
export function reasoningEarnedFactor(args: {
  bloom: number;
  isCorrect: boolean;
  verdict?: ReasoningVerdict | null;
}): number {
  const base = args.isCorrect ? 1 : 0;
  if (!REASONING_SCORING_ENABLED) return base;
  if (!requiresReasoning(args.bloom)) return base;

  if (args.isCorrect) {
    return args.verdict === "rejected" ? REASONING_PARTIAL_FACTOR : 1;
  }
  return args.verdict === "accepted" ? REASONING_PARTIAL_FACTOR : 0;
}

export interface ScoreItem {
  difficulty: number;
  bloom: number;
  is_correct: boolean;
  /** ms actually spent on the question. Missing/zero → expected time (pace 1.0). */
  time_ms?: number;
  /** LLM verdict on the Bloom 3+ rationale; null/undefined = treated as accepted. */
  verdict?: ReasoningVerdict | null;
  concept_id?: string | null;
  concept_code?: string | null;
}

export interface ScoreResult {
  /** 0..1 weighted accuracy. */
  accuracy: number;
  /** 0..1 mean pace. */
  pace: number;
  /** 0..1 blended 80/20 signal — the value mastery shrinks and EMA-blends. */
  signal: number;
  /** round(100 × signal) — what the student sees. */
  displayScore: number;
  /** displayScore minus the same attempt scored with verdicts ignored. */
  reasoningAdjustment: number;
  questionCount: number;
  correctCount: number;
  /** Bloom 3+ questions that arrived without a verdict (AI outage signal). */
  unverifiedReasoning: number;
}

/**
 * Resolve the effective Bloom level. An unknown/NaN Bloom with a verdict
 * present is evidence the question was Bloom 3+ (the rationale widget only
 * renders at level 3 and above), so the verdict is never silently ignored.
 */
export function effectiveBloom(item: ScoreItem): number {
  if (Number.isFinite(item.bloom)) return clampBloom(item.bloom);
  return item.verdict ? REASONING_BLOOM_THRESHOLD : 1;
}

export function maxPointsFor(item: ScoreItem): number {
  const bloom = effectiveBloom(item);
  return clamp01(item.difficulty) * (BLOOM_WEIGHT[bloom] ?? 1.0);
}

export function expectedMsFor(item: ScoreItem): number {
  const bloom = effectiveBloom(item);
  return (EXPECTED_TIME_BASE_MS[bloom] ?? 30_000) * difficultyTimeFactor(item.difficulty);
}

/** Pace curve: r = actual / expected. Smooth, no hard cliff on the slow side. */
export function paceCurve(r: number): number {
  if (!isFinite(r) || r <= 0) return PACE_GUESS_FLOOR;
  if (r < PACE_FAST_CUTOFF) return PACE_GUESS_FLOOR;
  if (r <= 1.0) {
    const t = (r - PACE_FAST_CUTOFF) / (1.0 - PACE_FAST_CUTOFF);
    return PACE_GUESS_FLOOR + t * (1.0 - PACE_GUESS_FLOOR);
  }
  return Math.exp(-(r - 1.0) / PACE_SLOW_DECAY);
}

/** Score a whole attempt (or any subset of its questions). */
export function scoreAttempt(items: ScoreItem[]): ScoreResult {
  let earned = 0;
  let earnedNoVerdict = 0;
  let maxSum = 0;
  let correctCount = 0;
  let unverifiedReasoning = 0;
  const paceScores: number[] = [];

  for (const it of items) {
    const bloom = effectiveBloom(it);
    const maxPoints = maxPointsFor(it);
    const verdict = it.verdict ?? null;
    if (requiresReasoning(bloom) && !verdict) unverifiedReasoning += 1;

    maxSum += maxPoints;
    // The verdict only moves points earned; maxPoints is never touched.
    earned += maxPoints * reasoningEarnedFactor({ bloom, isCorrect: it.is_correct, verdict });
    if (it.is_correct) {
      earnedNoVerdict += maxPoints;
      correctCount += 1;
    }

    const expectedMs = expectedMsFor(it);
    const actualMs = typeof it.time_ms === "number" && it.time_ms > 0 ? it.time_ms : expectedMs;
    paceScores.push(paceCurve(actualMs / expectedMs));
  }

  const accuracy = maxSum > 0 ? clamp01(earned / maxSum) : 0;
  const baseAccuracy = maxSum > 0 ? clamp01(earnedNoVerdict / maxSum) : 0;
  const pace = paceScores.length
    ? paceScores.reduce((s, x) => s + x, 0) / paceScores.length
    : 0;

  const signal = clamp01(WEIGHTS.accuracy * accuracy + WEIGHTS.pace * pace);
  const displayScore = Math.round(signal * 100);
  const baseDisplay = Math.round(
    clamp01(WEIGHTS.accuracy * baseAccuracy + WEIGHTS.pace * pace) * 100,
  );

  return {
    accuracy,
    pace,
    signal,
    displayScore,
    reasoningAdjustment: displayScore - baseDisplay,
    questionCount: items.length,
    correctCount,
    unverifiedReasoning,
  };
}

export interface ConceptScore extends ScoreResult {
  concept_id: string | null;
  concept_code: string | null;
}

/**
 * Split an attempt by concept and score each group with the identical blend.
 * Used by diagnostics and exams, where one attempt spans several concepts.
 * Grouping key is `concept_id` when present, otherwise `concept_code`;
 * items with neither are skipped.
 */
export function scoreAttemptByConcept(items: ScoreItem[]): Map<string, ConceptScore> {
  const groups = new Map<string, ScoreItem[]>();
  const labels = new Map<string, { concept_id: string | null; concept_code: string | null }>();

  for (const it of items) {
    const id = (it.concept_id ?? "").trim();
    const code = (it.concept_code ?? "").trim();
    const key = id || code;
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(it);
    else {
      groups.set(key, [it]);
      labels.set(key, { concept_id: id || null, concept_code: code || null });
    }
  }

  const out = new Map<string, ConceptScore>();
  for (const [key, bucket] of groups) {
    out.set(key, { ...scoreAttempt(bucket), ...labels.get(key)! });
  }
  return out;
}
