/**
 * Career Readiness (employment pathway, formerly "Soft Skills") is organised
 * into three professor-assigned steps.
 */
export type CareerReadinessStep = "understand" | "prepare" | "practice";

export const CAREER_READINESS_STEPS: {
  key: CareerReadinessStep;
  index: number;
  title: string;
  subtitle: string;
}[] = [
  { key: "understand", index: 1, title: "Understand", subtitle: "Know what's coming" },
  { key: "prepare", index: 2, title: "Prepare", subtitle: "Build your stories" },
  { key: "practice", index: 3, title: "Practice", subtitle: "Rehearse & improve" },
];

/** Modules without a professor-set step fall back to Understand. */
export const normalizeStep = (value: unknown): CareerReadinessStep =>
  value === "prepare" || value === "practice" ? value : "understand";

/** Type guard for deep links (?step=…). */
export const isCareerReadinessStep = (value: unknown): value is CareerReadinessStep =>
  value === "understand" || value === "prepare" || value === "practice";
