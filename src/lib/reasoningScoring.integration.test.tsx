import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useReasoningAnswers } from "@/hooks/useReasoningAnswers";
import { buildReasoningRows } from "@/lib/buildReasoningRows";
import { computeWeeklyQuizScore, type ScoreItem } from "@/lib/masteryScoring";
import { verdictFor, type ReasoningEvaluation } from "@/lib/reasoning";

// ---- Mocks -----------------------------------------------------------------

const invokeMock = vi.fn();
const insertMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    from: () => ({ insert: (rows: unknown) => insertMock(rows) }),
  },
}));

const VALID = "Because the loop invariant holds on every iteration.";
const EDITED = "Actually it halves the search space each comparison.";

function input(overrides: Record<string, unknown> = {}) {
  return {
    questionId: "q1",
    questionText: "Why does binary search run in log n?",
    options: ["A", "B", "C", "D"],
    correctAnswer: "B",
    selectedAnswer: "B",
    topic: "Complexity",
    bloom: 4,
    courseId: "course-1",
    ...overrides,
  };
}

function verdictPayload(verdict: "accepted" | "rejected", qid = "q1") {
  return {
    data: {
      results: [
        { question_id: qid, verdict, feedback: "fb", model_reasoning: "mr" },
      ],
    },
    error: null,
  };
}

function rowArgs(
  rationales: Record<string, string>,
  evaluations: Record<string, ReasoningEvaluation> | undefined,
  bloomFor: (id: string) => number,
) {
  return {
    studentId: "s1",
    courseId: "c1",
    sourceFormat: "weekly_quiz" as const,
    questionSource: "assessment_questions" as const,
    sourceResultId: "r1",
    answers: [{ question_id: "q1", topic: "Complexity", selected: "B", is_correct: true }],
    rationales,
    bloomFor,
    evaluations,
  };
}

const done = (
  verdict: "accepted" | "rejected" | null,
  evaluatedText: string,
): ReasoningEvaluation => ({
  status: verdict ? "done" : "unevaluated",
  verdict,
  feedback: "fb",
  modelReasoning: "mr",
  evaluatedText,
});

beforeEach(() => {
  invokeMock.mockReset();
  insertMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- 1. Late submits -------------------------------------------------------

describe("late verdicts (evaluation lands after the submit deadline)", () => {
  it("submission is not blocked and the rationale row is still persisted", async () => {
    let release: (v: unknown) => void = () => {};
    invokeMock.mockImplementation(
      () => new Promise((res) => { release = () => res(verdictPayload("accepted")); }),
    );

    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));

    const started = Date.now();
    await act(async () => {
      await result.current.flushAndWait([input()], 60);
    });
    expect(Date.now() - started).toBeLessThan(1500);

    // No verdict at submit time → treated as "no verdict".
    const evals = result.current.getEvaluations();
    expect(verdictFor(evals, "q1")).toBeNull();

    const rows = buildReasoningRows(rowArgs({ q1: VALID }, evals, () => 4));
    expect(rows).toHaveLength(1);
    expect(rows[0].rationale_text).toBe(VALID);
    expect(rows[0].ai_verdict).toBeNull();

    // The late verdict eventually resolves without throwing.
    await act(async () => { release(null); });
    await waitFor(() => expect(result.current.getEvaluations().q1.status).toBe("done"));
  });

  it("a missing verdict never costs the student points", () => {
    const item: ScoreItem = { difficulty: 0.6, bloom: 4, is_correct: true, time_ms: 0 };
    const withVerdict = computeWeeklyQuizScore([{ ...item, verdict: "accepted" }]);
    const noVerdict = computeWeeklyQuizScore([{ ...item, verdict: null }]);
    expect(noVerdict.accuracyScore).toBeCloseTo(withVerdict.accuracyScore, 6);
    expect(noVerdict.reasoningAdjustment).toBe(0);
  });
});

// ---- 2. Persisted rationale without pressing Next ---------------------------

