/**
 * Performance regression test for the shared validator pipeline.
 *
 * Builds a large mixed batch (MCQ + T/F, ~50/50 valid/invalid) and runs it
 * through every validator that generate-practice-questions Step 4 composes,
 * plus dedup + quota audit. Asserts wall-clock stays under a generous budget
 * so a future accidental O(n^2) regression (e.g. in dedup or explanation
 * checks) fails loudly in CI instead of only showing up under production
 * load.
 *
 * Budget rationale: the sanitizer runs inside edge functions with a 150s
 * idle timeout; a single batch is typically <= 50 items. We test 2,000 items
 * and require < 2000ms on the test runner — ~40x safety margin over prod
 * batch sizes.
 */

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  auditBatchQuotas,
  dedupWithin,
  normalizeAnswer,
  validateBloom,
  validateConcept,
  validateDifficulty,
  validateExplanation,
  validateOptionParity,
  validateStructural,
} from "./question-validation.ts";

const CONCEPTS = ["LOOPS", "CLASSES", "RECURSION", "COMPLEXITY", "IO", "TYPES"];
const CONCEPT_MAP: Record<string, true> = Object.fromEntries(
  CONCEPTS.map((c) => [c, true as const]),
);

type Item = Record<string, unknown>;

// Distinct MCQ answer templates per concept so answers carry real key tokens
// that the explanation can reference (validateExplanation requires token
// overlap between explanation and correct answer).
const MCQ_TEMPLATES: Record<string, { correct: string; distractors: string[]; explanation: string }> = {
  LOOPS: {
    correct: "while loop repeats until condition false",
    distractors: ["static assignment executes once", "class inheritance chain", "module import declaration"],
    explanation: "A while loop repeats a block while its condition holds and stops when the condition becomes false; the other options do not iterate.",
  },
  CLASSES: {
    correct: "class inheritance shares behavior across subtypes",
    distractors: ["global variable mutation only", "for loop iteration counter", "print statement side effect"],
    explanation: "Class inheritance lets subtypes share and extend behavior defined on a base class; the other options are unrelated to type hierarchies.",
  },
  RECURSION: {
    correct: "recursive base case terminates the recursion",
    distractors: ["global counter increment", "linear list append", "string concatenation only"],
    explanation: "A recursive base case is what terminates the recursion; without a base case a recursive call stack grows without bound.",
  },
  COMPLEXITY: {
    correct: "big-O measures asymptotic growth",
    distractors: ["exact wall-clock runtime", "memory address layout", "compiler flag choice"],
    explanation: "Big-O notation describes asymptotic growth of an algorithm as input size increases; it is not a precise wall-clock measurement.",
  },
  IO: {
    correct: "file handle must be closed after write",
    distractors: ["print statement returns string", "input always returns integer", "open call requires no path"],
    explanation: "A file handle should be closed after writing to flush buffers and release the descriptor; leaving handles open leaks resources.",
  },
  TYPES: {
    correct: "static types checked before runtime",
    distractors: ["dynamic dispatch at compile time", "garbage collector removes types", "syntax highlighting is a type"],
    explanation: "Static type checking runs before execution and catches type mismatches at compile time; dynamic checks happen at runtime instead.",
  },
};

function buildBatch(n: number): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < n; i++) {
    const concept = CONCEPTS[i % CONCEPTS.length];
    const isMcq = i % 2 === 0;
    // Every 7th item is intentionally malformed to exercise reject paths.
    const bad = i % 7 === 0;
    const tpl = MCQ_TEMPLATES[concept];

    if (isMcq) {
      const options = bad
        ? [tpl.correct, tpl.distractors[0], tpl.distractors[1]] // 3 opts => structural drop
        : [tpl.correct, tpl.distractors[0], tpl.distractors[1], tpl.distractors[2]];
      items.push({
        format: "mcq",
        // stem #i keeps stems unique so dedup doesn't collapse the batch
        content_text: `[q${i}] For ${concept}, which statement is most accurate?`,
        options,
        answer: bad ? "not-in-options" : tpl.correct,
        explanation: tpl.explanation,
        topic: concept,
        difficulty_estimate: 0.3 + ((i % 3) * 0.1), // 0.3 / 0.4 / 0.5 => easy/medium band
        bloom_level: 2 + (i % 3), // 2..4, safe for both mcq (<=5) and tf (<=4)
      });
    } else {
      const answerIsTrue = i % 3 !== 0;
      items.push({
        format: "true_false",
        content_text:
          `[q${i}] In ${concept}, ${tpl.correct} is a defining property of the concept.`,
        answer: bad ? "maybe" : (answerIsTrue ? "True" : "False"),
        explanation: answerIsTrue
          ? `This statement is accurate because ${tpl.correct} — item ${i}.`
          : `This statement is not accurate: ${tpl.correct.replace(/^./, (c) => c.toUpperCase())} is misapplied here — item ${i}.`,
        topic: concept,
        difficulty_estimate: 0.3 + ((i % 3) * 0.1),
        bloom_level: 2 + (i % 3),
      });
    }
  }
  return items;
}


