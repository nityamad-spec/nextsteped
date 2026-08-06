import {
  requiresReasoning,
  isReasoningComplete,
  type ReasoningRow,
  type ReasoningSourceFormat,
  type ReasoningQuestionSource,
} from "@/lib/reasoning";

interface AnswerLike {
  question_id: string;
  topic?: string | null;
  selected?: string | null;
  is_correct?: boolean | null;
}

/**
 * Build the rows to persist for a finished attempt: one row per Bloom 3+
 * question that has a valid rationale.
 */
export function buildReasoningRows(args: {
  studentId: string;
  courseId: string | null;
  sourceFormat: ReasoningSourceFormat;
  questionSource: ReasoningQuestionSource;
  sourceResultId: string | null;
  answers: AnswerLike[];
  rationales: Record<string, string>;
  bloomFor: (questionId: string) => number;
}): ReasoningRow[] {
  const rows: ReasoningRow[] = [];
  for (const a of args.answers ?? []) {
    const qid = a?.question_id;
    if (!qid) continue;
    const bloom = Math.min(6, Math.max(1, Math.round(args.bloomFor(qid) || 1)));
    if (!requiresReasoning(bloom)) continue;
    const text = (args.rationales?.[qid] ?? "").trim();
    if (!isReasoningComplete(text)) continue;
    rows.push({
      student_id: args.studentId,
      course_id: args.courseId,
      source_format: args.sourceFormat,
      source_result_id: args.sourceResultId,
      question_id: qid,
      question_source: args.questionSource,
      topic: a.topic ?? null,
      bloom_level: bloom,
      selected_answer: a.selected ?? null,
      is_correct: a.is_correct ?? null,
      rationale_text: text.slice(0, 4000),
    });
  }
  return rows;
}
