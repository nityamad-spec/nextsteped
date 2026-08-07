import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useReasoningAnswers, saveReasoningRows } from "./useReasoningAnswers";
import type { ReasoningRow } from "@/lib/reasoning";

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
const SHORT = "dunno";

function baseInput(overrides: Record<string, unknown> = {}) {
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

function ok(verdict: "accepted" | "rejected" = "accepted", qid = "q1") {
  return {
    data: {
      results: [
        {
          question_id: qid,
          verdict,
          feedback: "Nice reasoning.",
          model_reasoning: "The search space halves each step.",
        },
      ],
    },
    error: null,
  };
}

beforeEach(() => {
  invokeMock.mockReset();
  insertMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- Gating ----------------------------------------------------------------

describe("useReasoningAnswers — mandatory-input gating", () => {
  it("blocks a Bloom 3+ question until the rationale reaches the minimum length", () => {
    const { result } = renderHook(() => useReasoningAnswers());

    expect(result.current.isQuestionBlocked({ id: "q1", bloom: 3 })).toBe(true);

    act(() => result.current.setRationale("q1", SHORT));
    expect(result.current.isQuestionBlocked({ id: "q1", bloom: 3 })).toBe(true);

    act(() => result.current.setRationale("q1", VALID));
    expect(result.current.isQuestionBlocked({ id: "q1", bloom: 3 })).toBe(false);
  });

  it("never blocks Bloom 1-2 questions and ignores undefined questions", () => {
    const { result } = renderHook(() => useReasoningAnswers());
    expect(result.current.isQuestionBlocked({ id: "q1", bloom: 1 })).toBe(false);
    expect(result.current.isQuestionBlocked({ id: "q2", bloom: 2 })).toBe(false);
    expect(result.current.isQuestionBlocked(undefined)).toBe(false);
  });

  it("treats whitespace-only text as missing", () => {
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", "                    "));
    expect(result.current.missingReasoning([{ id: "q1", bloom: 5 }])).toEqual(["q1"]);
  });

  it("missingReasoning lists only unsatisfied Bloom 3+ questions", () => {
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q2", VALID));
    const missing = result.current.missingReasoning([
      { id: "q1", bloom: 3 },
      { id: "q2", bloom: 4 },
      { id: "q3", bloom: 2 },
    ]);
    expect(missing).toEqual(["q1"]);
  });
});

// ---- Evaluation triggering -------------------------------------------------

describe("useReasoningAnswers — evaluation triggering", () => {
  it("does not call the model for Bloom 1-2 questions", () => {
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput({ bloom: 2 })));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("does not call the model when the rationale is too short", () => {
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", SHORT));
    act(() => result.current.evaluate(baseInput()));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("stores an accepted verdict and the model feedback", async () => {
    invokeMock.mockResolvedValue(ok("accepted"));
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));

    expect(result.current.evaluations.q1.status).toBe("pending");
    await waitFor(() => expect(result.current.evaluations.q1.status).toBe("done"));
    expect(result.current.evaluations.q1.verdict).toBe("accepted");
    expect(result.current.evaluations.q1.feedback).toBe("Nice reasoning.");
    expect(result.current.evaluations.q1.evaluatedText).toBe(VALID);
  });

  it("stores a rejected verdict the same way", async () => {
    invokeMock.mockResolvedValue(ok("rejected"));
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));
    await waitFor(() => expect(result.current.evaluations.q1.verdict).toBe("rejected"));
  });

  it("sends the trimmed rationale and a clamped bloom level to the function", async () => {
    invokeMock.mockResolvedValue(ok());
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", `   ${VALID}   `));
    act(() => result.current.evaluate(baseInput({ bloom: 99 })));
    await waitFor(() => expect(result.current.evaluations.q1.status).toBe("done"));

    const body = invokeMock.mock.calls[0][1].body;
    expect(body.items[0].rationale_text).toBe(VALID);
    expect(body.items[0].bloom_level).toBe(6);
    expect(body.course_id).toBe("course-1");
  });

  it("de-duplicates a repeat evaluation of unchanged text", async () => {
    invokeMock.mockResolvedValue(ok());
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));
    await waitFor(() => expect(result.current.evaluations.q1.status).toBe("done"));

    act(() => result.current.evaluate(baseInput()));
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("re-evaluates when the student edits the rationale", async () => {
    invokeMock.mockResolvedValue(ok());
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));
    await waitFor(() => expect(result.current.evaluations.q1.status).toBe("done"));

    act(() => result.current.setRationale("q1", `${VALID} And the array stays sorted.`));
    act(() => result.current.evaluate(baseInput()));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
  });

  it("keeps evaluations for different questions independent", async () => {
    invokeMock.mockImplementation((_name: string, opts: any) => {
      const qid = opts.body.items[0].question_id;
      return Promise.resolve(ok(qid === "q1" ? "accepted" : "rejected", qid));
    });
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => {
      result.current.setRationale("q1", VALID);
      result.current.setRationale("q2", `${VALID} second`);
    });
    act(() => {
      result.current.evaluate(baseInput());
      result.current.evaluate(baseInput({ questionId: "q2" }));
    });
    await waitFor(() => {
      expect(result.current.evaluations.q1.verdict).toBe("accepted");
      expect(result.current.evaluations.q2.verdict).toBe("rejected");
    });
  });
});

