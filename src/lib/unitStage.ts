import type { LearningPlanWeek } from "@/hooks/useLearningPlan";
import { READINESS_THRESHOLD } from "@/hooks/useUnitReadiness";

export type UnitStage = "not_started" | "studied" | "practised" | "needs_work" | "ready";

export interface UnitStageInput {
  studied: boolean;
  practised: boolean;
  quizTaken: boolean;
  readiness: number;
  /** Coding/lab units have no weekly quiz — readiness comes from study + practice. */
  quizExempt?: boolean;
}

/**
 * Single source of truth for "where is the student in this unit?".
 * Home and the Learning Path both derive their copy from this, so the two
 * surfaces can never disagree on the next move.
 */
export function computeUnitStage({ studied, practised, quizTaken, readiness, quizExempt }: UnitStageInput): UnitStage {
  if (quizExempt) {
    // No quiz gates these units: reaching the readiness threshold via
    // practice marks the unit ready (requires some activity first so
    // diagnostic-seeded mastery alone doesn't auto-complete a unit).
    if ((studied || practised) && readiness >= READINESS_THRESHOLD) return "ready";
    if (practised) return "practised";
    if (studied) return "studied";
    return "not_started";
  }
  if (quizTaken) return readiness >= READINESS_THRESHOLD ? "ready" : "needs_work";
  if (practised) return "practised";
  if (studied) return "studied";
  return "not_started";
}

/** Normalised text used for loose topic/concept matching. */
export const normaliseConcept = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Terms that identify a unit: its topic plus its concept names. */
export function unitTerms(week: Pick<LearningPlanWeek, "topic" | "concepts">): string[] {
  const terms = [week.topic, ...((week.concepts || []).map((c) => c?.name) as (string | undefined)[])];
  return terms
    .filter((t): t is string => typeof t === "string" && t.trim().length > 2)
    .map(normaliseConcept)
    .filter(Boolean);
}

/** True when free text references any of the unit's terms. */
export function textMatchesUnit(text: string | null | undefined, terms: string[]): boolean {
  if (!text) return false;
  const haystack = normaliseConcept(text);
  if (!haystack) return false;
  return terms.some((term) => haystack.includes(term) || term.includes(haystack));
}
