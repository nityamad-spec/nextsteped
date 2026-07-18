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

function buildBatch(n: number): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < n; i++) {
    const concept = CONCEPTS[i % CONCEPTS.length];
    const isMcq = i % 2 === 0;
    // Every 7th item is intentionally malformed to exercise reject paths.
    const bad = i % 7 === 0;

    if (isMcq) {
      const options = [
        `alpha option ${i}`,
        `beta choice ${i}`,
        `gamma pick ${i}`,
        `delta answer ${i}`,
      ];
      items.push({
        format: "mcq",
        content_text: `MCQ #${i}: which of the following about ${concept} is correct?`,
        options: bad ? options.slice(0, 3) : options, // bad => only 3 options
        answer: bad ? "not-in-options" : options[i % 4],
        explanation:
          `Because the correct answer for item ${i} explains why the other three distractors are wrong; ${concept} governs this behavior.`,
        topic: concept,
        difficulty_estimate: 0.3 + ((i % 5) * 0.1),
        bloom_level: 1 + (i % 5),
      });
    } else {
      items.push({
        format: "true_false",
        content_text:
          `T/F #${i}: a ${concept} construct always terminates without further conditions.`,
        answer: bad ? "maybe" : (i % 3 === 0 ? "True" : "False"),
        explanation:
          `The statement is ${i % 3 === 0 ? "true" : "false"} because ${concept} semantics require the described condition to hold; item ${i}.`,
        topic: concept,
        difficulty_estimate: 0.2 + ((i % 4) * 0.1),
        bloom_level: 1 + (i % 4),
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
    conceptQuotas: Object.fromEntries(CONCEPTS.map((c) => [c, 10])),
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
