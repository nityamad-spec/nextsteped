/**
 * End-to-end tests for the shared validator PIPELINE as composed by the
 * question-generating edge functions (Step 4 in generate-practice-questions,
 * mirrored by generate-weekly-quiz / generate-exam-questions /
 * generate-diagnostic-questions).
 *
 * Goal: guarantee the sanitizer drops ONLY items with a real defect and keeps
 * every well-formed item, across representative MCQ and T/F inputs.
 *
 * Each test builds a batch of items where the expected reject/keep set is
 * encoded on the item itself (`_expect: "keep" | "drop"`), runs the pipeline,
 * and asserts kept === expected-keep and rejected === expected-drop.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  auditBatchQuotas,
  dedupWithin,
  normalizeAnswer,
  summarizeRejections,
  validateBloom,
  validateConcept,
  validateDifficulty,
  validateExplanation,
  validateOptionParity,
  validateStructural,
} from "./question-validation.ts";

/* -------------------------------------------------------------------------- */
/* Pipeline mirroring generate-practice-questions Step 4                      */
/* -------------------------------------------------------------------------- */

type Format = "mcq" | "true_false";
type AllowedTypes = Format[];

interface SanitizeOptions {
  allowedFormats: AllowedTypes;
  allowedConceptCodes: string[];
  /** intent.types filter — items with format outside this set are dropped */
  intentTypes?: AllowedTypes;
  /** intent.bloom_focus — items with bloom outside (set ± 1) are dropped */
  bloomFocus?: number[];
  /** difficulty tier band */
  difficultyBand?: { midpoint?: number; band?: number };
  /** require 4 options for MCQ (default true) */
  requireFourOptions?: boolean;
  /** dedup against these pre-existing stems */
  existingStems?: { content_text: string; answer: string; topic: string }[];
}

interface Accepted {
  question: string;
  type: Format;
  options?: string[];
  answer: string;
  explanation: string;
  topic: string;
  difficulty_estimate: number;
  bloom_level: number;
}

interface RejectRecord {
  index: number;
  reason: string;
  item: Record<string, unknown>;
}

interface PipelineResult {
  accepted: Accepted[];
  rejected: RejectRecord[];
  rejectionCounts: Map<string, number>;
}

