/**
 * Pure aggregation helpers for the admin diagnostics dashboard.
 *
 * All inputs are loaded by the caller via supabase-js. Each function is
 * deterministic and side-effect free for easy unit testing.
 *
 * The `diagnostic_results.answers` jsonb is a rich array of per-question
 * records written by DiagnosticQuiz.tsx — each item already carries
 * `is_correct`, `tier`, `topic`, `time_ms`, `confidence`, etc. — so most
 * rollups can be done without joining back to `diagnostic_questions`.
 */

export type LearnerLevel = "beginner" | "developing" | "proficient" | "expert";
export type BranchTier = "easy" | "medium" | "hard";
export type QuestionTier = "standard" | BranchTier;

export interface AnswerItem {
  question_id?: string;
  question_text?: string;
  type?: "mcq" | "true_false" | "short_answer";
  topic?: string | null;
  tier?: QuestionTier;
  selected?: string;
  correct?: string;
  is_correct?: boolean;
  time_ms?: number;
  confidence?: number;
}

export interface DiagnosticResultRow {
  id: string;
  student_id: string;
  course_id: string;
  score: number;
  total_questions: number;
  learner_level: LearnerLevel | string;
  branch_tier: BranchTier | null;
  answers: AnswerItem[];
  question_times: number[];
  confidences: number[];
  created_at: string;
}

export interface CourseRow {
  id: string;
  name: string;
  course_code: string | null;
  teacher_id?: string | null;
}

export interface ProfileRow {
  id: string;
  name: string | null;
  roll_number: string | null;
  email: string | null;
}

export const LEARNER_LEVELS: LearnerLevel[] = ["Beginner", "Progressing", "Proficient", "Expert"];
export const BRANCH_TIERS: BranchTier[] = ["easy", "medium", "hard"];

// ---------- Global KPIs ----------

export interface GlobalKpis {
  totalAttempts: number;
  uniqueStudents: number;
  coursesWithAttempts: number;
  avgScorePct: number; // 0-100
  medianTimePerQuestionMs: number;
  totalQuestionsAnswered: number;
}

export function aggregateGlobalKpis(results: DiagnosticResultRow[]): GlobalKpis {
  const uniqueStudents = new Set(results.map((r) => r.student_id)).size;
  const uniqueCourses = new Set(results.map((r) => r.course_id)).size;

  let scoreSum = 0;
  let scoreWeight = 0;
  const times: number[] = [];
  let qCount = 0;

  for (const r of results) {
    if (r.total_questions > 0) {
      scoreSum += (r.score / r.total_questions) * 100;
      scoreWeight += 1;
    }
    qCount += r.total_questions || 0;
    if (Array.isArray(r.question_times)) {
      for (const t of r.question_times) {
        if (typeof t === "number" && t > 0) times.push(t);
      }
    }
  }

  return {
    totalAttempts: results.length,
    uniqueStudents,
    coursesWithAttempts: uniqueCourses,
    avgScorePct: scoreWeight ? scoreSum / scoreWeight : 0,
    medianTimePerQuestionMs: median(times),
    totalQuestionsAnswered: qCount,
  };
}

// ---------- Distributions ----------

export function aggregateLevelDistribution(results: DiagnosticResultRow[]): Record<LearnerLevel, number> {
  const out: Record<LearnerLevel, number> = {
    Beginner: 0,
    Progressing: 0,
    Proficient: 0,
    Expert: 0,
  };
  for (const r of results) {
    if ((LEARNER_LEVELS as string[]).includes(r.learner_level)) {
      out[r.learner_level as LearnerLevel] += 1;
    }
  }
  return out;
}

export function aggregateBranchTierDistribution(
  results: DiagnosticResultRow[],
): Record<BranchTier | "none", number> {
  const out: Record<BranchTier | "none", number> = { easy: 0, medium: 0, hard: 0, none: 0 };
  for (const r of results) {
    if (r.branch_tier && (BRANCH_TIERS as string[]).includes(r.branch_tier)) {
      out[r.branch_tier] += 1;
    } else {
      out.none += 1;
    }
  }
  return out;
}

// ---------- Course rollup ----------

export interface CourseSummary {
  courseId: string;
  courseCode: string | null;
  courseName: string;
  attempts: number;
  uniqueStudents: number;
  avgScorePct: number;
  avgStandardScorePct: number;
  tierMix: Record<BranchTier | "none", number>;
  levelMix: Record<LearnerLevel, number>;
  lastAttemptAt: string | null;
}

