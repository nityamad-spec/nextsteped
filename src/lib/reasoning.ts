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
 * changes, so a 100% ceiling stays a 100% ceiling.
 *
 * The math itself lives in the shared scoring module so edge functions and the
 * browser cannot drift; it is re-exported here for existing importers.
 * ──────────────────────────────────────────────────────────────────────────── */

export {
  REASONING_SCORING_ENABLED,
  REASONING_PARTIAL_FACTOR,
  reasoningEarnedFactor,
} from "@/lib/masteryScoring";


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