function sanitize(items: unknown[], opts: SanitizeOptions): PipelineResult {
  const accepted: Accepted[] = [];
  const rejected: RejectRecord[] = [];
  const counts = new Map<string, number>();
  const conceptMap: Record<string, true> = {};
  for (const c of opts.allowedConceptCodes) conceptMap[c] = true;
  const intentTypesSet = new Set<string>(opts.intentTypes ?? opts.allowedFormats);
  const bloomFocusSet = new Set<number>();
  if (opts.bloomFocus && opts.bloomFocus.length > 0) {
    for (const b of opts.bloomFocus) {
      bloomFocusSet.add(b);
      bloomFocusSet.add(b - 1);
      bloomFocusSet.add(b + 1);
    }
  }

  const reject = (index: number, reason: string, item: unknown) => {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
    rejected.push({ index, reason, item: item as Record<string, unknown> });
  };

  for (let i = 0; i < items.length; i++) {
    const q = items[i] as Record<string, unknown>;

    // 1) Structural
    const rawOptions = q?.type === "mcq" || q?.format === "mcq"
      ? (Array.isArray(q?.options) ? (q.options as unknown[]).map((s) => String(s).trim()).filter(Boolean) : q?.options)
      : undefined;
    const structural = validateStructural(
      { ...q, options: rawOptions },
      {
        allowedFormats: opts.allowedFormats,
        requireFourOptions: opts.requireFourOptions ?? true,
      },
    );
    if (!structural.ok) { reject(i, structural.reason, q); continue; }
    const { format, content_text, options } = structural.value;

    // 2a) intent.types filter
    if (!intentTypesSet.has(format)) {
      reject(i, `format ${format} not in intent.types`, q); continue;
    }

    // 2b) Concept
    const conceptCheck = validateConcept(q.topic, conceptMap);
    if (!conceptCheck.ok) { reject(i, conceptCheck.reason, q); continue; }
    const topic = conceptCheck.value;

    // 3) Answer
    let answer: string;
    if (format === "true_false") {
      const ans = normalizeAnswer(q.answer, ["True", "False"]);
      if (!ans.ok) { reject(i, `t/f: ${ans.reason}`, q); continue; }
      answer = ans.value;
    } else {
      const ans = normalizeAnswer(q.answer, options);
      if (!ans.ok) { reject(i, ans.reason, q); continue; }
      answer = ans.value;
      const parity = validateOptionParity(options, answer);
      if (!parity.ok) { reject(i, parity.reason, q); continue; }
    }

    // 4) Difficulty
    const diff = validateDifficulty(q.difficulty_estimate, { ...(opts.difficultyBand ?? {}), fallback: 0.5 });
    if (!diff.ok) { reject(i, diff.reason, q); continue; }

    // 5) Bloom
    const bloom = validateBloom(q.bloom_level, {
      min: 1, max: 6,
      enforceDifficultyConsistency: true,
      difficulty: diff.value,
    });
    if (!bloom.ok) { reject(i, bloom.reason, q); continue; }

    // 5a) Format cap
    if (format === "mcq" && bloom.value > 5) { reject(i, "bloom > 5 for MCQ", q); continue; }
    if (format === "true_false" && bloom.value > 4) { reject(i, "bloom > 4 for T/F", q); continue; }

    // 5b) intent.bloom_focus
    if (bloomFocusSet.size > 0 && !bloomFocusSet.has(bloom.value)) {
      reject(i, "bloom outside intent.bloom_focus (±1)", q); continue;
    }

    // 6) Explanation
    const explanation = String(q.explanation ?? "").trim();
    const explCheck = validateExplanation({
      format,
      options: format === "true_false" ? ["True", "False"] : options,
      answer,
      explanation,
    });
    if (!explCheck.ok) { reject(i, explCheck.reason, q); continue; }

    accepted.push({
      question: content_text,
      type: format as Format,
      options: format === "mcq" ? options : undefined,
      answer,
      explanation: explCheck.value,
      topic,
      difficulty_estimate: diff.value,
      bloom_level: bloom.value,
    });
  }

  // 7) Dedup against existing stems + within accepted batch
  if (accepted.length > 0) {
    const dedupIn = accepted.map((a) => ({ ...a, content_text: a.question }));
    const dedup = dedupWithin(dedupIn, opts.existingStems ?? []);
    for (const rej of dedup.rejected) {
      const originalIdx = accepted.findIndex((a) => a.question === rej.item.content_text);
      reject(originalIdx, `duplicate of: ${rej.duplicateOf}`, rej.item);
    }
    // Rebuild accepted from kept.
    const keptQuestions = new Set(dedup.kept.map((k) => k.content_text));
    for (let i = accepted.length - 1; i >= 0; i--) {
      if (!keptQuestions.has(accepted[i].question)) accepted.splice(i, 1);
    }
  }

  return { accepted, rejected, rejectionCounts: counts };
}

/* -------------------------------------------------------------------------- */
/* Fixture helpers                                                            */
/* -------------------------------------------------------------------------- */

const CONCEPTS = ["LOOPS", "CLASSES", "RECURSION", "COMPLEXITY"];

const goodMcq = (overrides: Record<string, unknown> = {}) => ({
  _expect: "keep",
  format: "mcq",
  content_text: "Which construct repeats a block while a condition holds?",
  options: ["while loop", "if branch", "for range", "def block"],
  answer: "while loop",
  explanation:
    "A while loop repeats a block of code as long as its condition remains true; the other constructs do not iterate.",
  topic: "LOOPS",
  difficulty_estimate: 0.35,
  bloom_level: 2,
  ...overrides,
});

