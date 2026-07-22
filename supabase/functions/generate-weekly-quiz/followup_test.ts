// Pure unit tests for the follow-up coverage rule + reasoning novelty check.
// No network, no DB. Run via `deno test` or supabase--test_edge_functions.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DEMOTION_CAP_PER_TIER,
  selectFinalItemsForTier,
  validateReasoningNovelty,
  type FollowupQuestion,
  type GeneratedQuestion,
  type TierSpec,
} from "./followup.ts";

// ---------- Fixtures --------------------------------------------------------

function makePrimary(overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion {
  return {
    content_text: "What does `len([1, 2, 3])` return in Python?",
    format: "mcq",
    options: ["1", "2", "3", "4"],
    answer: "3",
    difficulty_estimate: 0.5,
    bloom_level: 2,
    explanation: "len returns the number of items in the sequence.",
    topic: "LISTS",
    ...overrides,
  };
}

function makeFollowup(overrides: Partial<FollowupQuestion> = {}): FollowupQuestion {
  return {
    content_text: "Why does calling len on a list run in constant time?",
    format: "mcq",
    options: [
      "Lists store their length as an attribute.",
      "Python re-counts the elements each call.",
      "Lists are immutable, so length is cached.",
      "The interpreter memoizes recent calls.",
    ],
    answer: "Lists store their length as an attribute.",
    difficulty_estimate: 0.5,
    bloom_level: 3,
    explanation: "CPython stores ob_size, so len is O(1).",
    topic: "LISTS",
    ...overrides,
  };
}

const TIER: TierSpec = {
  tier: "standard",
  count: 5,
  difficulty: 0.5,
  label: "Standard",
  batchSize: 3,
  perCallTimeoutMs: 50_000,
  maxAttempts: 2,
  reserveExtras: 2,
};

// ---------- validateReasoningNovelty ---------------------------------------

Deno.test("novelty: rejects a follow-up whose stem paraphrases the parent", () => {
  const parent = makePrimary({
    content_text: "What is the time complexity of binary search on a sorted array?",
    answer: "O(log n)",
    topic: "COMPLEXITY",
  });
  const fu = makeFollowup({
    // Near-duplicate stem: same question, same answer, cosmetic rewording.
    content_text: "What is the time complexity of binary search when applied to a sorted array?",
    answer: "O(log n)",
    options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
    topic: "COMPLEXITY",
  });
  const r = validateReasoningNovelty(parent, fu);
  assert(!r.ok, "expected near-duplicate stem to be rejected");
});

Deno.test("novelty: rejects a follow-up whose answer is identical to the parent's", () => {
  const parent = makePrimary({ answer: "3", topic: "LISTS" });
  const fu = makeFollowup({
    content_text: "Which value does the interpreter return?",
    options: ["1", "2", "3", "4"],
    answer: "3", // identical to parent
    topic: "LISTS",
  });
  const r = validateReasoningNovelty(parent, fu);
  assert(!r.ok && /identical/.test(r.reason));
});

Deno.test("novelty: accepts a mechanism-focused follow-up (different stem + answer)", () => {
  const parent = makePrimary();
  const fu = makeFollowup(); // asks *why* len is O(1)
  const r = validateReasoningNovelty(parent, fu);
  assert(r.ok, "expected mechanism-focused follow-up to pass");
});

// ---------- selectFinalItemsForTier (coverage rule) -------------------------

Deno.test("coverage: Bloom<3 primaries never require a follow-up", () => {
  const primaries = [
    makePrimary({ bloom_level: 1, content_text: "P1" }),
    makePrimary({ bloom_level: 2, content_text: "P2" }),
  ];
  const { chosen, telemetry } = selectFinalItemsForTier({
    spec: { ...TIER, count: 5 },
    primaries,
    followupByIndex: new Map(),
  });
  assertEquals(chosen.length, 2);
  assertEquals(telemetry.failed_dropped, 0);
  assertEquals(telemetry.failed_demoted, 0);
  assertEquals(telemetry.generated, 0);
});

Deno.test("coverage: Bloom≥3 primary with a shipped follow-up is chosen and counted", () => {
  const primaries = [makePrimary({ bloom_level: 3, content_text: "P-b3" })];
  const followupByIndex = new Map<number, FollowupQuestion>([[0, makeFollowup()]]);
  const { chosen, telemetry } = selectFinalItemsForTier({
    spec: { ...TIER, count: 5 },
    primaries,
    followupByIndex,
  });
  assertEquals(chosen.length, 1);
  assertEquals(chosen[0].followup?.content_text, makeFollowup().content_text);
  assertEquals(telemetry.generated, 1);
  assertEquals(telemetry.failed_dropped, 0);
});

Deno.test(
  "coverage: single stalled Bloom-3 primary is demoted to Bloom-2 (within cap) — never shipped as-is",
  () => {
    const primaries = [
      makePrimary({ bloom_level: 3, difficulty_estimate: 0.5, content_text: "stalled-1" }),
    ];
    const { chosen, telemetry } = selectFinalItemsForTier({
      spec: { ...TIER, count: 5 },
      primaries,
      followupByIndex: new Map(),
    });
    assertEquals(chosen.length, 1);
    assertEquals(chosen[0].demoted, true);
    assertEquals(chosen[0].q.bloom_level, 2, "demoted item should be Bloom-2");
    assertEquals(chosen[0].followup, undefined);
    assertEquals(telemetry.failed_demoted, 1);
    assertEquals(telemetry.failed_dropped, 0);
    // Invariant: no shipped Bloom≥3 primary lacks a follow-up.
    for (const c of chosen) {
      assert(!(c.q.bloom_level >= 3 && !c.followup), "shipped Bloom≥3 must have a follow-up");
    }
  },
);

Deno.test(
  "coverage: multiple stalled Bloom-3+ items — demote up to cap, drop the rest",
  () => {
    assertEquals(DEMOTION_CAP_PER_TIER, 1); // pin the current cap
    const primaries = [
      makePrimary({ bloom_level: 3, difficulty_estimate: 0.5, content_text: "stalled-1" }),
      makePrimary({ bloom_level: 3, difficulty_estimate: 0.5, content_text: "stalled-2" }),
      makePrimary({ bloom_level: 4, difficulty_estimate: 0.85, content_text: "stalled-3" }),
    ];
    const { chosen, telemetry } = selectFinalItemsForTier({
      spec: { ...TIER, count: 5 },
      primaries,
      followupByIndex: new Map(),
    });
    // Only one demoted; other stalled items dropped.
    assertEquals(telemetry.failed_demoted, DEMOTION_CAP_PER_TIER);
    assertEquals(
      telemetry.failed_dropped,
      primaries.length - DEMOTION_CAP_PER_TIER,
    );
    // Coverage invariant across the entire chosen set.
    for (const c of chosen) {
      assert(!(c.q.bloom_level >= 3 && !c.followup), "shipped Bloom≥3 must have a follow-up");
    }
  },
);

Deno.test(
  "coverage: two-strike validation → the stalled primary is dropped when demotion cap is spent",
  () => {
    // First stalled item takes the single demotion slot; the second must be dropped
    // rather than shipped as a bare Bloom≥3 primary (Phase 2 hard invariant).
    const primaries = [
      makePrimary({ bloom_level: 3, difficulty_estimate: 0.5, content_text: "takes-demotion" }),
      makePrimary({ bloom_level: 3, difficulty_estimate: 0.5, content_text: "must-be-dropped" }),
    ];
    const { chosen, telemetry } = selectFinalItemsForTier({
      spec: { ...TIER, count: 5 },
      primaries,
      followupByIndex: new Map(),
    });
    const shipStems = new Set(chosen.map((c) => c.q.content_text));
    assert(shipStems.has("takes-demotion"));
    assert(!shipStems.has("must-be-dropped"), "second stalled item must be dropped, not shipped");
    assertEquals(telemetry.failed_demoted, 1);
    assertEquals(telemetry.failed_dropped, 1);
  },
);

Deno.test(
  "coverage: budget-exhaustion case (no follow-ups at all) still drops-or-demotes — never ships bare",
  () => {
    // Simulate the runFollowupPass skipped_budget branch: pass an empty followup map.
    const primaries = [
      makePrimary({ bloom_level: 1, content_text: "b1-safe" }),
      makePrimary({ bloom_level: 3, difficulty_estimate: 0.5, content_text: "b3-stalled" }),
      makePrimary({ bloom_level: 4, difficulty_estimate: 0.85, content_text: "b4-stalled" }),
    ];
    const { chosen, telemetry } = selectFinalItemsForTier({
      spec: { ...TIER, count: 5 },
      primaries,
      followupByIndex: new Map(), // budget skip == no follow-ups delivered
    });
    // Every shipped item is either Bloom<3 or has a follow-up.
    for (const c of chosen) {
      assert(!(c.q.bloom_level >= 3 && !c.followup), "budget-skip must not ship bare Bloom≥3");
    }
    assertEquals(telemetry.generated, 0);
    // 2 Bloom≥3 stalled → 1 demoted + 1 dropped
    assertEquals(telemetry.failed_demoted, 1);
    assertEquals(telemetry.failed_dropped, 1);
  },
);

Deno.test("coverage: capped at spec.count — extras are not shipped", () => {
  const primaries = [
    makePrimary({ bloom_level: 1, content_text: "P1" }),
    makePrimary({ bloom_level: 1, content_text: "P2" }),
    makePrimary({ bloom_level: 1, content_text: "P3" }),
  ];
  const { chosen } = selectFinalItemsForTier({
    spec: { ...TIER, count: 2 },
    primaries,
    followupByIndex: new Map(),
  });
  assertEquals(chosen.length, 2);
});

Deno.test(
  "coverage: mixed run — Bloom≥3 with follow-up counted as generated, extras respect count",
  () => {
    const primaries = [
      makePrimary({ bloom_level: 1, content_text: "P1" }),
      makePrimary({ bloom_level: 3, content_text: "P2-b3" }),
      makePrimary({ bloom_level: 2, content_text: "P3" }),
      makePrimary({ bloom_level: 4, difficulty_estimate: 0.85, content_text: "P4-b4" }),
    ];
    const followupByIndex = new Map<number, FollowupQuestion>([
      [1, makeFollowup({ content_text: "why-P2" })],
      [3, makeFollowup({ content_text: "why-P4", difficulty_estimate: 0.85, bloom_level: 4 })],
    ]);
    const { chosen, telemetry } = selectFinalItemsForTier({
      spec: { ...TIER, count: 5 },
      primaries,
      followupByIndex,
    });
    assertEquals(chosen.length, 4);
    assertEquals(telemetry.generated, 2);
    assertEquals(telemetry.failed_demoted, 0);
    assertEquals(telemetry.failed_dropped, 0);
    for (const c of chosen) {
      assert(!(c.q.bloom_level >= 3 && !c.followup));
    }
  },
);
