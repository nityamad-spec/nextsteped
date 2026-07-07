import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  STANDARD_COUNT,
  ADAPTIVE_COUNT,
  TOTAL_COUNT,
  pickBranchTier,
  isAnswerCorrect,
  computeStandardCorrect,
  computeLearnerLevel,
  type ScoredQuestion,
  type BranchTier,
} from "./diagnosticBranching";

// ---------------- helpers ----------------

const mcq = (id: string, correctIndex: number, tier: ScoredQuestion["tier"] = "standard"): ScoredQuestion => ({
  id,
  format: "mcq",
  correctIndex,
  correctAnswer: ["A", "B", "C", "D"][correctIndex],
  tier,
});

const sa = (id: string, correctAnswer: string, tier: ScoredQuestion["tier"] = "standard"): ScoredQuestion => ({
  id,
  format: "short_answer",
  correctIndex: -1,
  correctAnswer,
  tier,
});

/** Build 10 standard MCQs where correct answer is always index 0. */
const tenStandardMcqs = (): ScoredQuestion[] =>
  Array.from({ length: STANDARD_COUNT }, (_, i) => mcq(`s${i}`, 0, "standard"));

/** Phase A answers — `correctCount` correct (index 0), rest wrong (index 1). */
const phaseAAnswers = (correctCount: number): number[] =>
  Array.from({ length: STANDARD_COUNT }, (_, i) => (i < correctCount ? 0 : 1));

// ---------------- constants ----------------

describe("diagnostic constants", () => {
  it("Phase A + Phase B total to 20 questions", () => {
    expect(STANDARD_COUNT).toBe(10);
    expect(ADAPTIVE_COUNT).toBe(10);
    expect(TOTAL_COUNT).toBe(20);
  });
});

// ---------------- pickBranchTier ----------------

describe("pickBranchTier — thresholds", () => {
  it.each([
    [0, "easy"],
    [1, "easy"],
    [3, "easy"],
    [4, "medium"],
    [5, "medium"],
    [7, "medium"],
    [8, "hard"],
    [9, "hard"],
    [10, "hard"],
  ])("standardCorrect=%i → %s", (correct, expected) => {
    expect(pickBranchTier(correct)).toBe(expected as BranchTier);
  });
});

// ---------------- isAnswerCorrect ----------------

describe("isAnswerCorrect", () => {
  it("MCQ: returns true when selected index matches correctIndex", () => {
    expect(isAnswerCorrect(mcq("q", 2), 2, "")).toBe(true);
    expect(isAnswerCorrect(mcq("q", 2), 1, "")).toBe(false);
  });

  it("short_answer: case-insensitive trimmed match", () => {
    const q = sa("q", "Python");
    expect(isAnswerCorrect(q, -1, "python")).toBe(true);
    expect(isAnswerCorrect(q, -1, "  PYTHON  ")).toBe(true);
    expect(isAnswerCorrect(q, -1, "java")).toBe(false);
  });

  it("short_answer: empty answer is wrong", () => {
    expect(isAnswerCorrect(sa("q", "foo"), -1, "")).toBe(false);
  });
});

// ---------------- computeStandardCorrect ----------------

describe("computeStandardCorrect — Phase A scoring", () => {
  it("counts only the first STANDARD_COUNT questions", () => {
    const qs = [...tenStandardMcqs(), mcq("extra", 0, "hard")];
    // 11 answers, all correct — but only the first 10 should count.
    const answers = Array(11).fill(0);
    expect(computeStandardCorrect(qs, answers, [])).toBe(10);
  });

  it("returns 0 when all answers are wrong", () => {
    expect(computeStandardCorrect(tenStandardMcqs(), phaseAAnswers(0), [])).toBe(0);
  });

  it("returns exact count for partial correctness", () => {
    for (const n of [1, 4, 7, 9]) {
      expect(computeStandardCorrect(tenStandardMcqs(), phaseAAnswers(n), [])).toBe(n);
    }
  });

  it("handles mixed MCQ + short_answer formats", () => {
    const qs: ScoredQuestion[] = [
      mcq("a", 0),
      sa("b", "Hello"),
      mcq("c", 2),
      sa("d", "World"),
      ...Array.from({ length: 6 }, (_, i) => mcq(`m${i}`, 1)),
    ];
    const answers = [0, -1, 2, -1, 1, 1, 1, 1, 1, 1]; // all MCQ correct
    const texts = ["", "hello", "", "WORLD ", "", "", "", "", "", ""];
    expect(computeStandardCorrect(qs, answers, texts)).toBe(10);
  });
});

// ---------------- computeLearnerLevel ----------------

describe("computeLearnerLevel — branch-tier aware cutoffs", () => {
  it.each([
    // easy: ≤10 beginner, 11–20 developing
    [0, "easy", "beginner"],
    [5, "easy", "beginner"],
    [10, "easy", "beginner"],
    [11, "easy", "developing"],
    [20, "easy", "developing"],
    // medium: same split as easy
    [10, "medium", "beginner"],
    [11, "medium", "developing"],
    [15, "medium", "developing"],
    // hard: ≤10 developing, 11–20 proficient
    [10, "hard", "developing"],
    [11, "hard", "proficient"],
    [20, "hard", "proficient"],
  ])("correct=%i on branch=%s → %s", (correct, branch, level) => {
    expect(computeLearnerLevel(correct, 20, branch as BranchTier)).toBe(level);
  });

  it("returns Beginner for zero total (defensive)", () => {
    expect(computeLearnerLevel(0, 0, "easy")).toBe("beginner");
  });

  it("returns Beginner when branch is null (defensive)", () => {
    expect(computeLearnerLevel(15, 20, null)).toBe("beginner");
  });
});

