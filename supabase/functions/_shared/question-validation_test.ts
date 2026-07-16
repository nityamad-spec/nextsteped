import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  normalizeAnswer,
  validateStructural,
  validateOptionParity,
  validateConcept,
  validateBloom,
  validateDifficulty,
  validateExplanation,
  dedupWithin,
  auditBatchQuotas,
  summarizeRejections,
} from "./question-validation.ts";

Deno.test("normalizeAnswer: verbatim match", () => {
  const r = normalizeAnswer("Paris", ["London", "Paris", "Rome", "Madrid"]);
  assert(r.ok && r.value === "Paris");
});

Deno.test("normalizeAnswer: letter A-D recovery", () => {
  const r = normalizeAnswer("B", ["London", "Paris", "Rome", "Madrid"]);
  assert(r.ok && r.value === "Paris");
});

Deno.test("normalizeAnswer: unicode quotes normalise", () => {
  const opts = ['He said "yes"', "He said no"];
  const r = normalizeAnswer("He said \u201Cyes\u201D", opts);
  assert(r.ok && r.value === opts[0]);
});

Deno.test("normalizeAnswer: prefix-strip 'A) full text'", () => {
  const r = normalizeAnswer("B) Paris", ["London", "Paris", "Rome", "Madrid"]);
  assert(r.ok && r.value === "Paris");
});

Deno.test("normalizeAnswer: ambiguous startsWith is REJECTED (was a silent-wrong-pick bug)", () => {
  // Both options start with "The value is" — old fuzzy recovery picked the first.
  const opts = ["The value is 10", "The value is 20", "Something else", "Other"];
  const r = normalizeAnswer("The value is", opts);
  assert(!r.ok, `expected reject, got ${r.ok ? r.value : ""}`);
});

Deno.test("validateStructural: T/F stem shaped like MCQ is rejected", () => {
  const r = validateStructural(
    { format: "true_false", content_text: "Which of the following is prime?" },
    { allowedFormats: ["mcq", "true_false"] },
  );
  assert(!r.ok && /shaped like an MCQ/.test(r.reason));
});

Deno.test("validateStructural: MCQ with duplicate options rejected", () => {
  const r = validateStructural(
    { format: "mcq", content_text: "Pick one", options: ["a", "b", "a", "d"] },
    { allowedFormats: ["mcq"] },
  );
  assert(!r.ok && /duplicate/.test(r.reason));
});

Deno.test("validateStructural: MCQ options with leftover A) prefixes rejected", () => {
  const r = validateStructural(
    { format: "mcq", content_text: "Pick", options: ["A) foo", "B) bar", "C) baz", "D) qux"] },
    { allowedFormats: ["mcq"] },
  );
  assert(!r.ok && /letter prefixes/.test(r.reason));
});

Deno.test("validateOptionParity: strictly longest correct >25% above avg rejected", () => {
  const options = ["short", "tiny", "med", "this is a very long correct option because it is"];
  const r = validateOptionParity(options, options[3]);
  assert(!r.ok);
});

Deno.test("validateConcept: case-insensitive match", () => {
  const r = validateConcept("Loops", { LOOPS: {}, CLASSES: {} });
  assert(r.ok && r.value === "LOOPS");
});

Deno.test("validateConcept: unknown code rejected", () => {
  const r = validateConcept("Recursion", { LOOPS: {}, CLASSES: {} });
  assert(!r.ok);
});

Deno.test("validateBloom: 5 on MCQ with range 1-4 is REJECTED (was coerced to 2 in exam)", () => {
  const r = validateBloom(5, { min: 1, max: 4 });
  assert(!r.ok && /out of range/.test(r.reason));
});

Deno.test("validateBloom: difficulty consistency (hard question w/ bloom 1)", () => {
  const r = validateBloom(1, { min: 1, max: 6, enforceDifficultyConsistency: true, difficulty: 0.9 });
  assert(!r.ok && /should be bloom . 3/.test(r.reason));
});

Deno.test("validateDifficulty: out of tier band rejected", () => {
  const r = validateDifficulty(0.9, { midpoint: 0.2, band: 0.15 });
  assert(!r.ok && /outside/.test(r.reason));
});

Deno.test("validateExplanation: T/F contradiction detected", () => {
  const r = validateExplanation({
    format: "true_false",
    options: ["True", "False"],
    answer: "True",
    explanation: "This statement is false and incorrect.",
  });
  assert(!r.ok && /contradicts/.test(r.reason));
});

Deno.test("validateExplanation: MCQ that name-drops wrong letter", () => {
  const r = validateExplanation({
    format: "mcq",
    options: ["London", "Paris", "Rome", "Madrid"],
    answer: "Paris", // idx 1 (B)
    explanation: "The correct answer is option C because Rome is the capital of France.",
  });
  assert(!r.ok && /names option/.test(r.reason));
});

Deno.test("validateExplanation: MCQ where explanation supports a distractor more", () => {
  const r = validateExplanation({
    format: "mcq",
    options: ["Binary search tree", "Hash table", "Linked list", "Stack"],
    answer: "Binary search tree",
    // Explanation actually describes hash tables.
    explanation: "Hash tables use hashing functions and hash buckets to store hash entries with hash keys.",
  });
  assert(!r.ok, `expected reject, got ok`);
});

Deno.test("dedupWithin: paraphrased stem with same answer is caught", () => {
  const existing = [{ content_text: "What is the time complexity of binary search on a sorted array?", answer: "O(log n)", topic: "COMPLEXITY" }];
  const incoming = [{ content_text: "What is the time complexity of binary search when applied to a sorted array?", answer: "O(log n)", topic: "COMPLEXITY" }];
  const r = dedupWithin(incoming, existing);
  assertEquals(r.kept.length, 0);
  assertEquals(r.rejected.length, 1);
});

Deno.test("auditBatchQuotas: reports shortfall per concept and bucket", () => {
  const accepted = [
    { topic: "LOOPS", difficulty_estimate: 0.2 },
    { topic: "LOOPS", difficulty_estimate: 0.5 },
    { topic: "LOOPS", difficulty_estimate: 0.9 },
    { topic: "LOOPS", difficulty_estimate: 0.9 },
    { topic: "LOOPS", difficulty_estimate: 0.9 },
  ];
  const spec = {
    perConcept: { LOOPS: 3, CLASSES: 2 },
    difficulty: { easy: 2, medium: 2, hard: 1 },
  };
  const audit = auditBatchQuotas(accepted, spec);
  assertEquals(audit.perConcept.LOOPS, -2); // surplus
  assertEquals(audit.perConcept.CLASSES, 2); // shortfall
  assertEquals(audit.difficulty?.easy, 1);
  assertEquals(audit.difficulty?.medium, 1);
  assertEquals(audit.difficulty?.hard, -2);
});

Deno.test("summarizeRejections: groups reasons with counts", () => {
  const hint = summarizeRejections([
    "answer not in options (no confident recovery)",
    "answer not in options (no confident recovery)",
    "explanation supports a distractor more than the correct answer",
  ]);
  assert(/2. answer not in options/.test(hint));
  assert(/1. explanation supports a distractor/.test(hint));
});
