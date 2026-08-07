// Shared configuration + helpers for the mandatory "Explain your reasoning"
// textarea shown on higher-order (Bloom 3+) questions across every testing
// format: weekly quizzes, exam prep, practice tests and the diagnostic.
//
// Single source of truth: change the threshold or minimum length here and all
// four surfaces follow.

export const REASONING_BLOOM_THRESHOLD = 3;
export const REASONING_MIN_CHARS = 15;
export const REASONING_MAX_CHARS = 4000;

/** Hard cap on how long final submit waits for in-flight AI evaluations. */
export const REASONING_EVAL_DEADLINE_MS = 8000;

export type ReasoningSourceFormat = "weekly_quiz" | "exam" | "practice" | "diagnostic";
export type ReasoningQuestionSource = "assessment_questions" | "diagnostic_questions" | "generated";

export type ReasoningVerdict = "accepted" | "rejected";
export type ReasoningEvalStatus = "idle" | "pending" | "done" | "unevaluated";

export interface ReasoningEvaluation {
  status: ReasoningEvalStatus;
  /** null when the model could not be reached or returned an unusable verdict. */
  verdict: ReasoningVerdict | null;
  feedback: string;
  modelReasoning: string;
  /** The rationale text this evaluation was produced for (dedupe key). */
  evaluatedText: string;
}

/** True when a question's Bloom level requires a written rationale. */
export function requiresReasoning(bloom: number | undefined | null): boolean {
  return Number(bloom ?? 0) >= REASONING_BLOOM_THRESHOLD;
}

/** True when the supplied text satisfies the mandatory-input rule. */
export function isReasoningComplete(text: string | undefined | null): boolean {
  return (text ?? "").trim().length >= REASONING_MIN_CHARS;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Reasoning-weighted scoring
 *
 * The LLM verdict on a Bloom 3+ rationale moves the POINTS EARNED for that
 * question. The maximum a question is worth (difficulty × Bloom weight) never
 * changes, so a 100% ceiling stays a 100% ceiling and pre-change scores remain
 * comparable.
 *
 * A rejected rationale (or a correct-reason-but-wrong-answer) is scored with
 * the Bloom-2 weight of 1.2 instead of the question's own Bloom weight, capped
 * so it can never exceed the real weight.
 *
 * NOTE: `supabase/functions/_shared/reasoning-scoring.ts` is a byte-for-byte
 * mirror of the block below — edge functions cannot import from `src/`. Change
 * both together.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Master switch — set false to score exactly as before the verdict landed. */
export const REASONING_SCORING_ENABLED = true;

/** Bloom-2 weight used when the verdict is `rejected`, or the answer is wrong. */
export const REASONING_REJECTED_WEIGHT = 1.2;

export interface ReasoningFactorArgs {
  bloom: number;
  /** Bloom weight already applied to this question's max points. */
  bloomWeight: number;
  isCorrect: boolean;
  /** null / undefined = evaluation missing or failed → treated as accepted. */
  verdict?: ReasoningVerdict | null;
}

/**
 * Multiplier applied to a question's max points to obtain the points earned.
 *
 *   correct + accepted / no verdict → 1
 *   correct + rejected             → min(1, 1.2 / bloomWeight)
 *   incorrect + accepted           → min(1, 1.2 / bloomWeight)
 *   incorrect + rejected / none    → 0
 */
export function reasoningEarnedFactor({
  bloom,
  bloomWeight,
  isCorrect,
  verdict,
}: ReasoningFactorArgs): number {
  const base = isCorrect ? 1 : 0;
  if (!REASONING_SCORING_ENABLED) return base;
  if (!requiresReasoning(bloom)) return base;

  const w = Number(bloomWeight);
  const reduced = !isFinite(w) || w <= 0 ? 1 : Math.min(1, REASONING_REJECTED_WEIGHT / w);

  if (isCorrect) return verdict === "rejected" ? reduced : 1;
  return verdict === "accepted" ? reduced : 0;
}

/** Pull the usable verdict for a question out of the evaluation map. */
export function verdictFor(
  evaluations: Record<string, ReasoningEvaluation> | undefined,
  questionId: string,
): ReasoningVerdict | null {
  const e = evaluations?.[questionId];
  return e?.status === "done" && e.verdict ? e.verdict : null;
}


export interface ReasoningRow {
  student_id: string;
  course_id: string | null;
  source_format: ReasoningSourceFormat;
  source_result_id: string | null;
  question_id: string;
  question_source: ReasoningQuestionSource;
  topic: string | null;
  bloom_level: number;
  selected_answer: string | null;
  is_correct: boolean | null;
  rationale_text: string;
  ai_verdict?: ReasoningVerdict | null;
  ai_feedback?: string | null;
  ai_model_reasoning?: string | null;
  ai_evaluated_at?: string | null;
}
