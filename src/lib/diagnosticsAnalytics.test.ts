import { describe, it, expect } from "vitest";
import {
  aggregateGlobalKpis,
  aggregateLevelDistribution,
  aggregateBranchTierDistribution,
  aggregateByCourse,
  aggregateConceptPerformance,
  aggregateTierAccuracy,
  timeSeriesOverall,
  median,
  toCsv,
  type DiagnosticResultRow,
  type CourseRow,
} from "./diagnosticsAnalytics";

function mkResult(over: Partial<DiagnosticResultRow> = {}): DiagnosticResultRow {
  return {
    id: "r" + Math.random(),
    student_id: "s1",
    course_id: "c1",
    score: 15,
    total_questions: 20,
    learner_level: "proficient",
    branch_tier: "medium",
    answers: [],
    question_times: [],
    confidences: [],
    created_at: new Date().toISOString(),
    ...over,
  };
}

describe("median", () => {
  it("handles empty", () => expect(median([])).toBe(0));
  it("odd", () => expect(median([3, 1, 2])).toBe(2));
  it("even", () => expect(median([1, 2, 3, 4])).toBe(2.5));
});

describe("aggregateGlobalKpis", () => {
  it("empty input", () => {
    const k = aggregateGlobalKpis([]);
    expect(k).toEqual({
      totalAttempts: 0,
      uniqueStudents: 0,
      coursesWithAttempts: 0,
      avgScorePct: 0,
      medianTimePerQuestionMs: 0,
      totalQuestionsAnswered: 0,
    });
  });
  it("aggregates students/courses/score/time", () => {
    const r = [
      mkResult({ student_id: "s1", course_id: "c1", score: 10, total_questions: 20, question_times: [1000, 2000] }),
      mkResult({ student_id: "s2", course_id: "c1", score: 20, total_questions: 20, question_times: [3000] }),
      mkResult({ student_id: "s1", course_id: "c2", score: 5, total_questions: 10, question_times: [] }),
    ];
    const k = aggregateGlobalKpis(r);
    expect(k.totalAttempts).toBe(3);
    expect(k.uniqueStudents).toBe(2);
    expect(k.coursesWithAttempts).toBe(2);
    // (50 + 100 + 50) / 3
    expect(k.avgScorePct).toBeCloseTo(66.67, 1);
    expect(k.medianTimePerQuestionMs).toBe(2000);
    expect(k.totalQuestionsAnswered).toBe(50);
  });
});

describe("aggregateLevelDistribution", () => {
  it("counts known levels and ignores unknown", () => {
    const dist = aggregateLevelDistribution([
      mkResult({ learner_level: "beginner" }),
      mkResult({ learner_level: "expert" }),
      mkResult({ learner_level: "expert" }),
      mkResult({ learner_level: "weird" as any }),
    ]);
    expect(dist).toEqual({ beginner: 1, developing: 0, proficient: 0, expert: 2 });
  });
});

describe("aggregateBranchTierDistribution", () => {
  it("buckets null as none", () => {
    const dist = aggregateBranchTierDistribution([
      mkResult({ branch_tier: "easy" }),
      mkResult({ branch_tier: null }),
      mkResult({ branch_tier: "hard" }),
      mkResult({ branch_tier: "hard" }),
    ]);
    expect(dist).toEqual({ easy: 1, medium: 0, hard: 2, none: 1 });
  });
});

