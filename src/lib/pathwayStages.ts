/**
 * Employment-pathway staging.
 *
 * Employment courses present their Learning Path as four stages rather than a
 * flat list of units. Stage 1/2 are technical units the professor assigned;
 * stage 3 is the published Soft Skills modules; stage 4 is the published
 * Project Labs (capstone).
 */

export type TechnicalStage = "foundations" | "advanced";
export type StageKind = TechnicalStage | "soft_skills" | "capstone";
export type StageStatus = "complete" | "in_progress" | "locked";

export interface PathwayStage {
  /** 1-based stage number shown in the circle. */
  index: number;
  kind: StageKind;
  title: string;
  /** Short pill next to the title, e.g. "Technical". */
  badge: string;
  description: string;
  /** Unit numbers in this stage (technical stages only). */
  days: number[];
  itemCount: number;
  completeCount: number;
  /** "units" | "modules" | "milestones" */
  countNoun: string;
  hours: number | null;
  status: StageStatus;
}

export interface BuildPathwayStagesInput {
  /** Unit numbers in order. */
  days: number[];
  /** Professor-assigned stage per unit, when set. */
  stageByDay: Record<number, string | null | undefined>;
  /** Professor-entered hours per unit, when set. */
  hoursByDay: Record<number, number | null | undefined>;
  /** Units that reached the readiness goal. */
  doneDays: ReadonlySet<number>;
  softSkillsCount: number;
  softSkillsHours: number | null;
  capstoneCount: number;
  capstoneHours: number | null;
}

export interface PathwayStagesResult {
  stages: PathwayStage[];
  /** 0-100 across every stage item. */
  overallPct: number;
  totalHours: number | null;
}

/**
 * Resolve each unit's stage. Units without a professor-set stage fall back to
 * a first-half / second-half split so the page is never empty.
 */
export function resolveUnitStages(
  days: number[],
  stageByDay: Record<number, string | null | undefined>,
): Record<number, TechnicalStage> {
  const midpoint = Math.ceil(days.length / 2);
  const out: Record<number, TechnicalStage> = {};
  days.forEach((day, i) => {
    const raw = stageByDay[day];
    out[day] = raw === "advanced" ? "advanced" : raw === "foundations" ? "foundations" : i < midpoint ? "foundations" : "advanced";
  });
  return out;
}

const sumHours = (values: (number | null | undefined)[]): number | null => {
  const nums = values.filter((v): v is number => typeof v === "number" && v > 0);
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : null;
};

export function buildPathwayStages(input: BuildPathwayStagesInput): PathwayStagesResult {
  const assigned = resolveUnitStages(input.days, input.stageByDay);
  const foundationDays = input.days.filter((d) => assigned[d] === "foundations");
  const advancedDays = input.days.filter((d) => assigned[d] === "advanced");

  const technical = (
    index: number,
    kind: TechnicalStage,
    title: string,
    description: string,
    stageDays: number[],
  ): Omit<PathwayStage, "status"> => ({
    index,
    kind,
    title,
    badge: "Technical",
    description,
    days: stageDays,
    itemCount: stageDays.length,
    completeCount: stageDays.filter((d) => input.doneDays.has(d)).length,
    countNoun: "units",
    hours: sumHours(stageDays.map((d) => input.hoursByDay[d])),
  });

  const base: Omit<PathwayStage, "status">[] = [
    technical(1, "foundations", "Stage 1 · Foundations", "Core programming, tools, and fundamentals.", foundationDays),
    technical(2, "advanced", "Stage 2 · Advanced Technical", "Deeper skills, frameworks, and applied projects.", advancedDays),
    {
      index: 3,
      kind: "soft_skills",
      title: "Stage 3 · Soft Skills & Interview Prep",
      badge: "Soft Skills",
      description: "Interview structure, interview prep, and mock interviews — a different format from technical units.",
      days: [],
      itemCount: input.softSkillsCount,
      completeCount: 0,
      countNoun: "modules",
      hours: input.softSkillsHours ?? null,
    },
    {
      index: 4,
      kind: "capstone",
      title: "Stage 4 · Capstone Project",
      badge: "Capstone",
      description: "Build and present a portfolio-ready project.",
      days: [],
      itemCount: input.capstoneCount,
      completeCount: 0,
      countNoun: "milestones",
      hours: input.capstoneHours ?? null,
    },
  ];

  let previousComplete = true;
  const stages: PathwayStage[] = base.map((s) => {
    const complete = s.itemCount > 0 && s.completeCount >= s.itemCount;
    const status: StageStatus = complete ? "complete" : previousComplete ? "in_progress" : "locked";
    previousComplete = previousComplete && complete;
    return { ...s, status };
  });

  const totalItems = stages.reduce((a, s) => a + s.itemCount, 0);
  const doneItems = stages.reduce((a, s) => a + s.completeCount, 0);
  const overallPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  return {
    stages,
    overallPct,
    totalHours: sumHours(stages.map((s) => s.hours)),
  };
}
