/**
 * Compatibility shim.
 *
 * The reasoning-scoring math now lives in `./attempt-scoring.ts`, which is the
 * single source of truth shared by every edge function and the browser.
 */

export {
  REASONING_BLOOM_THRESHOLD,
  REASONING_SCORING_ENABLED,
  REASONING_PARTIAL_FACTOR,
  requiresReasoning,
  reasoningEarnedFactor,
} from "./attempt-scoring.ts";

export type { ReasoningVerdict } from "./attempt-scoring.ts";