const goodTf = (overrides: Record<string, unknown> = {}) => ({
  _expect: "keep",
  format: "true_false",
  content_text: "A recursive function must have a base case to terminate.",
  answer: "True",
  explanation:
    "Without a base case a recursive function calls itself indefinitely; the base case is what allows recursion to terminate correctly.",
  topic: "RECURSION",
  difficulty_estimate: 0.45,
  bloom_level: 2,
  ...overrides,
});

function runAndAssert(items: Array<Record<string, unknown>>, opts: SanitizeOptions) {
  const result = sanitize(items, opts);
  const expectedKeepIdxs = items
    .map((it, i) => ({ i, keep: it._expect === "keep" }))
    .filter((x) => x.keep)
    .map((x) => x.i);
  const expectedDropIdxs = items
    .map((it, i) => ({ i, drop: it._expect === "drop" }))
    .filter((x) => x.drop)
    .map((x) => x.i);
  const actualDropIdxs = result.rejected.map((r) => r.index);

  // Every "keep" survived.
  const survivedKeeps = expectedKeepIdxs.filter((i) => !actualDropIdxs.includes(i));
  assertEquals(
    survivedKeeps.length,
    expectedKeepIdxs.length,
    `Sanitizer dropped a valid item.\nExpected to keep indices: ${JSON.stringify(expectedKeepIdxs)}\nSurvived: ${JSON.stringify(survivedKeeps)}\nRejections: ${JSON.stringify(result.rejected.map((r) => ({ i: r.index, reason: r.reason })))}`,
  );

  // Every "drop" was actually rejected.
  for (const i of expectedDropIdxs) {
    assert(
      actualDropIdxs.includes(i),
      `Item at index ${i} should have been rejected but was accepted. Item: ${JSON.stringify(items[i])}`,
    );
  }

  // No unexpected drops.
  const unexpectedDrops = actualDropIdxs.filter((i) => !expectedDropIdxs.includes(i));
  assertEquals(
    unexpectedDrops,
    [],
    `Sanitizer rejected items that should have been kept: indices ${JSON.stringify(unexpectedDrops)}\nReasons: ${JSON.stringify(result.rejected.filter((r) => unexpectedDrops.includes(r.index)).map((r) => r.reason))}`,
  );

  return result;
}

/* -------------------------------------------------------------------------- */
/* MCQ tests                                                                   */
/* -------------------------------------------------------------------------- */

Deno.test("sanitizer: valid MCQ batch is fully kept", () => {
  const items = [
    goodMcq(),
    goodMcq({
      content_text: "Which structure stores unique keys mapped to values?",
      options: ["hash map", "list node", "min heap", "queue node"],
      answer: "hash map",
      explanation: "A hash map (or hash table) stores unique keys mapped to values via a hash function.",
      topic: "COMPLEXITY",
      difficulty_estimate: 0.5,
      bloom_level: 2,
    }),
    goodMcq({
      content_text: "Which language feature bundles data and behavior into a single unit?",
      options: ["a class", "a for loop", "a return", "an import"],
      answer: "a class",
      explanation: "A class bundles data (attributes) and behavior (methods) into a single unit called an object.",
      topic: "CLASSES",
      difficulty_estimate: 0.4,
      bloom_level: 2,
    }),
  ];
  const r = runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
  assertEquals(r.accepted.length, 3);
  assertEquals(r.rejected.length, 0);
});

Deno.test("sanitizer: MCQ answer-letter recovery keeps the item (not a false drop)", () => {
  const items = [
    goodMcq({
      // model returned the letter, not the full text — normalizeAnswer must recover.
      answer: "A",
    }),
  ];
  const r = runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
  assertEquals(r.accepted[0].answer, "while loop");
});

Deno.test("sanitizer: MCQ with wrong number of options is dropped", () => {
  const items = [
    goodMcq({ _expect: "drop", options: ["only", "three", "options"], answer: "only" }),
    goodMcq(),
  ];
  runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
});

Deno.test("sanitizer: MCQ with duplicate options is dropped", () => {
  const items = [
    goodMcq({
      _expect: "drop",
      options: ["while loop", "while loop", "for loop", "if statement"],
    }),
    goodMcq(),
  ];
  runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
});

