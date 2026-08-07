import { describe, it, expect } from "vitest";
import { buildReasoningRows } from "./buildReasoningRows";
import type { ReasoningEvaluation } from "./reasoning";

const VALID = "Because the recursion bottoms out at the base case.";
const SHORT = "idk";

function evaluation(over: Partial<ReasoningEvaluation> = {}): ReasoningEvaluation {
  return {
    status: "done",
    verdict: "accepted",
    feedback: "Good.",
    modelReasoning: "Each call shrinks the input.",
    evaluatedText: VALID,
    ...over,
  };
}

function build(over: Partial<Parameters<typeof buildReasoningRows>[0]> = {}) {
  return buildReasoningRows({
    studentId: "s1",
    courseId: "c1",
    sourceFormat: "weekly_quiz",
    questionSource: "assessment_questions",
    sourceResultId: "r1",
    answers: [{ question_id: "q1", topic: "Recursion", selected: "B", is_correct: true }],
    rationales: { q1: VALID },
    bloomFor: () => 4,
    ...over,
  });
}

describe("buildReasoningRows — row selection", () => {
  it("emits one row for a Bloom 3+ question with a valid rationale", () => {
    const rows = build();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      student_id: "s1",
      course_id: "c1",
      source_format: "weekly_quiz",
      question_source: "assessment_questions",
      source_result_id: "r1",
      question_id: "q1",
      topic: "Recursion",
      bloom_level: 4,
      selected_answer: "B",
      is_correct: true,
      rationale_text: VALID,
    });
  });

  it("skips Bloom 1-2 questions even when a rationale exists", () => {
    expect(build({ bloomFor: () => 2 })).toHaveLength(0);
  });

  it("skips questions whose rationale is missing or too short", () => {
    expect(build({ rationales: {} })).toHaveLength(0);
    expect(build({ rationales: { q1: SHORT } })).toHaveLength(0);
    expect(build({ rationales: { q1: "   " } })).toHaveLength(0);
  });

  it("ignores answers with no question id and an empty answer list", () => {
    expect(build({ answers: [{ question_id: "" }] })).toHaveLength(0);
    expect(build({ answers: [] })).toHaveLength(0);
    expect(build({ answers: undefined as never })).toHaveLength(0);
  });

  it("clamps out-of-range bloom levels into 1..6", () => {
    expect(build({ bloomFor: () => 42 })[0].bloom_level).toBe(6);
    expect(build({ bloomFor: () => 3.4 })[0].bloom_level).toBe(3);
    expect(build({ bloomFor: () => NaN })).toHaveLength(0); // NaN || 1 → bloom 1 → skipped
  });

  it("trims the stored text and truncates at the column cap", () => {
    const long = "x".repeat(5000);
    const rows = build({ rationales: { q1: `  ${long}  ` } });
    expect(rows[0].rationale_text).toHaveLength(4000);
  });

  it("stores nulls for absent optional answer fields", () => {
    const rows = build({ answers: [{ question_id: "q1" }] });
    expect(rows[0].topic).toBeNull();
    expect(rows[0].selected_answer).toBeNull();
    expect(rows[0].is_correct).toBeNull();
  });

  it("supports every source format / question source pairing", () => {
    const diag = build({ sourceFormat: "diagnostic", questionSource: "diagnostic_questions" });
    expect(diag[0].source_format).toBe("diagnostic");
    const practice = build({
      sourceFormat: "practice",
      questionSource: "generated",
      courseId: null,
      sourceResultId: null,
    });
    expect(practice[0]).toMatchObject({
      source_format: "practice",
      question_source: "generated",
      course_id: null,
      source_result_id: null,
    });
  });
});

describe("buildReasoningRows — AI verdict attachment", () => {
  it("attaches a completed verdict produced for the stored text", () => {
    const rows = build({ evaluations: { q1: evaluation() } });
    expect(rows[0].ai_verdict).toBe("accepted");
    expect(rows[0].ai_feedback).toBe("Good.");
    expect(rows[0].ai_model_reasoning).toBe("Each call shrinks the input.");
    expect(typeof rows[0].ai_evaluated_at).toBe("string");
  });

  it("attaches a rejected verdict too", () => {
    const rows = build({ evaluations: { q1: evaluation({ verdict: "rejected" }) } });
    expect(rows[0].ai_verdict).toBe("rejected");
  });

  it("stores nulls when no evaluation exists", () => {
    const rows = build();
    expect(rows[0].ai_verdict).toBeNull();
    expect(rows[0].ai_evaluated_at).toBeNull();
  });

  it("drops a verdict that is still pending or unevaluated", () => {
    expect(build({ evaluations: { q1: evaluation({ status: "pending", verdict: null }) } })[0].ai_verdict)
      .toBeNull();
    expect(build({ evaluations: { q1: evaluation({ status: "unevaluated", verdict: null }) } })[0].ai_verdict)
      .toBeNull();
  });

  it("drops a stale verdict when the student edited the rationale afterwards", () => {
    const rows = build({
      rationales: { q1: `${VALID} Edited afterwards.` },
      evaluations: { q1: evaluation() },
    });
    expect(rows[0].ai_verdict).toBeNull();
    expect(rows[0].ai_feedback).toBeNull();
    expect(rows[0].ai_evaluated_at).toBeNull();
  });

  it("matches the verdict against the trimmed text the student sees", () => {
    const rows = build({ rationales: { q1: `   ${VALID}   ` }, evaluations: { q1: evaluation() } });
    expect(rows[0].ai_verdict).toBe("accepted");
  });

  it("normalises empty feedback strings to null", () => {
    const rows = build({
      evaluations: { q1: evaluation({ feedback: "", modelReasoning: "" }) },
    });
    expect(rows[0].ai_feedback).toBeNull();
    expect(rows[0].ai_model_reasoning).toBeNull();
  });

  it("attaches verdicts per question and never crosses them over", () => {
    const rows = build({
      answers: [{ question_id: "q1" }, { question_id: "q2" }],
      rationales: { q1: VALID, q2: `${VALID} two` },
      evaluations: {
        q1: evaluation({ verdict: "accepted" }),
        q2: evaluation({ verdict: "rejected", evaluatedText: `${VALID} two` }),
      },
    });
    expect(rows.map((r) => r.ai_verdict)).toEqual(["accepted", "rejected"]);
  });
});
