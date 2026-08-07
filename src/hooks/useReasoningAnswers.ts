import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isReasoningComplete,
  requiresReasoning,
  type ReasoningEvaluation,
  type ReasoningRow,
  type ReasoningVerdict,
} from "@/lib/reasoning";

export interface ReasoningQuestionRef {
  id: string;
  bloom: number;
}

/** Everything the model needs to judge one rationale. */
export interface ReasoningEvalInput {
  questionId: string;
  questionText: string;
  options?: string[];
  correctAnswer?: string;
  selectedAnswer?: string | null;
  topic?: string | null;
  bloom: number;
  courseId?: string | null;
}

interface GatewayResult {
  question_id: string;
  verdict: ReasoningVerdict | null;
  feedback?: string;
  model_reasoning?: string;
}

async function callEvaluate(
  input: ReasoningEvalInput,
  text: string,
): Promise<GatewayResult | null> {
  const { data, error } = await supabase.functions.invoke("evaluate-reasoning", {
    body: {
      course_id: input.courseId ?? null,
      items: [
        {
          question_id: input.questionId,
          question_text: input.questionText,
          options: input.options,
          correct_answer: input.correctAnswer ?? "",
          selected_answer: input.selectedAnswer ?? null,
          topic: input.topic ?? null,
          bloom_level: Math.min(6, Math.max(1, Math.round(input.bloom || 1))),
          rationale_text: text,
        },
      ],
    },
  });
  if (error) throw error;
  const results = (data as { results?: GatewayResult[] } | null)?.results;
  return results?.[0] ?? null;
}

/**
 * Holds the per-question rationale text for an in-progress assessment, the AI
 * evaluation of each rationale, and the mandatory-input gating helpers used by
 * every testing surface.
 *
 * Evaluation is fired in the background when the student advances; it never
 * blocks navigation and never fails an attempt.
 */
