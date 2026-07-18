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

// Uniform-length options (structural allows max/min <= 1.6x) with distinct
// key tokens per concept so validateExplanation's token overlap check can
// distinguish correct from distractors.
const MCQ_TEMPLATES: Record<string, { correct: string; distractors: string[]; explanation: string; salt: string[] }> = {
  LOOPS: {
    correct: "iteration repeats the block",
    distractors: ["assignment sets a variable", "definition declares a name", "return exits the function"],
    explanation: "Iteration repeats a block while a condition holds; the other constructs do not repeat execution.",
    salt: ["counter", "sentinel", "range", "index", "bound", "step", "cursor", "guard"],
  },
  CLASSES: {
    correct: "inheritance extends a base class",
    distractors: ["assignment binds one value", "iteration walks a sequence", "recursion recomputes a call"],
    explanation: "Inheritance lets a subclass extend behavior of a base class; the other constructs are unrelated to type hierarchies.",
    salt: ["subtype", "mixin", "override", "super", "polymorphism", "constructor", "field", "method"],
  },
  RECURSION: {
    correct: "base case stops the recursion",
    distractors: ["global counter counts calls", "for loop iterates a list", "print statement shows text"],
    explanation: "The base case is what stops recursion; without it the call stack grows without bound.",
    salt: ["stack", "frame", "trampoline", "memo", "unwind", "descent", "invariant", "arity"],
  },
  COMPLEXITY: {
    correct: "big-O describes growth rate",
    distractors: ["wall-clock returns seconds", "linter formats source code", "compiler emits binary code"],
    explanation: "Big-O describes asymptotic growth rate as input size increases; wall-clock timing is separate.",
    salt: ["asymptote", "constant", "linear", "quadratic", "logarithmic", "amortized", "worst", "average"],
  },
  IO: {
    correct: "close flushes and releases",
    distractors: ["open returns an integer", "seek deletes the file", "write ignores the buffer"],
    explanation: "Closing a file flushes buffered writes and releases the descriptor; leaving it open leaks resources.",
    salt: ["descriptor", "buffer", "flush", "handle", "stream", "socket", "pipe", "duplex"],
  },
  TYPES: {
    correct: "static types check at compile",
    distractors: ["dynamic types skip runtime", "gradual types delete types", "phantom types run programs"],
    explanation: "Static types are checked at compile time; dynamic checks happen while the program runs.",
    salt: ["annotation", "inference", "generic", "variance", "narrowing", "widening", "signature", "arity"],
  },
};

function buildBatch(n: number): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < n; i++) {
    const concept = CONCEPTS[i % CONCEPTS.length];
    const isMcq = i % 2 === 0;
    const bad = i % 7 === 0;
    const tpl = MCQ_TEMPLATES[concept];
    const salt = tpl.salt[i % tpl.salt.length];
    // Give each stem a unique key token to defeat dedup jaccard collapse.
    const uniqSuffix = `variant-${i}-${salt}`;

    if (isMcq) {
      const options = bad
        ? [tpl.correct, tpl.distractors[0], tpl.distractors[1]] // 3 opts => drop
        : [tpl.correct, tpl.distractors[0], tpl.distractors[1], tpl.distractors[2]];
      items.push({
        format: "mcq",
        content_text: `Consider ${concept} scenario ${uniqSuffix}: which behavior applies here?`,
        options,
        answer: bad ? "not-in-options" : tpl.correct,
        explanation: `${tpl.explanation} (scenario ${uniqSuffix})`,
        topic: concept,
        difficulty_estimate: 0.3 + ((i % 3) * 0.1),
        bloom_level: 2 + (i % 3),
      });
    } else {
      const answerIsTrue = i % 3 !== 0;
      items.push({
        format: "true_false",
        content_text:
          `In ${concept} scenario ${uniqSuffix}, the property that ${tpl.correct} always holds.`,
        answer: bad ? "maybe" : (answerIsTrue ? "True" : "False"),
        explanation: answerIsTrue
          ? `This is accurate: ${tpl.correct} in scenario ${uniqSuffix}.`
          : `This is not accurate; the claim about ${uniqSuffix} misapplies the rule.`,
        topic: concept,
        difficulty_estimate: 0.3 + ((i % 3) * 0.1),
        bloom_level: 2 + (i % 3),
      });
    }
  }
  return items;
}



interface PipelineOpts {
  runDedup?: boolean;
  existing?: Array<{ content_text: string; answer: string; topic: string }>;
}

function runPipeline(items: Item[], opts: PipelineOpts = {}) {
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

  let finalAccepted = accepted;
  if (opts.runDedup) {
    const dedup = dedupWithin(accepted, opts.existing ?? []);
    finalAccepted = dedup.kept;
    for (const _ of dedup.rejected) bump("duplicate");
  }

  const audit = auditBatchQuotas(finalAccepted, {
    perConcept: Object.fromEntries(CONCEPTS.map((c) => [c, 10])),
  });
  return { accepted: finalAccepted, rejections, audit };
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

Deno.test("perf: dedup on 800 unique + 200 near-duplicate items stays under 1500ms", () => {
  // Build unique-stem items (long padding phrase kills token overlap between items).
  const uniquePad = (i: number) =>
    `nonce ${i} alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima ${i * 31} mike november oscar papa quebec romeo`;
  const base = buildBatch(800).filter((_, i) => i % 7 !== 0).map((it, i) => {
    return { ...it, content_text: `${it.content_text} — ${uniquePad(i)}` };
  });
  const preBase = runPipeline(base);

  // Craft 200 near-duplicate items of the first 200 accepted (same padding, tiny edit).
  const dupSeed = preBase.accepted.slice(0, 200);
  const dupItems: Item[] = dupSeed.map((a, i) => ({
    format: a.format,
    content_text: a.content_text.replace(/^Consider/, "Now consider"), // near-duplicate stem
    options: a.format === "mcq" ? MCQ_TEMPLATES[a.topic].distractors.concat(a.answer).reverse().slice(0, 4) : undefined,
    answer: a.answer,
    explanation: `${MCQ_TEMPLATES[a.topic].explanation} restated in item ${i}`,
    topic: a.topic,
    difficulty_estimate: a.difficulty_estimate,
    bloom_level: a.bloom_level,
  }));
  const preDupes = runPipeline(dupItems);

  const combined = [...preBase.accepted, ...preDupes.accepted];
  const start = performance.now();
  const dedup = dedupWithin(combined, []);
  const elapsed = performance.now() - start;

  console.log(
    `dedup perf: ${combined.length} incoming -> kept=${dedup.kept.length}, rejected=${dedup.rejected.length}, elapsed=${elapsed.toFixed(1)}ms`,
  );

  assert(dedup.rejected.length > 0, "expected the crafted near-duplicates to be caught");
  assert(dedup.kept.length > 0, "expected non-duplicate items to survive");
  assert(elapsed < 1500, `dedupWithin regressed: took ${elapsed.toFixed(1)}ms (budget 1500ms)`);
});