describe("aggregateByCourse", () => {
  it("rolls up per course with standard-phase score from answers", () => {
    const courses: CourseRow[] = [
      { id: "c1", name: "Intro to Python", course_code: "CS101" },
    ];
    const std = (correct: boolean) => ({ tier: "standard" as const, is_correct: correct });
    const r = [
      mkResult({
        course_id: "c1",
        student_id: "s1",
        score: 12,
        total_questions: 20,
        answers: [std(true), std(true), std(false), { tier: "easy", is_correct: true }],
        branch_tier: "easy",
      }),
      mkResult({
        course_id: "c1",
        student_id: "s2",
        score: 18,
        total_questions: 20,
        answers: [std(true), std(true), std(true), std(true)],
        branch_tier: "hard",
      }),
    ];
    const out = aggregateByCourse(r, courses);
    expect(out).toHaveLength(1);
    const c = out[0];
    expect(c.courseCode).toBe("CS101");
    expect(c.attempts).toBe(2);
    expect(c.uniqueStudents).toBe(2);
    expect(c.avgScorePct).toBeCloseTo(75, 1); // (60+90)/2
    // Standard avg: r1 = 2/3 ≈ 66.67, r2 = 4/4 = 100 → 83.33
    expect(c.avgStandardScorePct).toBeCloseTo(83.33, 1);
    expect(c.tierMix.easy).toBe(1);
    expect(c.tierMix.hard).toBe(1);
  });

  it("handles unknown courseId gracefully", () => {
    const out = aggregateByCourse([mkResult({ course_id: "ghost" })], []);
    expect(out[0].courseName).toBe("Unknown course");
  });
});

describe("aggregateConceptPerformance", () => {
  it("buckets by topic and sorts weakest first", () => {
    const r = [
      mkResult({
        answers: [
          { topic: "loops", is_correct: true },
          { topic: "loops", is_correct: false },
          { topic: "variables", is_correct: true },
          { topic: "variables", is_correct: true },
          { topic: null, is_correct: false },
        ],
      }),
    ];
    const out = aggregateConceptPerformance(r);
    expect(out[0].topic).toBe("Uncategorized");
    expect(out[0].accuracyPct).toBe(0);
    const loops = out.find((x) => x.topic === "loops")!;
    expect(loops.attempted).toBe(2);
    expect(loops.correct).toBe(1);
    expect(loops.accuracyPct).toBe(50);
    const vars = out.find((x) => x.topic === "variables")!;
    expect(vars.accuracyPct).toBe(100);
  });
});

describe("aggregateTierAccuracy", () => {
  it("returns all four tiers even when empty", () => {
    const out = aggregateTierAccuracy([]);
    expect(out.map((x) => x.tier)).toEqual(["standard", "easy", "medium", "hard"]);
    expect(out.every((x) => x.attempted === 0 && x.accuracyPct === 0)).toBe(true);
  });
  it("computes per-tier accuracy", () => {
    const r = [
      mkResult({
        answers: [
          { tier: "standard", is_correct: true },
          { tier: "standard", is_correct: false },
          { tier: "hard", is_correct: true },
        ],
      }),
    ];
    const out = aggregateTierAccuracy(r);
    expect(out.find((x) => x.tier === "standard")!.accuracyPct).toBe(50);
    expect(out.find((x) => x.tier === "hard")!.accuracyPct).toBe(100);
    expect(out.find((x) => x.tier === "easy")!.attempted).toBe(0);
  });
});

describe("timeSeriesOverall", () => {
  it("creates a bucket per day and aggregates", () => {
    const now = new Date("2026-06-05T12:00:00Z");
    const r = [
      mkResult({ score: 10, total_questions: 20, created_at: "2026-06-05T08:00:00Z" }),
      mkResult({ score: 20, total_questions: 20, created_at: "2026-06-05T20:00:00Z" }),
      mkResult({ score: 5, total_questions: 10, created_at: "2026-06-04T10:00:00Z" }),
      mkResult({ score: 5, total_questions: 10, created_at: "2026-01-01T00:00:00Z" }), // out of range
    ];
    const out = timeSeriesOverall(r, 7, now);
    expect(out).toHaveLength(7);
    const total = out.reduce((s, p) => s + p.attempts, 0);
    expect(total).toBe(3);
  });
});

describe("toCsv", () => {
  it("escapes commas and quotes", () => {
    const csv = toCsv(["a", "b"], [["hello, world", 'he said "hi"'], [null, 42]]);
    expect(csv).toBe('a,b\n"hello, world","he said ""hi"""\n,42');
  });
});
