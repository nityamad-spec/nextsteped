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
  validateShortAnswer,
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

// ---------- Phase 7: reasoning follow-up distractor quality (best-effort) ----
//
// Deeper "plausible misconception" quality is model-graded, not validator-
// graded — these tests pin only what the shared validator can mechanically
// reject when a follow-up ships obviously-throwaway distractors.

Deno.test("Phase 7: MCQ with an empty distractor is rejected", () => {
  const r = validateStructural(
    { format: "mcq", content_text: "Why does len run in O(1)?", options: ["stored size", "recount", "", "cached"] },
    { allowedFormats: ["mcq"] },
  );
  assert(!r.ok, "empty option should be rejected by validateStructural");
});

Deno.test("Phase 7: MCQ with duplicated correct-answer text as a distractor is rejected", () => {
  const r = validateStructural(
    { format: "mcq", content_text: "Why?", options: ["stored size", "stored size", "recount", "cached"] },
    { allowedFormats: ["mcq"] },
  );
  assert(!r.ok && /duplicate/.test(r.reason));
});

Deno.test("Phase 7: length-parity guard rejects a follow-up whose correct option is far longer than distractors", () => {
  // Simulates a low-effort reasoning follow-up where the "correct" reason is
  // padded/hedged and every distractor is a throwaway single word.
  const options = [
    "yes",
    "no",
    "maybe",
    "Because Python stores the length as an attribute on the list object, so len(x) returns in constant time.",
  ];
  const r = validateOptionParity(options, options[3]);
  assert(!r.ok, "over-long correct option should trip length parity");
});


// ---------- Short answer ---------------------------------------------------

Deno.test("validateShortAnswer: happy path returns normalised value", () => {
  const r = validateShortAnswer({
    answer: "It stores the length as an attribute",
    model_answer:
      "Python lists keep their size on the list object, so len() reads a stored attribute instead of counting elements.",
    answer_max_words: 40,
  }, { stem: "Why does len(list) run in constant time?" });
  assert(r.ok, r.ok ? "" : r.reason);
  assertEquals(r.value.answer_max_words, 40);
});

Deno.test("validateShortAnswer: missing answer rejected", () => {
  const r = validateShortAnswer({ answer: "  ", model_answer: "A sufficiently long model answer here." });
  assert(!r.ok && /requires an answer/.test(r.reason));
});

Deno.test("validateShortAnswer: options present rejected", () => {
  const r = validateShortAnswer({
    answer: "Stored length attribute",
    model_answer: "Python stores the length attribute on the list object itself.",
    options: ["a", "b"],
  });
  assert(!r.ok && /must not carry options/.test(r.reason));
});

Deno.test("validateShortAnswer: over-long reference answer rejected", () => {
  const r = validateShortAnswer({
    answer: Array.from({ length: 40 }, (_, i) => `word${i}`).join(" "),
    model_answer: "A model answer that is long enough to pass the minimum length rule.",
  });
  assert(!r.ok && /too long/.test(r.reason));
});

Deno.test("validateShortAnswer: missing model answer rejected", () => {
  const r = validateShortAnswer({ answer: "Stored length attribute" });
  assert(!r.ok && /requires model_answer/.test(r.reason));
});

Deno.test("validateShortAnswer: model answer that ignores the reference answer rejected", () => {
  const r = validateShortAnswer({
    answer: "Constant time stored attribute",
    model_answer: "Sorting compares elements pairwise and swaps them until the sequence is ordered.",
  });
  assert(!r.ok && /does not support/.test(r.reason));
});

Deno.test("validateShortAnswer: stem restating the answer is rejected (leakage)", () => {
  const r = validateShortAnswer({
    answer: "stored length attribute",
    model_answer: "The list object carries a stored length attribute, so len() is constant time.",
  }, { stem: "Explain why the stored length attribute makes len() constant time." });
  assert(!r.ok && /leakage/.test(r.reason));
});

Deno.test("validateShortAnswer: answer_max_words clamped into the 20-120 budget", () => {
  const base = {
    answer: "stored length attribute",
    model_answer: "The list object carries a stored length attribute, so len() is constant time.",
  };
  const low = validateShortAnswer({ ...base, answer_max_words: 5 });
  const high = validateShortAnswer({ ...base, answer_max_words: 500 });
  assert(low.ok && low.value.answer_max_words === 20);
  assert(high.ok && high.value.answer_max_words === 120);
});
