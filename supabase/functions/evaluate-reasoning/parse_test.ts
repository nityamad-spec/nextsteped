import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildUserPrompt, parseEvaluation } from "./parse.ts";

const item = {
  question_id: "q1",
  question_text: "Why is binary search O(log n)?",
  options: ["Halving", "Scanning", "Sorting", "Hashing"],
  correct_answer: "Halving",
  selected_answer: "Halving",
  topic: "Complexity",
  bloom_level: 4,
  rationale_text: "Each comparison discards half of the remaining range.",
};

function gatewayPayload(content: string) {
  return { choices: [{ message: { content } }] };
}

Deno.test("parseEvaluation reads a clean gateway payload", () => {
  const r = parseEvaluation(
    gatewayPayload(JSON.stringify({
      verdict: "accepted",
      feedback: "Solid.",
      model_reasoning: "Halving the range each step gives log n.",
    })),
    "q1",
  );
  assertEquals(r.verdict, "accepted");
  assertEquals(r.feedback, "Solid.");
  assertEquals(r.question_id, "q1");
});

Deno.test("parseEvaluation reads a rejected verdict", () => {
  const r = parseEvaluation(
    gatewayPayload(JSON.stringify({ verdict: "rejected", feedback: "Try again", model_reasoning: "x" })),
    "q2",
  );
  assertEquals(r.verdict, "rejected");
  assertEquals(r.question_id, "q2");
});

Deno.test("parseEvaluation strips markdown code fences", () => {
  const r = parseEvaluation(
    gatewayPayload('```json\n{"verdict":"accepted","feedback":"ok","model_reasoning":"y"}\n```'),
    "q1",
  );
  assertEquals(r.verdict, "accepted");
  assertEquals(r.feedback, "ok");
});

Deno.test("parseEvaluation is case-insensitive on the verdict", () => {
  const r = parseEvaluation(gatewayPayload('{"verdict":"ACCEPTED"}'), "q1");
  assertEquals(r.verdict, "accepted");
});

Deno.test("parseEvaluation accepts an already-parsed object", () => {
  const r = parseEvaluation({ verdict: "rejected", feedback: "no", model_reasoning: "z" }, "q1");
  assertEquals(r.verdict, "rejected");
});

Deno.test("parseEvaluation returns a null verdict for unusable payloads", () => {
  for (
    const bad of [
      gatewayPayload("not json at all"),
      gatewayPayload('{"verdict":"maybe"}'),
      gatewayPayload("{}"),
      { choices: [] },
      {},
      null,
      undefined,
      "",
    ]
  ) {
    const r = parseEvaluation(bad, "q1");
    assertEquals(r.verdict, null, `expected null verdict for ${JSON.stringify(bad)}`);
    assertEquals(r.question_id, "q1");
    assertEquals(typeof r.feedback, "string");
  }
});

Deno.test("parseEvaluation caps runaway feedback and reasoning", () => {
  const r = parseEvaluation(
    gatewayPayload(JSON.stringify({
      verdict: "accepted",
      feedback: "f".repeat(5000),
      model_reasoning: "m".repeat(5000),
    })),
    "q1",
  );
  assertEquals(r.feedback.length, 1000);
  assertEquals(r.model_reasoning.length, 2000);
});

Deno.test("buildUserPrompt includes answer, rationale and options", () => {
  const p = buildUserPrompt(item);
  assertEquals(p.includes("Concept: Complexity"), true);
  assertEquals(p.includes("Bloom level: 4"), true);
  assertEquals(p.includes(item.question_text), true);
  assertEquals(p.includes("1. Halving"), true);
  assertEquals(p.includes("Correct answer: Halving"), true);
  assertEquals(p.includes(item.rationale_text), true);
});

Deno.test("buildUserPrompt degrades gracefully with no options or answer", () => {
  const p = buildUserPrompt({
    question_id: "q9",
    question_text: "Explain the invariant.",
    rationale_text: "It holds before and after every iteration.",
  });
  assertEquals(p.includes("Options:"), false);
  assertEquals(p.includes("Correct answer: (not supplied)"), true);
  assertEquals(p.includes("Student's answer: (none)"), true);
});
