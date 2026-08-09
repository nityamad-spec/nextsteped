/**
 * Pure helpers for the grade-short-answer edge function. Kept out of index.ts
 * so tests can import them without starting the Deno server.
 *
 * This grader judges CORRECTNESS of a free-text answer against a reference
 * answer — deliberately different from evaluate-reasoning, which judges the
 * quality of a written rationale.
 */

export interface GradeItem {
  question_id: string;
  question_text: string;
  student_answer: string;
  /** Fuller expected response, when the question carries one. */
  model_answer?: string | null;
  /** Short canonical answer. */
  answer?: string | null;
  topic?: string | null;
  bloom_level?: number;
  source_result_id?: string | null;
}

export type Verdict = "accepted" | "rejected";

export interface GradeResult {
  question_id: string;
  verdict: Verdict | null;
  feedback: string;
  model_reasoning: string;
  graded_by: "exact_match" | "model" | null;
}

export const EXACT_MATCH_FEEDBACK =
  "Correct — this matches the expected answer.";

/**
 * Lowercase, strip surrounding punctuation and collapse internal whitespace so
 * trivially-different spellings of the same short answer compare equal.
 */
export function normalizeAnswer(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^\p{L}\p{N}\s'+\-*/%.=<>_]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s'.\-]+|[\s'.\-]+$/g, "")
    .trim();
}

/**
 * True when the student's text is a normalised match for one of the reference
 * answers. Only ever accepts — never used to reject.
 */
export function exactMatch(
  studentAnswer: string,
  references: Array<string | null | undefined>,
): boolean {
  const student = normalizeAnswer(studentAnswer);
  if (!student) return false;
  return references.some((ref) => {
    const normalized = normalizeAnswer(ref);
    return normalized.length > 0 && normalized === student;
  });
}

/** The reference the grade was made against, stored as the audit snapshot. */
export function referenceAnswer(item: GradeItem): string {
  const model = (item.model_answer ?? "").trim();
  if (model) return model;
  return (item.answer ?? "").trim();
}

export const SYSTEM_PROMPT =
  `You are a university teaching assistant grading a student's SHORT FREE-TEXT ANSWER for correctness.

Compare the student's answer against the reference answer:
- "accepted": the answer is factually correct and covers the substance of the reference answer, even if worded differently, briefer, or loosely phrased.
- "rejected": the answer is factually wrong, misses the core idea, is empty of substance, or merely restates the question.

Grade the substance, not the spelling, grammar, or length.
Always put the correct answer, briefly explained, in "model_reasoning" so the student learns from a rejection.
Tone: formative and encouraging. Keep "feedback" under 40 words and "model_reasoning" under 60 words.`;

export function buildUserPrompt(item: GradeItem): string {
  return [
    item.topic ? `Concept: ${item.topic}` : "",
    item.bloom_level ? `Bloom level: ${item.bloom_level}` : "",
    `Question: ${item.question_text}`,
    `Reference answer: ${referenceAnswer(item) || "(not supplied)"}`,
    `Student's answer: ${item.student_answer}`,
  ].filter(Boolean).join("\n");
}

export const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "short_answer_grade",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        verdict: { type: "string", enum: ["accepted", "rejected"] },
        feedback: { type: "string" },
        model_reasoning: { type: "string" },
      },
      required: ["verdict", "feedback", "model_reasoning"],
    },
  },
} as const;

/** Tolerant parse of the gateway payload. Never throws; unknown → verdict null. */
export function parseGrade(raw: unknown, questionId: string): GradeResult {
  let content: unknown = raw;
  if (typeof raw === "object" && raw !== null && "choices" in raw) {
    content = (raw as { choices?: Array<{ message?: { content?: string } }> })
      .choices?.[0]?.message?.content;
  }
  let parsed: Record<string, unknown> | null = null;
  if (typeof content === "string") {
    const cleaned = content.trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "");
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
  } else if (typeof content === "object" && content !== null) {
    parsed = content as Record<string, unknown>;
  }
  const verdictRaw = String(parsed?.verdict ?? "").toLowerCase();
  const verdict: Verdict | null =
    verdictRaw === "accepted" || verdictRaw === "rejected" ? verdictRaw : null;
  return {
    question_id: questionId,
    verdict,
    feedback: String(parsed?.feedback ?? "").slice(0, 1000),
    model_reasoning: String(parsed?.model_reasoning ?? "").slice(0, 2000),
    graded_by: verdict ? "model" : null,
  };
}