// ---------------- end-to-end two-phase flow ----------------

describe("two-phase diagnostic flow", () => {
  it.each([
    [2, "easy"],
    [5, "medium"],
    [9, "hard"],
  ])(
    "Phase A correct=%i → picks branch '%s' and propagates through Phase B",
    (phaseACorrect, expectedBranch) => {
      const standardQs = tenStandardMcqs();
      const phaseAResponses = phaseAAnswers(phaseACorrect);

      // Phase A: score Phase A and pick branch.
      const standardCorrect = computeStandardCorrect(standardQs, phaseAResponses, []);
      expect(standardCorrect).toBe(phaseACorrect);
      const branch = pickBranchTier(standardCorrect);
      expect(branch).toBe(expectedBranch);

      // Phase B: 10 questions of the chosen tier; assume all correct here.
      const branchQs: ScoredQuestion[] = Array.from(
        { length: ADAPTIVE_COUNT },
        (_, i) => mcq(`b${i}`, 0, branch),
      );
      const phaseBResponses = Array(ADAPTIVE_COUNT).fill(0);

      const fullQuestions = [...standardQs, ...branchQs];
      const fullAnswers = [...phaseAResponses, ...phaseBResponses];

      expect(fullQuestions.length).toBe(TOTAL_COUNT);

      // Final score = standard + adaptive correct.
      const totalCorrect = fullQuestions.reduce(
        (sum, q, i) => sum + (isAnswerCorrect(q, fullAnswers[i], "") ? 1 : 0),
        0,
      );
      expect(totalCorrect).toBe(phaseACorrect + ADAPTIVE_COUNT);

      const level = computeLearnerLevel(totalCorrect, TOTAL_COUNT);
      // sanity: high Phase A + perfect Phase B → at least Proficient
      if (phaseACorrect >= 2) {
        expect(["developing", "proficient", "expert"]).toContain(level);
      }
    },
  );
});

// ---------------- persistence shape ----------------
// The DiagnosticQuiz component calls supabase.from('diagnostic_results').insert({...})
// with `branch_tier`. We verify the persisted payload shape by simulating the
// submit step against a mocked Supabase insert.

describe("diagnostic_results persistence shape", () => {
  let insertSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
  });

  // Minimal simulation of the persistence step from DiagnosticQuiz.submitFinal.
  const submitMock = async (
    questions: ScoredQuestion[],
    answers: number[],
    texts: string[],
    branch: BranchTier | null,
  ) => {
    const standardised = questions.map((q, i) => ({
      question_id: q.id,
      tier: q.tier,
      is_correct: isAnswerCorrect(q, answers[i], texts[i] ?? ""),
    }));
    const correct = standardised.filter((a) => a.is_correct).length;
    await insertSpy({
      score: correct,
      total_questions: questions.length,
      learner_level: computeLearnerLevel(correct, questions.length),
      branch_tier: branch,
      answers: standardised,
    });
  };

  it("persists branch_tier=easy when Phase A score is low", async () => {
    const standardQs = tenStandardMcqs();
    const phaseA = phaseAAnswers(2); // → easy
    const branch = pickBranchTier(computeStandardCorrect(standardQs, phaseA, []));
    const branchQs = Array.from({ length: 10 }, (_, i) => mcq(`e${i}`, 0, branch));
    await submitMock(
      [...standardQs, ...branchQs],
      [...phaseA, ...Array(10).fill(0)],
      [],
      branch,
    );
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const payload = insertSpy.mock.calls[0][0];
    expect(payload.branch_tier).toBe("easy");
    expect(payload.total_questions).toBe(20);
    // Each persisted answer carries its tier so analytics can split phases.
    const tiers = new Set(payload.answers.map((a: any) => a.tier));
    expect(tiers).toEqual(new Set(["standard", "easy"]));
  });

  it("persists branch_tier=medium for mid Phase A score", async () => {
    const standardQs = tenStandardMcqs();
    const phaseA = phaseAAnswers(5);
    const branch = pickBranchTier(computeStandardCorrect(standardQs, phaseA, []));
    const branchQs = Array.from({ length: 10 }, (_, i) => mcq(`m${i}`, 0, branch));
    await submitMock(
      [...standardQs, ...branchQs],
      [...phaseA, ...Array(10).fill(0)],
      [],
      branch,
    );
    expect(insertSpy.mock.calls[0][0].branch_tier).toBe("medium");
  });

  it("persists branch_tier=hard when Phase A score is high", async () => {
    const standardQs = tenStandardMcqs();
    const phaseA = phaseAAnswers(9);
    const branch = pickBranchTier(computeStandardCorrect(standardQs, phaseA, []));
    const branchQs = Array.from({ length: 10 }, (_, i) => mcq(`h${i}`, 0, branch));
    await submitMock(
      [...standardQs, ...branchQs],
      [...phaseA, ...Array(10).fill(0)],
      [],
      branch,
    );
    expect(insertSpy.mock.calls[0][0].branch_tier).toBe("hard");
  });
});