// ---- Failure handling ------------------------------------------------------

describe("useReasoningAnswers — failure handling", () => {
  it("retries once and succeeds on the second attempt", async () => {
    invokeMock
      .mockResolvedValueOnce({ data: null, error: new Error("boom") })
      .mockResolvedValueOnce(ok());
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));

    await waitFor(
      () => expect(result.current.evaluations.q1.status).toBe("done"),
      { timeout: 3000 },
    );
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("marks the question unevaluated after both attempts fail", async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error("boom") });
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));

    await waitFor(
      () => expect(result.current.evaluations.q1.status).toBe("unevaluated"),
      { timeout: 3000 },
    );
    expect(result.current.evaluations.q1.verdict).toBeNull();
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("marks unevaluated when the model returns no usable verdict", async () => {
    invokeMock.mockResolvedValue({
      data: { results: [{ question_id: "q1", verdict: null }] },
      error: null,
    });
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));

    await waitFor(
      () => expect(result.current.evaluations.q1.status).toBe("unevaluated"),
      { timeout: 3000 },
    );
  });

  it("survives a thrown (rejected) invoke without crashing", async () => {
    invokeMock.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));

    await waitFor(
      () => expect(result.current.evaluations.q1.status).toBe("unevaluated"),
      { timeout: 3000 },
    );
  });

  it("allows a retry after an unevaluated result", async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error("boom") });
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));
    await waitFor(
      () => expect(result.current.evaluations.q1.status).toBe("unevaluated"),
      { timeout: 3000 },
    );

    invokeMock.mockResolvedValue(ok());
    act(() => result.current.evaluate(baseInput()));
    await waitFor(() => expect(result.current.evaluations.q1.status).toBe("done"));
  });
});

// ---- Submission synchronisation -------------------------------------------

describe("useReasoningAnswers — waitForPending", () => {
  it("resolves immediately when nothing is in flight", async () => {
    const { result } = renderHook(() => useReasoningAnswers());
    const start = Date.now();
    await act(async () => {
      await result.current.waitForPending(5000);
    });
    expect(Date.now() - start).toBeLessThan(200);
  });

  it("waits for an in-flight evaluation to settle", async () => {
    let release: (v: unknown) => void = () => {};
    invokeMock.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve(ok()); }),
    );
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));

    let settled = false;
    const waiter = act(async () => {
      await result.current.waitForPending(5000);
      settled = true;
    });
    expect(settled).toBe(false);
    act(() => release(null));
    await waiter;
    expect(settled).toBe(true);
    expect(result.current.evaluations.q1.status).toBe("done");
  });

  it("gives up at the deadline when the model never answers", async () => {
    invokeMock.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));

    const start = Date.now();
    await act(async () => {
      await result.current.waitForPending(300);
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(1500);
    expect(result.current.evaluations.q1.status).toBe("pending");
  });

  it("tracks pending state and clears it once settled", async () => {
    invokeMock.mockResolvedValue(ok());
    const { result } = renderHook(() => useReasoningAnswers());
    expect(result.current.hasPendingEvaluations()).toBe(false);
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));
    expect(result.current.hasPendingEvaluations()).toBe(true);
    await act(async () => {
      await result.current.waitForPending(5000);
    });
    expect(result.current.hasPendingEvaluations()).toBe(false);
  });

  it("getEvaluations returns the latest verdicts from an async closure", async () => {
    invokeMock.mockResolvedValue(ok());
    const { result } = renderHook(() => useReasoningAnswers());
    const read = result.current.getEvaluations;
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));
    await act(async () => {
      await result.current.waitForPending(5000);
    });
    expect(read().q1.verdict).toBe("accepted");
  });

  it("reset clears rationales, verdicts and pending work", async () => {
    invokeMock.mockResolvedValue(ok());
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));
    await act(async () => {
      await result.current.waitForPending(5000);
    });

    act(() => result.current.reset());
    expect(result.current.rationales).toEqual({});
    expect(result.current.evaluations).toEqual({});
    expect(result.current.hasPendingEvaluations()).toBe(false);
  });
});

