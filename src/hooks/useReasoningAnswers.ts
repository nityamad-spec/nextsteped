import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isReasoningComplete,
  requiresReasoning,
  type ReasoningRow,
} from "@/lib/reasoning";

export interface ReasoningQuestionRef {
  id: string;
  bloom: number;
}

/**
 * Holds the per-question rationale text for an in-progress assessment and
 * exposes the mandatory-input gating helpers used by every testing surface.
 */
export function useReasoningAnswers() {
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [showErrors, setShowErrors] = useState(false);

  const setRationale = useCallback((questionId: string, text: string) => {
    setRationales((prev) => ({ ...prev, [questionId]: text }));
  }, []);

  const reset = useCallback(() => {
    setRationales({});
    setShowErrors(false);
  }, []);

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
