import {
  requiresReasoning,
  isReasoningComplete,
  type ReasoningEvaluation,
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
 * question that has a valid rationale, carrying the AI verdict when one landed.
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
  evaluations?: Record<string, ReasoningEvaluation>;
}): ReasoningRow[] {
  const rows: ReasoningRow[] = [];
  for (const a of args.answers ?? []) {
    const qid = a?.question_id;
    if (!qid) continue;
    const raw = Number(args.bloomFor(qid));
    const hasBloom = Number.isFinite(raw);
    const text = (args.rationales?.[qid] ?? "").trim();

    // When the Bloom level is unknown (NaN/undefined/non-numeric), a completed
    // rationale is itself evidence the question was Bloom 3+, since the widget
    // only renders at level 3 and above. Preserve the row with a floor of 3
    // instead of silently dropping the student's work.
    let bloom: number;
    if (hasBloom) {
      bloom = Math.min(6, Math.max(1, Math.round(raw)));
      if (!requiresReasoning(bloom)) continue;
    } else {
      if (!isReasoningComplete(text)) continue;
      bloom = 3;
    }

    if (!isReasoningComplete(text)) continue;

    // Only attach a verdict produced for the text we're actually storing.
    const evaluation = args.evaluations?.[qid];
    const verdictMatches =
      evaluation?.status === "done" &&
      !!evaluation.verdict &&
      evaluation.evaluatedText === text;

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
      ai_verdict: verdictMatches ? evaluation!.verdict : null,
      ai_feedback: verdictMatches ? evaluation!.feedback || null : null,
      ai_model_reasoning: verdictMatches ? evaluation!.modelReasoning || null : null,
      ai_evaluated_at: verdictMatches ? new Date().toISOString() : null,
    });
  }
  return rows;
}
