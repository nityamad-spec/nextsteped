/**
 * Pure helpers for the evaluate-reasoning edge function. Kept out of index.ts
 * so tests can import them without starting the Deno server.
 */

export interface EvaluationItem {
  question_id: string;
  question_text: string;
  options?: string[];
  correct_answer?: string;
  selected_answer?: string | null;
  topic?: string | null;
  bloom_level?: number;
  rationale_text: string;
}

export interface EvaluationResult {
  question_id: string;
  verdict: "accepted" | "rejected" | null;
  feedback: string;
  model_reasoning: string;
}

export const SYSTEM_PROMPT =
  `You are a supportive university teaching assistant grading the QUALITY OF REASONING a student wrote to justify their answer.

Judge ONLY the reasoning, not whether the chosen answer was right:
- "accepted": the rationale shows genuine understanding of WHY the correct answer holds (even if worded loosely, or if the student picked the wrong option but reasoned partially soundly toward the right idea).
- "rejected": the rationale is empty of substance, restates the question, guesses, or rests on a misconception.

Always return the correct semantic reasoning for the item so the student learns from it.
Tone: formative and encouraging. Never say "wrong" — say what stronger reasoning looks like.
Keep "feedback" under 40 words and "model_reasoning" under 60 words.`;

export function buildUserPrompt(item: EvaluationItem): string {
  const opts = item.options?.length
    ? `\nOptions:\n${item.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}`
    : "";
  return [
    item.topic ? `Concept: ${item.topic}` : "",
    item.bloom_level ? `Bloom level: ${item.bloom_level}` : "",
    `Question: ${item.question_text}`,
    opts,
    `Correct answer: ${item.correct_answer || "(not supplied)"}`,
    `Student's answer: ${item.selected_answer || "(none)"}`,
    `Student's reasoning: ${item.rationale_text}`,
  ].filter(Boolean).join("\n");
}

export const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "reasoning_evaluation",
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
export function parseEvaluation(
  raw: unknown,
  questionId: string,
): EvaluationResult {
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
  const verdict = verdictRaw === "accepted" || verdictRaw === "rejected"
    ? verdictRaw
    : null;
  return {
    question_id: questionId,
    verdict,
    feedback: String(parsed?.feedback ?? "").slice(0, 1000),
    model_reasoning: String(parsed?.model_reasoning ?? "").slice(0, 2000),
  };
}