// ---- Persistence -----------------------------------------------------------

describe("saveReasoningRows", () => {
  const row: ReasoningRow = {
    student_id: "s1",
    course_id: "c1",
    source_format: "weekly_quiz",
    source_result_id: "r1",
    question_id: "q1",
    question_source: "assessment_questions",
    topic: "Loops",
    bloom_level: 4,
    selected_answer: "B",
    is_correct: true,
    rationale_text: VALID,
  };

  it("skips the network call when there is nothing to save", async () => {
    await expect(saveReasoningRows([])).resolves.toBe(true);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns true on a successful insert", async () => {
    insertMock.mockResolvedValue({ error: null });
    await expect(saveReasoningRows([row])).resolves.toBe(true);
    expect(insertMock).toHaveBeenCalledWith([row]);
  });

  it("returns false instead of throwing when the insert fails", async () => {
    insertMock.mockResolvedValue({ error: { message: "rls" } });
    await expect(saveReasoningRows([row])).resolves.toBe(false);
  });
});

describe("useReasoningAnswers — interruptible retry backoff", () => {
  it("wakes the retry backoff immediately when submission signals a flush", async () => {
    // First call fails, second succeeds. Without an interruptible backoff the
    // retry would idle behind a fixed sleep while the student waits.
    invokeMock
      .mockRejectedValueOnce(new Error("gateway 503"))
      .mockResolvedValueOnce(ok());

    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    const started = Date.now();
    await act(async () => {
      await result.current.waitForPending(8000);
    });
    const elapsed = Date.now() - started;

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(result.current.getEvaluations().q1.status).toBe("done");
    // The 400-800ms backoff must have been aborted, not waited out.
    expect(elapsed).toBeLessThan(300);
  });

  it("still resolves as unevaluated when both attempts fail", async () => {
    invokeMock.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));

    await act(async () => {
      await result.current.waitForPending(8000);
    });

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(result.current.getEvaluations().q1.status).toBe("unevaluated");
  });

  it("restores normal backoff after reset", async () => {
    invokeMock.mockResolvedValue(ok());
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    await act(async () => {
      await result.current.waitForPending(8000);
    });
    act(() => result.current.reset());
    expect(result.current.hasPendingEvaluations()).toBe(false);
    expect(result.current.getEvaluations()).toEqual({});
  });
});

describe("useReasoningAnswers — flushAndWait", () => {
  it("evaluates a rationale that was typed but never advanced past", async () => {
    invokeMock.mockResolvedValue(ok("accepted", "qLast"));
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("qLast", VALID));

    // No evaluate() call — mimics the last question at submit time.
    expect(result.current.hasPendingEvaluations()).toBe(false);

    await act(async () => {
      await result.current.flushAndWait(
        [baseInput({ questionId: "qLast" })],
        8000,
      );
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(result.current.getEvaluations().qLast.verdict).toBe("accepted");
  });

  it("skips Bloom 1-2 questions and incomplete rationales", async () => {
    invokeMock.mockResolvedValue(ok());
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => {
      result.current.setRationale("qLow", VALID);
      result.current.setRationale("qShort", SHORT);
    });

    await act(async () => {
      await result.current.flushAndWait(
        [
          baseInput({ questionId: "qLow", bloom: 2 }),
          baseInput({ questionId: "qShort", bloom: 5 }),
        ],
        8000,
      );
    });

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("does not re-evaluate a question already evaluated for the same text", async () => {
    invokeMock.mockResolvedValue(ok());
    const { result } = renderHook(() => useReasoningAnswers());
    act(() => result.current.setRationale("q1", VALID));
    act(() => result.current.evaluate(baseInput()));
    await waitFor(() =>
      expect(result.current.getEvaluations().q1?.status).toBe("done"),
    );

    await act(async () => {
      await result.current.flushAndWait([baseInput()], 8000);
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("tolerates an empty or missing input list", async () => {
    const { result } = renderHook(() => useReasoningAnswers());
    await act(async () => {
      await result.current.flushAndWait([], 8000);
      await result.current.flushAndWait(
        undefined as unknown as Parameters<typeof result.current.flushAndWait>[0],
        8000,
      );
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