Deno.test("sanitizer: MCQ answer not in options is dropped", () => {
  const items = [
    goodMcq({
      _expect: "drop",
      answer: "do-while loop", // not in options
    }),
    goodMcq(),
  ];
  runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
});

Deno.test("sanitizer: MCQ where correct option is strictly longest is dropped (length parity)", () => {
  const items = [
    goodMcq({
      _expect: "drop",
      options: ["for", "if", "return",
        "a while loop that repeatedly evaluates its condition and executes the body until false"],
      answer:
        "a while loop that repeatedly evaluates its condition and executes the body until false",
    }),
  ];
  runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
});

Deno.test("sanitizer: MCQ whose explanation supports a distractor is dropped", () => {
  const items = [
    goodMcq({
      _expect: "drop",
      content_text: "Which data structure gives O(1) average lookup by key?",
      options: ["hash table", "linked list", "sorted array", "binary tree"],
      answer: "hash table",
      // explanation actually describes linked lists.
      explanation:
        "A linked list stores nodes with pointers to the next node; linked list traversal walks the linked list from head to tail node by node.",
      topic: "COMPLEXITY",
    }),
    goodMcq(),
  ];
  runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
});

Deno.test("sanitizer: MCQ whose explanation names a wrong option letter is dropped", () => {
  const items = [
    goodMcq({
      _expect: "drop",
      explanation:
        "The correct answer is option C because a class definition is what repeats a block of code while a condition remains true.",
    }),
    goodMcq(),
  ];
  runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
});

Deno.test("sanitizer: MCQ with concept outside allowed set is dropped", () => {
  const items = [
    goodMcq({ _expect: "drop", topic: "NEURAL_NETS" }),
    goodMcq(),
  ];
  runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
});

Deno.test("sanitizer: MCQ with hard difficulty but bloom 1 is dropped", () => {
  const items = [
    goodMcq({
      _expect: "drop",
      difficulty_estimate: 0.85,
      bloom_level: 1,
    }),
    goodMcq(),
  ];
  runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
});

Deno.test("sanitizer: MCQ difficulty outside tier band is dropped when band set", () => {
  const items = [
    // Request tier = easy (midpoint 0.25 ± 0.10). 0.85 is way out of band.
    goodMcq({ _expect: "drop", difficulty_estimate: 0.85, bloom_level: 5 }),
    goodMcq({ difficulty_estimate: 0.30, bloom_level: 2 }),
  ];
  runAndAssert(items, {
    allowedFormats: ["mcq", "true_false"],
    allowedConceptCodes: CONCEPTS,
    difficultyBand: { midpoint: 0.25, band: 0.10 },
  });
});

Deno.test("sanitizer: MCQ with bloom 6 (out of format cap) is dropped", () => {
  const items = [
    goodMcq({ _expect: "drop", difficulty_estimate: 0.9, bloom_level: 6 }),
    goodMcq(),
  ];
  runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
});

/* -------------------------------------------------------------------------- */
/* T/F tests                                                                   */
/* -------------------------------------------------------------------------- */

Deno.test("sanitizer: valid T/F batch is fully kept", () => {
  const items = [
    goodTf(),
    goodTf({
      content_text: "A hash map provides average O(1) lookup by key.",
      answer: "True",
      explanation:
        "Hash maps compute an index from a hash of the key, giving average constant-time lookup when collisions are rare.",
      topic: "COMPLEXITY",
      bloom_level: 3,
      difficulty_estimate: 0.5,
    }),
  ];
  const r = runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
  assertEquals(r.accepted.length, 2);
});

Deno.test("sanitizer: T/F stem shaped like MCQ is dropped", () => {
  const items = [
    goodTf({
      _expect: "drop",
      content_text: "Which of the following requires a base case to terminate?",
    }),
    goodTf(),
  ];
  runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
});

