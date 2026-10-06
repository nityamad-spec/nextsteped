/** Curriculum-vs-jobs skill coverage scoring. */
export type SkillLevel = "basic" | "working" | "advanced";
export type JobTier = "accessible" | "moderate" | "competitive";
export type JobSkill = { skill: string; level: SkillLevel };
export type CoverageJob = { id: string; title: string; company: string; tier: JobTier; skills: JobSkill[] };

const RANK: Record<SkillLevel, number> = { basic: 1, working: 2, advanced: 3 };
export const normSkill = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();

export type SkillStatus = "covered" | "partial" | "missing";

export function skillStatus(required: SkillLevel, taught: SkillLevel | undefined): SkillStatus {
  if (!taught) return "missing";
  return RANK[taught] >= RANK[required] ? "covered" : "partial";
}

/** Highest taught level per normalised skill name. */
export function taughtMap(tags: { skill: string; level: SkillLevel }[]): Map<string, SkillLevel> {
  const m = new Map<string, SkillLevel>();
  for (const t of tags) {
    const k = normSkill(t.skill);
    const cur = m.get(k);
    if (!cur || RANK[t.level] > RANK[cur]) m.set(k, t.level);
  }
  return m;
}

export type JobCoverage = {
  job: CoverageJob;
  score: number; // 0..1
  rows: { skill: string; required: SkillLevel; taught?: SkillLevel; status: SkillStatus }[];
};

export function computeCoverage(jobs: CoverageJob[], tags: { skill: string; level: SkillLevel }[]) {
  const taught = taughtMap(tags);
  const perJob: JobCoverage[] = jobs.map((job) => {
    const rows = job.skills.map((s) => {
      const t = taught.get(normSkill(s.skill));
      return { skill: s.skill, required: s.level, taught: t, status: skillStatus(s.level, t) };
    });
    const pts = rows.reduce((a, r) => a + (r.status === "covered" ? 1 : r.status === "partial" ? 0.5 : 0), 0);
    return { job, rows, score: rows.length ? pts / rows.length : 1 };
  });

  const avg = (xs: JobCoverage[]) => (xs.length ? xs.reduce((a, x) => a + x.score, 0) / xs.length : 0);
  const byTier = (["accessible", "moderate", "competitive"] as JobTier[]).map((tier) => {
    const xs = perJob.filter((p) => p.job.tier === tier);
    return { tier, jobs: xs.length, pct: Math.round(avg(xs) * 100) };
  });

  const gaps = new Map<string, { skill: string; jobs: number; kind: "Not taught" | "Needs more depth" }>();
  const covered = new Map<string, string>();
  for (const p of perJob) {
    for (const r of p.rows) {
      const k = normSkill(r.skill);
      if (r.status === "covered") {
        if (!covered.has(k)) covered.set(k, r.skill);
        continue;
      }
      const g = gaps.get(k) ?? { skill: r.skill, jobs: 0, kind: r.status === "missing" ? "Not taught" : "Needs more depth" };
      g.jobs += 1;
      gaps.set(k, g);
    }
  }
  for (const k of gaps.keys()) covered.delete(k);

  return {
    overallPct: Math.round(avg(perJob) * 100),
    fullyCovered: perJob.filter((p) => p.score >= 0.999).length,
    total: perJob.length,
    byTier,
    gaps: [...gaps.values()].sort((a, b) => b.jobs - a.jobs || a.skill.localeCompare(b.skill)),
    covered: [...covered.values()].sort(),
    perJob: perJob.sort((a, b) => a.score - b.score),
  };
}

export const TIER_LABEL: Record<JobTier, string> = { accessible: "Accessible", moderate: "Moderate", competitive: "Competitive" };