describe("rationale typed on the last question (never advanced past)", () => {
  it("flushAndWait evaluates it and the verdict reaches the row and the score", async () => {
    invokeMock.mockResolvedValue(verdictPayload("rejected"));

    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    // No evaluate() call — the student never pressed Next.
    expect(result.current.getEvaluations().q1).toBeUndefined();

    await act(async () => {
      await result.current.flushAndWait([input()], 5000);
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const evals = result.current.getEvaluations();
    expect(verdictFor(evals, "q1")).toBe("rejected");

    const rows = buildReasoningRows(rowArgs({ q1: VALID }, evals, () => 4));
    expect(rows[0].ai_verdict).toBe("rejected");

    const scored = computeWeeklyQuizScore([
      { difficulty: 0.6, bloom: 4, is_correct: true, time_ms: 0, verdict: "rejected" },
    ]);
    expect(scored.accuracyScore).toBeLessThan(1);
    expect(scored.reasoningAdjustment).toBeLessThan(0);
  });

  it("persists the rationale even when the flushed evaluation fails outright", async () => {
    invokeMock.mockRejectedValue(new Error("gateway down"));

    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    await act(async () => {
      await result.current.flushAndWait([input()], 5000);
    });

    const evals = result.current.getEvaluations();
    expect(evals.q1.status).toBe("unevaluated");
    const rows = buildReasoningRows(rowArgs({ q1: VALID }, evals, () => 4));
    expect(rows).toHaveLength(1);
    expect(rows[0].ai_verdict).toBeNull();
  });

  it("does not flush a rationale that is still too short", async () => {
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", "nope"));
    await act(async () => {
      await result.current.flushAndWait([input()], 1000);
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

// ---- 3. Conflicting verdicts ------------------------------------------------

describe("conflicting verdicts", () => {
  it("drops a verdict produced for superseded rationale text but keeps the row", () => {
    const evals = { q1: done("accepted", VALID) };
    const rows = buildReasoningRows(rowArgs({ q1: EDITED }, evals, () => 4));
    expect(rows).toHaveLength(1);
    expect(rows[0].rationale_text).toBe(EDITED);
    expect(rows[0].ai_verdict).toBeNull();
    expect(rows[0].ai_feedback).toBeNull();
    expect(rows[0].ai_evaluated_at).toBeNull();
  });

  it("re-evaluating edited text replaces the stale verdict", async () => {
    invokeMock
      .mockResolvedValueOnce(verdictPayload("rejected"))
      .mockResolvedValueOnce(verdictPayload("accepted"));

    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    await act(async () => { await result.current.flushAndWait([input()], 5000); });
    expect(verdictFor(result.current.getEvaluations(), "q1")).toBe("rejected");

    act(() => result.current.setRationale("q1", EDITED));
    await act(async () => { await result.current.flushAndWait([input()], 5000); });

    const evals = result.current.getEvaluations();
    expect(evals.q1.evaluatedText).toBe(EDITED);
    expect(verdictFor(evals, "q1")).toBe("accepted");
    const rows = buildReasoningRows(rowArgs({ q1: EDITED }, evals, () => 4));
    expect(rows[0].ai_verdict).toBe("accepted");
  });

  it("scoring ordering is stable across conflicting verdicts", () => {
    const base = { difficulty: 0.8, bloom: 4, time_ms: 0 };
    const s = (is_correct: boolean, verdict: "accepted" | "rejected" | null) =>
      computeWeeklyQuizScore([{ ...base, is_correct, verdict } as ScoreItem]).accuracyScore;

    expect(s(true, "accepted")).toBeGreaterThan(s(true, "rejected"));
    // correct+rejected and incorrect+accepted intentionally share the
    // Bloom-2 partial-credit weight, so they tie rather than invert.
    expect(s(true, "rejected")).toBeGreaterThanOrEqual(s(false, "accepted"));
    expect(s(false, "accepted")).toBeGreaterThan(s(false, "rejected"));
    expect(s(false, "rejected")).toBe(0);
  });
});

// ---- 4. NaN / unknown bloom_level ------------------------------------------

describe("unknown or NaN bloom level", () => {
  it.each([
    ["NaN", NaN],
    ["undefined", undefined as unknown as number],
    ["non-numeric", "abc" as unknown as number],
    ["null", null as unknown as number],
  ])("preserves the rationale row when bloomFor returns %s", (_label, value) => {
    const evals = { q1: done("accepted", VALID) };
    const rows = buildReasoningRows(rowArgs({ q1: VALID }, evals, () => value));
    expect(rows).toHaveLength(1);
    expect(rows[0].bloom_level).toBe(3);
    expect(rows[0].ai_verdict).toBe("accepted");
  });

  it("still skips an unknown-bloom question with no usable rationale", () => {
    const rows = buildReasoningRows(rowArgs({ q1: "eh" }, undefined, () => NaN));
    expect(rows).toHaveLength(0);
  });

  it("still skips a genuine Bloom 1-2 question that carries stray text", () => {
    const rows = buildReasoningRows(rowArgs({ q1: VALID }, undefined, () => 2));
    expect(rows).toHaveLength(0);
  });

  it("scoring applies the verdict when bloom is NaN but a verdict exists", () => {
    const nanRejected = computeWeeklyQuizScore([
      { difficulty: 0.8, bloom: NaN, is_correct: true, time_ms: 0, verdict: "rejected" },
    ]);
    const nanAccepted = computeWeeklyQuizScore([
      { difficulty: 0.8, bloom: NaN, is_correct: true, time_ms: 0, verdict: "accepted" },
    ]);
    expect(nanAccepted.accuracyScore).toBeCloseTo(1, 6);
    expect(nanRejected.accuracyScore).toBeLessThan(1);
    expect(nanRejected.reasoningAdjustment).toBeLessThan(0);
    expect(Number.isFinite(nanRejected.displayScore)).toBe(true);
  });

  it("unknown bloom without a verdict scores exactly as before (no NaN leak)", () => {
    const r = computeWeeklyQuizScore([
      { difficulty: 0.5, bloom: NaN, is_correct: true, time_ms: 0 },
      { difficulty: 0.5, bloom: NaN, is_correct: false, time_ms: 0 },
    ]);
    expect(Number.isFinite(r.displayScore)).toBe(true);
    expect(r.accuracyScore).toBeCloseTo(0.5, 6);
    expect(r.reasoningAdjustment).toBe(0);
  });
});
