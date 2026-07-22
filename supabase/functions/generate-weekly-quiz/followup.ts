/**
 * Pure follow-up helpers extracted from index.ts so they can be unit-tested
 * without spinning up the AI gateway or DB. Keep this file dependency-light —
 * only the shared validator module is imported.
 *
 * Two things live here:
 *   1. validateReasoningNovelty — rejects follow-ups whose stem/answer are
 *      near-duplicates of the parent (Phase 2 quality rule).
 *   2. selectFinalItemsForTier — the coverage rule that turns generated
 *      primaries + optional follow-ups into the shipped set for one tier,
 *      handling demote-vs-drop for Bloom≥3 primaries without a follow-up.
 *
 * Tests in ./followup_test.ts pin the invariants Phase 2 requires:
 *   - No shipped Bloom≥3 primary silently lacks a follow-up.
 *   - Demotion is capped per tier; excess stalled items are dropped.
 *   - Skipped-budget case behaves identically to per-item follow-up failure.
 */

import { isLikelyDuplicate, validateBloom } from "../_shared/question-validation.ts";

// Structural duplicates of the interfaces in index.ts. TypeScript structural
// typing means these are compatible at the call site.
export interface GeneratedQuestion {
  content_text: string;
  format: "mcq" | "true_false";
  options: string[];
  answer: string;
  difficulty_estimate: number;
  bloom_level: number;
  explanation: string;
  topic: string;
}

export interface FollowupQuestion {
  content_text: string;
  format: "mcq";
  options: string[];
  answer: string;
  difficulty_estimate: number;
  bloom_level: number;
  explanation: string;
  topic: string;
}

export type Tier = "standard" | "easy" | "medium" | "hard";

export interface TierSpec {
  tier: Tier;
  count: number;
  difficulty: number;
  label: string;
  batchSize: number;
  perCallTimeoutMs: number;
  maxAttempts: number;
  reserveExtras: number;
}

/**
 * Reject follow-ups whose stem is a near-duplicate of the parent stem, or
 * whose correct answer is a trivial paraphrase of the parent's answer.
 * Reuses the shared dedup heuristic so the threshold matches the rest of
 * the validation pipeline.
 */
export function validateReasoningNovelty(
  parent: GeneratedQuestion,
  followup: FollowupQuestion,
): { ok: true } | { ok: false; reason: string } {
  const parentAsDedup = {
    content_text: parent.content_text,
    answer: parent.answer,
    topic: parent.topic,
  };
  const fuAsDedup = {
    content_text: followup.content_text,
    answer: followup.answer,
    topic: followup.topic,
  };
  if (isLikelyDuplicate(parentAsDedup, fuAsDedup)) {
    return { ok: false, reason: "follow-up stem/answer too similar to parent" };
  }
  const pa = parent.answer.trim().toLowerCase();
  const fa = followup.answer.trim().toLowerCase();
  if (pa && pa === fa) {
    return { ok: false, reason: "follow-up answer identical to parent answer" };
  }
  return { ok: true };
}

export interface FinalItem {
  spec: TierSpec;
  q: GeneratedQuestion;
  followup?: FollowupQuestion;
  demoted: boolean;
}

export interface TierSelectionTelemetry {
  generated: number;
  failed_dropped: number;
  failed_demoted: number;
}

export interface TierSelectionInput {
  spec: TierSpec;
  /** All generated primaries for the tier, in preferred order. */
  primaries: GeneratedQuestion[];
  /** Follow-up for a primary by its index in `primaries`. Missing = failed / not shipped. */
  followupByIndex: Map<number, FollowupQuestion>;
}

export const DEMOTION_CAP_PER_TIER = 1;

/**
 * Coverage rule: pick up to spec.count primaries for one tier. Prefer items
 * that don't need a follow-up OR whose follow-up succeeded. Stalled Bloom≥3
 * items are demoted to Bloom-2 up to DEMOTION_CAP_PER_TIER; the rest are
 * dropped. Never ships a Bloom≥3 primary silently lacking a follow-up.
 */
export function selectFinalItemsForTier(
  input: TierSelectionInput,
): { chosen: FinalItem[]; telemetry: TierSelectionTelemetry } {
  const { spec, primaries, followupByIndex } = input;
  const telemetry: TierSelectionTelemetry = { generated: 0, failed_dropped: 0, failed_demoted: 0 };

  const items = primaries.map((q, i) => {
    const needsFu = q.bloom_level >= 3;
    const fu = followupByIndex.get(i);
    return { q, needsFu, fu };
  });

  const ready = items.filter((x) => !x.needsFu || x.fu);
  const stalled = items.filter((x) => x.needsFu && !x.fu);

  const chosen: FinalItem[] = [];
  for (const r of ready) {
    if (chosen.length >= spec.count) break;
    chosen.push({ spec, q: r.q, followup: r.fu, demoted: false });
    if (r.fu) telemetry.generated++;
  }

  let demotions = 0;
  for (const s of stalled) {
    if (chosen.length >= spec.count) break;
    if (demotions >= DEMOTION_CAP_PER_TIER) break;
    const demoteCheck = validateBloom(2, {
      min: 1,
      max: 4,
      enforceDifficultyConsistency: true,
      difficulty: s.q.difficulty_estimate,
    });
    if (!demoteCheck.ok) continue;
    chosen.push({ spec, q: { ...s.q, bloom_level: 2 }, demoted: true });
    demotions++;
    telemetry.failed_demoted++;
  }

  const chosenStems = new Set(chosen.map((c) => c.q.content_text));
  for (const s of stalled) {
    if (!chosenStems.has(s.q.content_text)) telemetry.failed_dropped++;
  }

  return { chosen, telemetry };
}