export function aggregateByCourse(
  results: DiagnosticResultRow[],
  courses: CourseRow[],
): CourseSummary[] {
  const byCourse = new Map<string, DiagnosticResultRow[]>();
  for (const r of results) {
    const arr = byCourse.get(r.course_id) ?? [];
    arr.push(r);
    byCourse.set(r.course_id, arr);
  }

  const courseLookup = new Map(courses.map((c) => [c.id, c]));
  const out: CourseSummary[] = [];

  for (const [courseId, rows] of byCourse) {
    const c = courseLookup.get(courseId);
    let scoreSum = 0;
    let scoreWeight = 0;
    let stdSum = 0;
    let stdWeight = 0;
    let lastAt: string | null = null;
    const studentSet = new Set<string>();

    for (const r of rows) {
      if (r.total_questions > 0) {
        scoreSum += (r.score / r.total_questions) * 100;
        scoreWeight += 1;
      }
      const std = (r.answers || []).filter((a) => a?.tier === "standard");
      const stdCorrect = std.filter((a) => a?.is_correct).length;
      if (std.length > 0) {
        stdSum += (stdCorrect / std.length) * 100;
        stdWeight += 1;
      }
      studentSet.add(r.student_id);
      if (!lastAt || r.created_at > lastAt) lastAt = r.created_at;
    }

    out.push({
      courseId,
      courseCode: c?.course_code ?? null,
      courseName: c?.name ?? "Unknown course",
      attempts: rows.length,
      uniqueStudents: studentSet.size,
      avgScorePct: scoreWeight ? scoreSum / scoreWeight : 0,
      avgStandardScorePct: stdWeight ? stdSum / stdWeight : 0,
      tierMix: aggregateBranchTierDistribution(rows),
      levelMix: aggregateLevelDistribution(rows),
      lastAttemptAt: lastAt,
    });
  }

  return out.sort((a, b) => b.attempts - a.attempts);
}

// ---------- Time series ----------

export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  attempts: number;
  avgScorePct: number;
}

export function timeSeriesOverall(
  results: DiagnosticResultRow[],
  days: number,
  now: Date = new Date(),
): TimeSeriesPoint[] {
  const buckets = new Map<string, { count: number; scoreSum: number; scoreWeight: number }>();
  const end = startOfDay(now);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    buckets.set(isoDate(d), { count: 0, scoreSum: 0, scoreWeight: 0 });
  }
  const cutoff = new Date(end);
  cutoff.setDate(end.getDate() - (days - 1));

  for (const r of results) {
    const d = new Date(r.created_at);
    if (d < cutoff) continue;
    const key = isoDate(startOfDay(d));
    const b = buckets.get(key);
    if (!b) continue;
    b.count += 1;
    if (r.total_questions > 0) {
      b.scoreSum += (r.score / r.total_questions) * 100;
      b.scoreWeight += 1;
    }
  }

  return Array.from(buckets.entries()).map(([date, b]) => ({
    date,
    attempts: b.count,
    avgScorePct: b.scoreWeight ? b.scoreSum / b.scoreWeight : 0,
  }));
}

// ---------- Concept / tier rollups from answers[] ----------

export interface ConceptPerformance {
  topic: string;
  attempted: number;
  correct: number;
  accuracyPct: number;
}

export function aggregateConceptPerformance(results: DiagnosticResultRow[]): ConceptPerformance[] {
  const agg = new Map<string, { attempted: number; correct: number }>();
  for (const r of results) {
    for (const a of r.answers || []) {
      const topic = (a?.topic || "Uncategorized").toString();
      const cur = agg.get(topic) ?? { attempted: 0, correct: 0 };
      cur.attempted += 1;
      if (a?.is_correct) cur.correct += 1;
      agg.set(topic, cur);
    }
  }
  return Array.from(agg.entries())
    .map(([topic, v]) => ({
      topic,
      attempted: v.attempted,
      correct: v.correct,
      accuracyPct: v.attempted ? (v.correct / v.attempted) * 100 : 0,
    }))
    .sort((a, b) => a.accuracyPct - b.accuracyPct);
}

export interface TierAccuracy {
  tier: QuestionTier;
  attempted: number;
  correct: number;
  accuracyPct: number;
}

export function aggregateTierAccuracy(results: DiagnosticResultRow[]): TierAccuracy[] {
  const tiers: QuestionTier[] = ["standard", "easy", "medium", "hard"];
  const agg: Record<QuestionTier, { attempted: number; correct: number }> = {
    standard: { attempted: 0, correct: 0 },
    easy: { attempted: 0, correct: 0 },
    medium: { attempted: 0, correct: 0 },
    hard: { attempted: 0, correct: 0 },
  };
  for (const r of results) {
    for (const a of r.answers || []) {
      const t = a?.tier;
      if (!t || !(t in agg)) continue;
      agg[t].attempted += 1;
      if (a?.is_correct) agg[t].correct += 1;
    }
  }
  return tiers.map((t) => ({
    tier: t,
    attempted: agg[t].attempted,
    correct: agg[t].correct,
    accuracyPct: agg[t].attempted ? (agg[t].correct / agg[t].attempted) * 100 : 0,
  }));
}

// ---------- Helpers ----------

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}