function runPipeline(items: Item[]) {
  const accepted: Array<{
    content_text: string;
    format: string;
    answer: string;
    topic: string;
    bloom_level: number;
    difficulty_estimate: number;
  }> = [];
  const rejections = new Map<string, number>();
  const bump = (r: string) => rejections.set(r, (rejections.get(r) ?? 0) + 1);

  for (const q of items) {
    const structural = validateStructural(q, {
      allowedFormats: ["mcq", "true_false"],
      requireFourOptions: true,
    });
    if (!structural.ok) { bump(structural.reason); continue; }
    const { format, content_text, options } = structural.value;

    const concept = validateConcept(q.topic, CONCEPT_MAP);
    if (!concept.ok) { bump(concept.reason); continue; }

    let answer: string;
    if (format === "true_false") {
      const a = normalizeAnswer(q.answer, ["True", "False"]);
      if (!a.ok) { bump(a.reason); continue; }
      answer = a.value;
    } else {
      const a = normalizeAnswer(q.answer, options);
      if (!a.ok) { bump(a.reason); continue; }
      const parity = validateOptionParity(options, a.value);
      if (!parity.ok) { bump(parity.reason); continue; }
      answer = a.value;
    }

    const diff = validateDifficulty(q.difficulty_estimate, { fallback: 0.5 });
    if (!diff.ok) { bump(diff.reason); continue; }
    const bloom = validateBloom(q.bloom_level, {
      min: 1, max: 6,
      enforceDifficultyConsistency: true,
      difficulty: diff.value,
    });
    if (!bloom.ok) { bump(bloom.reason); continue; }
    if (format === "mcq" && bloom.value > 5) { bump("bloom>5 mcq"); continue; }
    if (format === "true_false" && bloom.value > 4) { bump("bloom>4 tf"); continue; }

    const explCheck = validateExplanation({
      format,
      options: format === "true_false" ? ["True", "False"] : options,
      answer,
      explanation: String(q.explanation ?? "").trim(),
    });
    if (!explCheck.ok) { bump(explCheck.reason); continue; }

    accepted.push({
      content_text,
      format,
      answer,
      topic: concept.value,
      bloom_level: bloom.value,
      difficulty_estimate: diff.value,
    });
  }

  const dedup = dedupWithin(accepted, []);
  const audit = auditBatchQuotas(dedup.kept, {
    perConcept: Object.fromEntries(CONCEPTS.map((c) => [c, 10])),
  });
  return { accepted: dedup.kept, rejections, audit };
}

Deno.test("perf: 2,000-item mixed batch sanitizes under 2000ms", () => {
  const items = buildBatch(2000);
  const start = performance.now();
  const result = runPipeline(items);
  const elapsed = performance.now() - start;

  // Sanity: pipeline actually did work (not short-circuited).
  assert(result.accepted.length > 500, `expected substantial accepts, got ${result.accepted.length}`);
  assert(result.rejections.size > 0, "expected some rejections from crafted bad items");

  console.log(
    `sanitizer perf: 2000 items -> accepted=${result.accepted.length}, rejected=${
      items.length - result.accepted.length
    }, elapsed=${elapsed.toFixed(1)}ms`,
  );

  assert(
    elapsed < 2000,
    `sanitizer regressed: 2000-item batch took ${elapsed.toFixed(1)}ms (budget 2000ms)`,
  );
});

Deno.test("perf: dedup stays sub-linear-ish on 1,000 accepted vs 500 existing stems", () => {
  const items = buildBatch(1000).filter((_, i) => i % 7 !== 0); // drop crafted-bad
  const pre = runPipeline(items);
  const existing = pre.accepted.slice(0, 500).map((a) => ({
    content_text: a.content_text,
    answer: a.answer,
    topic: a.topic,
  }));

  const start = performance.now();
  const dedup = dedupWithin(pre.accepted, existing);
  const elapsed = performance.now() - start;

  console.log(
    `dedup perf: ${pre.accepted.length} accepted vs ${existing.length} existing -> kept=${dedup.kept.length}, elapsed=${elapsed.toFixed(1)}ms`,
  );

  assert(elapsed < 1500, `dedupWithin regressed: took ${elapsed.toFixed(1)}ms (budget 1500ms)`);
});
