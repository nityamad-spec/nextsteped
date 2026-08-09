import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildUserPrompt,
  exactMatch,
  normalizeAnswer,
  parseGrade,
  referenceAnswer,
} from "./grade.ts";

Deno.test("normalizeAnswer lowercases, trims and collapses whitespace", () => {
  assertEquals(normalizeAnswer("  A   List  "), "a list");
  assertEquals(normalizeAnswer("List."), "list");
  assertEquals(normalizeAnswer("“Tuple”"), "tuple");
  assertEquals(normalizeAnswer(null), "");
  assertEquals(normalizeAnswer(undefined), "");
});

Deno.test("normalizeAnswer keeps operators and identifiers", () => {
  assertEquals(normalizeAnswer("O(n log n)"), "o n log n");
  assertEquals(normalizeAnswer("x += 1"), "x += 1");
  assertEquals(normalizeAnswer("snake_case"), "snake_case");
});

Deno.test("exactMatch accepts normalised equality", () => {
  assertEquals(exactMatch("Dictionary", ["dictionary"]), true);
  assertEquals(exactMatch(" list. ", [null, "List"]), true);
  assertEquals(exactMatch("tuple", ["list", "tuple"]), true);
});

Deno.test("exactMatch rejects mismatches and empties", () => {
  assertEquals(exactMatch("set", ["dictionary"]), false);
  assertEquals(exactMatch("", ["dictionary"]), false);
  assertEquals(exactMatch("   ", [""]), false);
  assertEquals(exactMatch("anything", [null, undefined, ""]), false);
});

Deno.test("referenceAnswer prefers model_answer, falls back to answer", () => {
  assertEquals(
    referenceAnswer({
      question_id: "q",
      question_text: "t",
      student_answer: "s",
      model_answer: "A mutable ordered sequence.",
      answer: "list",
    }),
    "A mutable ordered sequence.",
  );
  assertEquals(
    referenceAnswer({
      question_id: "q",
      question_text: "t",
      student_answer: "s",
      model_answer: "  ",
      answer: "list",
    }),
    "list",
  );
  assertEquals(
    referenceAnswer({ question_id: "q", question_text: "t", student_answer: "s" }),
    "",
  );
});

Deno.test("buildUserPrompt includes context lines it has", () => {
  const prompt = buildUserPrompt({
    question_id: "q1",
    question_text: "What is a list?",
    student_answer: "An ordered collection",
    answer: "list",
    topic: "Data structures",
    bloom_level: 2,
  });
  assertStringIncludes(prompt, "Concept: Data structures");
  assertStringIncludes(prompt, "Bloom level: 2");
  assertStringIncludes(prompt, "Question: What is a list?");
  assertStringIncludes(prompt, "Reference answer: list");
  assertStringIncludes(prompt, "Student's answer: An ordered collection");
});

Deno.test("parseGrade reads a gateway chat completion", () => {
  const result = parseGrade({
    choices: [{
      message: {
        content: JSON.stringify({
          verdict: "accepted",
          feedback: "Good.",
          model_reasoning: "A list is ordered and mutable.",
        }),
      },
    }],
  }, "q1");
  assertEquals(result.verdict, "accepted");
  assertEquals(result.feedback, "Good.");
  assertEquals(result.graded_by, "model");
});

Deno.test("parseGrade tolerates fenced json", () => {
  const result = parseGrade({
    choices: [{
      message: {
        content: '```json\n{"verdict":"rejected","feedback":"f","model_reasoning":"m"}\n```',
      },
    }],
  }, "q2");
  assertEquals(result.verdict, "rejected");
  assertEquals(result.model_reasoning, "m");
});

Deno.test("parseGrade returns null verdict on malformed output", () => {
  for (const raw of [
    { choices: [{ message: { content: "not json" } }] },
    { choices: [] },
    {},
    null,
    { choices: [{ message: { content: '{"verdict":"maybe"}' } }] },
  ]) {
    const result = parseGrade(raw, "q3");
    assertEquals(result.verdict, null);
    assertEquals(result.graded_by, null);
  }
});

Deno.test("parseGrade truncates long strings", () => {
  const result = parseGrade({
    choices: [{
      message: {
        content: JSON.stringify({
          verdict: "accepted",
          feedback: "x".repeat(2000),
          model_reasoning: "y".repeat(4000),
        }),
      },
    }],
  }, "q4");
  assertEquals(result.feedback.length, 1000);
  assertEquals(result.model_reasoning.length, 2000);
});
