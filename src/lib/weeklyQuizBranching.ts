/**
 * Pure logic for the two-phase adaptive weekly quiz (5 standard + 5 adaptive).
 * Mirrors src/lib/diagnosticBranching.ts but scaled to 10 total questions.
 */

export const WQ_STANDARD_COUNT = 5;
export const WQ_ADAPTIVE_COUNT = 5;
export const WQ_TOTAL_COUNT = WQ_STANDARD_COUNT + WQ_ADAPTIVE_COUNT;

export type WqBranchTier = "easy" | "medium" | "hard";
export type WqQuestionTier = "standard" | WqBranchTier;
export type WqLearnerLevel = "beginner" | "developing" | "proficient" | "expert";

/**
 * Branch tier selection from Phase A (standard) correct count out of 5.
 * 0–1 → easy, 2–3 → medium, 4–5 → hard.
 */
export function pickWeeklyBranchTier(standardCorrect: number): WqBranchTier {
  if (standardCorrect <= 1) return "easy";
  if (standardCorrect <= 3) return "medium";
  return "hard";
}

/**
 * Final learner level from full-quiz correct ratio.
 * ≥0.85 expert, ≥0.6 proficient, ≥0.35 developing, else beginner.
 */
export function computeWeeklyLearnerLevel(correct: number, total: number): WqLearnerLevel {
  if (total <= 0) return "beginner";
  const ratio = correct / total;
  if (ratio >= 0.85) return "expert";
  if (ratio >= 0.6) return "proficient";
  if (ratio >= 0.35) return "developing";
  return "beginner";
}