Deno.test("sanitizer: T/F with garbage answer is dropped (strict True/False)", () => {
  const items = [
    goodTf({ _expect: "drop", answer: "maybe" }),
    goodTf({ _expect: "drop", answer: "tomato" }), // was accepted under old /^t/i regex
    goodTf(),
  ];
  runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
});

Deno.test("sanitizer: T/F with contradicting explanation is dropped", () => {
  const items = [
    goodTf({
      _expect: "drop",
      answer: "True",
      explanation: "This statement is false and incorrect because recursion works without base cases.",
    }),
    goodTf(),
  ];
  runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
});

Deno.test("sanitizer: T/F with bloom 5 (above format cap 4) is dropped", () => {
  const items = [
    goodTf({ _expect: "drop", difficulty_estimate: 0.8, bloom_level: 5 }),
    goodTf(),
  ];
  runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
});

Deno.test("sanitizer: T/F answered with lowercase 'true'/'false' is recovered", () => {
  const items = [
    goodTf({ answer: "true" }),
    goodTf({
      answer: "false",
      content_text: "A recursive function without a base case will terminate on its own.",
      explanation:
        "Without a base case the recursive function keeps calling itself and never returns, so it will not terminate.",
    }),
  ];
  const r = runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
  assertEquals(r.accepted[0].answer, "True");
  assertEquals(r.accepted[1].answer, "False");
});

/* -------------------------------------------------------------------------- */
/* intent.types + bloom_focus                                                 */
/* -------------------------------------------------------------------------- */

Deno.test("sanitizer: intent.types=['mcq'] drops T/F items", () => {
  const items = [
    goodMcq(),
    goodTf({ _expect: "drop" }),
  ];
  runAndAssert(items, {
    allowedFormats: ["mcq", "true_false"],
    intentTypes: ["mcq"],
    allowedConceptCodes: CONCEPTS,
  });
});

Deno.test("sanitizer: intent.bloom_focus=[1,2] drops item at bloom 5 (outside ±1)", () => {
  const items = [
    // bloom 2 is inside focus (1,2) ± 1 = {0,1,2,3}
    goodMcq({ bloom_level: 2, difficulty_estimate: 0.25 }),
    // bloom 5 is outside focus ± 1
    goodMcq({ _expect: "drop", bloom_level: 5, difficulty_estimate: 0.85 }),
  ];
  runAndAssert(items, {
    allowedFormats: ["mcq", "true_false"],
    allowedConceptCodes: CONCEPTS,
    bloomFocus: [1, 2],
  });
});

/* -------------------------------------------------------------------------- */
/* Dedup                                                                       */
/* -------------------------------------------------------------------------- */

Deno.test("sanitizer: near-duplicate of recent stem is dropped by dedup", () => {
  const items = [
    goodMcq({
      _expect: "drop",
      content_text: "Which construct repeats a block of code while a condition remains true?",
    }),
    goodMcq({
      content_text: "Which language feature encapsulates state and behavior into one unit?",
      options: ["a class", "a for loop", "a return", "an import"],
      answer: "a class",
      explanation: "A class encapsulates state (attributes) and behavior (methods) into a single unit called an object.",
      topic: "CLASSES",
    }),
  ];
  runAndAssert(items, {
    allowedFormats: ["mcq", "true_false"],
    allowedConceptCodes: CONCEPTS,
    existingStems: [{
      content_text: "Which construct repeats a block while a condition holds?",
      answer: "while loop",
      topic: "LOOPS",
    }],
  });
});

