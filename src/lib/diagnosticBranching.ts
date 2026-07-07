/**
 * Pure logic for the two-phase adaptive diagnostic quiz.
 * Phase A: 10 "standard" tier questions.
 * Phase B: 10 adaptive questions from a tier chosen by Phase A score.
 *
 * Extracted from DiagnosticQuiz.tsx for testability.
 */

export const STANDARD_COUNT = 10;
export const ADAPTIVE_COUNT = 10;
export const TOTAL_COUNT = STANDARD_COUNT + ADAPTIVE_COUNT;

export type BranchTier = "easy" | "medium" | "hard";
export type QuestionTier = "standard" | BranchTier;
export type LearnerLevel = "beginner" | "developing" | "proficient";

export interface ScoredQuestion {
  id: string;
  format: "mcq" | "true_false" | "short_answer";
  correctIndex: number;
  correctAnswer: string;
  tier: QuestionTier;
}

/**
 * Branch tier selection from Phase A (standard) correct count out of 10.
 * <4 → easy, 4–7 → medium, ≥8 → hard.
 */
export function pickBranchTier(standardCorrect: number): BranchTier {
  if (standardCorrect < 4) return "easy";
  if (standardCorrect < 8) return "medium";
  return "hard";
}

/**
 * Check whether a single answer is correct.
 * Short answer = case-insensitive trimmed string match.
 * MCQ / true_false = selected option index matches correctIndex.
 */
export function isAnswerCorrect(
  q: ScoredQuestion,
  selectedIndex: number,
  textAnswer: string,
): boolean {
  if (q.format === "short_answer") {
    return textAnswer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
  }
  return selectedIndex === q.correctIndex;
}

/**
 * Score the standard (Phase A) section of a quiz.
 * Considers only the first STANDARD_COUNT questions.
 */
export function computeStandardCorrect(
  questions: ScoredQuestion[],
  answers: number[],
  textAnswers: string[],
): number {
  let correct = 0;
  for (let i = 0; i < Math.min(STANDARD_COUNT, questions.length); i++) {
    if (isAnswerCorrect(questions[i], answers[i], textAnswers[i] ?? "")) {
      correct += 1;
    }
  }
  return correct;
}

/**
 * Final learner level from Phase A branch tier and total correct out of 20.
 * easy/medium: ≤10 → beginner, else developing.
 * hard: ≤10 → developing, else proficient.
 * `total` is retained for signature stability but does not affect banding.
 */
export function computeLearnerLevel(
  correct: number,
  total: number,
  branch: BranchTier | null,
): LearnerLevel {
  if (total <= 0 || !branch) return "beginner";
  if (branch === "hard") {
    return correct <= 10 ? "developing" : "proficient";
  }
  // easy or medium
  return correct <= 10 ? "beginner" : "developing";
}
