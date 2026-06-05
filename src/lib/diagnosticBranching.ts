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
export type LearnerLevel = "beginner" | "developing" | "proficient" | "expert";

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
 * Final learner level from full-quiz correct ratio.
 * ≥0.85 Expert, ≥0.60 Proficient, ≥0.35 Progressing, else Beginner.
 */
export function computeLearnerLevel(correct: number, total: number): LearnerLevel {
  if (total <= 0) return "Beginner";
  const ratio = correct / total;
  if (ratio >= 0.85) return "Expert";
  if (ratio >= 0.6) return "Proficient";
  if (ratio >= 0.35) return "Progressing";
  return "Beginner";
}