Deno.test("sanitizer: two near-identical items in same batch — one kept, one dropped as duplicate", () => {
  const a = goodMcq();
  const b = goodMcq({
    // Paraphrase of a — should be caught by intra-batch dedup.
    content_text: "Which construct repeats a block of code while a condition remains true?",
  });
  const items = [a, b];
  const r = sanitize(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
  assertEquals(r.accepted.length, 1, `expected 1 accepted, got ${r.accepted.length}`);
  assert(
    r.rejected.some((rr) => /duplicate of/.test(rr.reason)),
    `expected a duplicate-of rejection, got ${JSON.stringify(r.rejected.map((rr) => rr.reason))}`,
  );
});

/* -------------------------------------------------------------------------- */
/* Aggregate / observability                                                  */
/* -------------------------------------------------------------------------- */

Deno.test("sanitizer: mixed batch — every valid item kept, every invalid item dropped, reasons aggregated", () => {
  const items = [
    goodMcq(),                                                          // 0 keep
    goodTf(),                                                           // 1 keep
    goodMcq({ _expect: "drop", topic: "OFF_TOPIC" }),                   // 2 drop (concept)
    goodMcq({ _expect: "drop", answer: "does not appear" }),            // 3 drop (answer)
    goodTf({ _expect: "drop", answer: "banana" }),                      // 4 drop (t/f answer)
    goodMcq({ _expect: "drop", difficulty_estimate: 0.9, bloom_level: 1 }), // 5 drop (bloom/diff)
    goodMcq({
      _expect: "drop",
      options: ["a", "b", "c", "d"],
      answer: "a",
      explanation: "short",
    }),                                                                 // 6 drop (explanation too short + parity)
    goodTf({ _expect: "drop", content_text: "Which of the following is true?" }), // 7 drop (t/f mcq-shaped)
    goodMcq({
      content_text: "Which data structure gives O(log n) search when balanced?",
      options: ["bst tree", "list node", "hash map", "heap node"],
      answer: "binary search tree",
      explanation:
        "A balanced binary search tree keeps its height in O(log n), so searching from the root to a leaf takes logarithmic time.",
      topic: "COMPLEXITY",
      difficulty_estimate: 0.55,
      bloom_level: 3,
    }),                                                                 // 8 keep
  ];
  const r = runAndAssert(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });

  // Exactly 3 kept, 6 dropped.
  assertEquals(r.accepted.length, 3);
  assertEquals(r.rejected.length, 6);

  // Rejection reasons cover the intended failure modes (at least these keys present).
  const allReasons = [...r.rejectionCounts.keys()].join(" | ");
  assert(/topic|concept/i.test(allReasons), `missing concept reason in: ${allReasons}`);
  assert(/answer/i.test(allReasons), `missing answer reason in: ${allReasons}`);
  assert(/bloom|difficulty|hard question/i.test(allReasons), `missing bloom/difficulty reason in: ${allReasons}`);
  assert(/explanation|shaped|parity|option/i.test(allReasons), `missing structural/explanation reason in: ${allReasons}`);

  // summarizeRejections should produce a non-empty compact hint.
  const hint = summarizeRejections(r.rejected.map((rr) => rr.reason));
  assert(hint.length > 0);
  assert(/Previously rejected/.test(hint));
});

Deno.test("sanitizer + audit: quota audit reports concept shortfall accurately", () => {
  const items = [
    goodMcq({ topic: "LOOPS" }),
    goodMcq({ topic: "LOOPS", content_text: "Which construct iterates a fixed number of times?", options: ["for loop", "if statement", "return statement", "class definition"], answer: "for loop", explanation: "A for loop iterates a fixed number of times, unlike the other constructs which do not iterate." }),
    goodMcq({ topic: "CLASSES", content_text: "Which construct defines a template for objects?", options: ["a class", "a for loop", "a return", "an import"], answer: "a class", explanation: "A class defines a template for creating objects with attributes and methods." }),
  ];
  const r = sanitize(items, { allowedFormats: ["mcq", "true_false"], allowedConceptCodes: CONCEPTS });
  assertEquals(r.accepted.length, 3);
  const audit = auditBatchQuotas(
    r.accepted.map((a) => ({ topic: a.topic, difficulty_estimate: a.difficulty_estimate })),
    { perConcept: { LOOPS: 2, CLASSES: 1, RECURSION: 1, COMPLEXITY: 1 } },
  );
  assertEquals(audit.perConcept.LOOPS, 0);
  assertEquals(audit.perConcept.CLASSES, 0);
  assertEquals(audit.perConcept.RECURSION, 1);
  assertEquals(audit.perConcept.COMPLEXITY, 1);
});
