import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ReasoningSourceFormat, ReasoningQuestionSource, ReasoningVerdict } from "@/lib/reasoning";

/** Minimum characters a short answer must contain before it can be submitted. */
export const SHORT_ANSWER_MIN_CHARS = 2;

export type ShortAnswerStatus = "idle" | "pending" | "done" | "ungraded";

export interface ShortAnswerGrade {
  status: ShortAnswerStatus;
  /** null when grading failed or has not landed. */
  verdict: ReasoningVerdict | null;
  feedback: string;
  modelReasoning: string;
  /** The answer text this grade was produced for (dedupe key). */
  gradedText: string;
}

export interface ShortAnswerGradeInput {
  questionId: string;
  questionText: string;
  /** Concise reference answer stored on the question row. */
  answer?: string | null;
  /** Fuller model answer used by the grader. */
  modelAnswer?: string | null;
  topic?: string | null;
  bloom?: number | null;
  courseId?: string | null;
  studentId: string;
  sourceFormat: ReasoningSourceFormat;
  questionSource: ReasoningQuestionSource;
  sourceResultId?: string | null;
}

/** True when a student's short answer satisfies the mandatory-input rule. */
export function isShortAnswerComplete(text: string | undefined | null): boolean {
  return (text ?? "").trim().length >= SHORT_ANSWER_MIN_CHARS;
}

/** Fallback used when the grader is unreachable: normalised exact match. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function localExactMatch(
  student: string,
  references: (string | null | undefined)[],
): boolean {
  const s = normalize(student);
  if (!s) return false;
  return references.some((r) => r && normalize(r) === s);
}

interface GradeResult {
  question_id: string;
  verdict: ReasoningVerdict | null;
  feedback?: string;
  model_reasoning?: string;
}

/**
 * Captures short-answer text, persists each response, and grades it in the
 * background via the `grade-short-answer` edge function.
 *
 * The caller owns the response row: it is inserted here (response_kind =
 * "short_answer") before the grading call, exactly as the function expects.
 * Grading never blocks navigation and never fails an attempt — an ungraded
 * answer falls back to a normalised exact-match comparison at scoring time.
 */
export function useShortAnswerGrading() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, ShortAnswerGrade>>({});
  const [showErrors, setShowErrors] = useState(false);
  const answersRef = useRef<Record<string, string>>({});
  const gradesRef = useRef<Record<string, ShortAnswerGrade>>({});
  const pendingRef = useRef<Map<string, Promise<void>>>(new Map());

  const writeGrade = useCallback((qid: string, next: ShortAnswerGrade) => {
    gradesRef.current = { ...gradesRef.current, [qid]: next };
    setGrades(gradesRef.current);
  }, []);

  const setAnswer = useCallback((questionId: string, text: string) => {
    answersRef.current = { ...answersRef.current, [questionId]: text };
    setAnswers(answersRef.current);
  }, []);

  const reset = useCallback(() => {
    answersRef.current = {};
    gradesRef.current = {};
    pendingRef.current.clear();
    setAnswers({});
    setGrades({});
    setShowErrors(false);
  }, []);

  /**
   * Insert the response row, then grade it. Fire-and-forget: returns
   * immediately and settles into `done` or `ungraded`.
   */
  const grade = useCallback(
    (input: ShortAnswerGradeInput) => {
      const qid = input.questionId;
      const text = (answersRef.current[qid] ?? "").trim();
      if (!isShortAnswerComplete(text)) return;

      const existing = gradesRef.current[qid];
      if (existing && existing.gradedText === text && existing.status !== "ungraded") return;
      if (pendingRef.current.has(qid) && existing?.gradedText === text) return;

      writeGrade(qid, {
        status: "pending",
        verdict: null,
        feedback: "",
        modelReasoning: "",
        gradedText: text,
      });

      const run = (async () => {
        const bloom = Math.min(6, Math.max(1, Math.round(Number(input.bloom) || 1)));
        try {
          const { error: insertError } = await supabase
            .from("student_answer_rationales")
            .insert({
              student_id: input.studentId,
              course_id: input.courseId ?? null,
              source_format: input.sourceFormat,
              source_result_id: input.sourceResultId ?? null,
              question_id: qid,
              question_source: input.questionSource,
              response_kind: "short_answer",
              topic: input.topic ?? null,
              bloom_level: bloom,
              selected_answer: null,
              is_correct: null,
              rationale_text: text.slice(0, 4000),
              model_answer_snapshot: input.modelAnswer ?? input.answer ?? null,
            } as never);
          if (insertError) throw insertError;

          const { data, error } = await supabase.functions.invoke("grade-short-answer", {
            body: {
              course_id: input.courseId ?? null,
              items: [
                {
                  question_id: qid,
                  question_text: input.questionText,
                  student_answer: text,
                  model_answer: input.modelAnswer ?? null,
                  answer: input.answer ?? null,
                  topic: input.topic ?? null,
                  bloom_level: bloom,
                  source_result_id: input.sourceResultId ?? null,
                },
              ],
            },
          });
          if (error) throw error;
          const result = (data as { results?: GradeResult[] } | null)?.results?.[0] ?? null;
          if (result?.verdict) {
            writeGrade(qid, {
              status: "done",
              verdict: result.verdict,
              feedback: result.feedback ?? "",
              modelReasoning: result.model_reasoning ?? "",
              gradedText: text,
            });
            return;
          }
        } catch (e) {
          console.error("Short-answer grading failed:", e);
        }
        writeGrade(qid, {
          status: "ungraded",
          verdict: null,
          feedback: "",
          modelReasoning: "",
          gradedText: text,
        });
      })().finally(() => {
        pendingRef.current.delete(qid);
      });

      pendingRef.current.set(qid, run);
    },
    [writeGrade],
  );

  /** Resolve when in-flight grades settle, or when the deadline passes. */
  const waitForPending = useCallback(async (deadlineMs: number) => {
    const inFlight = Array.from(pendingRef.current.values());
    if (inFlight.length === 0) return;
    await Promise.race([
      Promise.allSettled(inFlight),
      new Promise((resolve) => setTimeout(resolve, deadlineMs)),
    ]);
  }, []);

  /** Grade anything not yet fired (e.g. the final question), then wait. */
  const flushAndWait = useCallback(
    async (inputs: ShortAnswerGradeInput[], deadlineMs: number) => {
      for (const input of inputs ?? []) grade(input);
      await waitForPending(deadlineMs);
    },
    [grade, waitForPending],
  );

  const getGrades = useCallback(() => gradesRef.current, []);
  const getAnswers = useCallback(() => answersRef.current, []);
  const hasPendingGrades = useCallback(() => pendingRef.current.size > 0, []);

  return {
    answers,
    setAnswer,
    grades,
    grade,
    reset,
    showErrors,
    setShowErrors,
    waitForPending,
    flushAndWait,
    getGrades,
    getAnswers,
    hasPendingGrades,
  };
}