export function useReasoningAnswers() {
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [evaluations, setEvaluations] = useState<Record<string, ReasoningEvaluation>>({});
  const rationalesRef = useRef<Record<string, string>>({});
  const evaluationsRef = useRef<Record<string, ReasoningEvaluation>>({});
  const pendingRef = useRef<Map<string, Promise<void>>>(new Map());
  // "Wake now" broadcast: set when the student submits, so any in-progress
  // retry backoff aborts its sleep instead of burning the submit deadline.
  const flushRef = useRef<{ signalled: boolean; wakers: Set<() => void> }>({
    signalled: false,
    wakers: new Set(),
  });

  const signalFlush = useCallback(() => {
    flushRef.current.signalled = true;
    for (const wake of Array.from(flushRef.current.wakers)) wake();
    flushRef.current.wakers.clear();
  }, []);

  /** Jittered backoff that resolves early once a flush is signalled. */
  const interruptibleBackoff = useCallback(async () => {
    if (flushRef.current.signalled) return;
    const delay = 400 + Math.floor(Math.random() * 400);
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        flushRef.current.wakers.delete(finish);
        resolve();
      };
      const timer = setTimeout(finish, delay);
      flushRef.current.wakers.add(finish);
    });
  }, []);

  const writeEvaluation = useCallback((qid: string, next: ReasoningEvaluation) => {
    evaluationsRef.current = { ...evaluationsRef.current, [qid]: next };
    setEvaluations(evaluationsRef.current);
  }, []);

  const setRationale = useCallback((questionId: string, text: string) => {
    rationalesRef.current = { ...rationalesRef.current, [questionId]: text };
    setRationales(rationalesRef.current);
  }, []);

  const reset = useCallback(() => {
    rationalesRef.current = {};
    evaluationsRef.current = {};
    pendingRef.current.clear();
    flushRef.current.signalled = false;
    flushRef.current.wakers.clear();
    setRationales({});
    setEvaluations({});
    setShowErrors(false);
  }, []);

  /**
   * Fire an AI evaluation for one question. De-duplicates on unchanged text and
   * retries once before giving up as "unevaluated". Returns immediately.
   */
  const evaluate = useCallback(
    (input: ReasoningEvalInput) => {
      const qid = input.questionId;
      const text = (rationalesRef.current[qid] ?? "").trim();
      if (!requiresReasoning(input.bloom) || !isReasoningComplete(text)) return;

      const existing = evaluationsRef.current[qid];
      if (existing && existing.evaluatedText === text && existing.status !== "unevaluated") {
        return;
      }
      if (pendingRef.current.has(qid) && existing?.evaluatedText === text) return;

      writeEvaluation(qid, {
        status: "pending",
        verdict: null,
        feedback: "",
        modelReasoning: "",
        evaluatedText: text,
      });

      const run = (async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const result = await callEvaluate(input, text);
            if (result?.verdict) {
              writeEvaluation(qid, {
                status: "done",
                verdict: result.verdict,
                feedback: result.feedback ?? "",
                modelReasoning: result.model_reasoning ?? "",
                evaluatedText: text,
              });
              return;
            }
          } catch (e) {
            console.error("Reasoning evaluation failed:", e);
          }
          if (attempt === 0) await interruptibleBackoff();
        }
        writeEvaluation(qid, {
          status: "unevaluated",
          verdict: null,
          feedback: "",
          modelReasoning: "",
          evaluatedText: text,
        });
      })().finally(() => {
        pendingRef.current.delete(qid);
      });

      pendingRef.current.set(qid, run);
    },
    [writeEvaluation, interruptibleBackoff],
  );

  /**
   * Resolve when all in-flight evaluations settle, or when the deadline passes —
   * whichever comes first. Never rejects: submission must not be blockable.
   * Signals a flush first so any retry backoff wakes immediately.
   */
  const waitForPending = useCallback(
    async (deadlineMs: number) => {
      signalFlush();
      const inFlight = Array.from(pendingRef.current.values());
      if (inFlight.length === 0) return;
      await Promise.race([
        Promise.allSettled(inFlight),
        new Promise((resolve) => setTimeout(resolve, deadlineMs)),
      ]);
    },
    [signalFlush],
  );

  /**
   * Submission entry point: evaluate anything the student never advanced past
   * (the last question is typically never "Next"-ed), then wait for the batch.
   */
  const flushAndWait = useCallback(
    async (inputs: ReasoningEvalInput[], deadlineMs: number) => {
      for (const input of inputs ?? []) {
        if (requiresReasoning(input.bloom)) evaluate(input);
      }
      await waitForPending(deadlineMs);
    },
    [evaluate, waitForPending],
  );

  const hasPendingEvaluations = useCallback(() => pendingRef.current.size > 0, []);

  /** Latest evaluations, safe to read from an async callback closure. */
  const getEvaluations = useCallback(() => evaluationsRef.current, []);

  /** Question ids (Bloom 3+) still missing a valid rationale. */
  const missingReasoning = useCallback(
    (questions: ReasoningQuestionRef[]): string[] =>
      questions
        .filter((q) => requiresReasoning(q.bloom) && !isReasoningComplete(rationales[q.id]))
        .map((q) => q.id),
    [rationales],
  );

  const isQuestionBlocked = useCallback(
    (question: ReasoningQuestionRef | undefined) =>
      !!question && requiresReasoning(question.bloom) && !isReasoningComplete(rationales[question.id]),
    [rationales],
  );

  return {
    rationales,
    setRationale,
    reset,
    missingReasoning,
    isQuestionBlocked,
    showErrors,
    setShowErrors,
    evaluations,
    evaluate,
    waitForPending,
    flushAndWait,
    hasPendingEvaluations,
    getEvaluations,
  };
}

/**
 * Batch-persist rationales after the result row exists. Never throws — a failed
 * insert must not lose the student's attempt.
 */
export async function saveReasoningRows(rows: ReasoningRow[]): Promise<boolean> {
  if (rows.length === 0) return true;
  const { error } = await supabase.from("student_answer_rationales").insert(rows);
  if (error) {
    console.error("Failed to save answer rationales:", error);
    return false;
  }
  return true;
}
