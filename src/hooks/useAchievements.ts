import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MasteryLevel = "not_explored" | "beginner" | "developing" | "proficient" | "expert";

export const getMasteryLevel = (attempted: number, score: number): MasteryLevel => {
  if (attempted === 0) return "not_explored";
  if (score <= 0.25) return "beginner";
  if (score <= 0.5) return "developing";
  if (score <= 0.75) return "proficient";
  return "expert";
};

export interface AchievementStep {
  label: string;
  done: boolean;
}

export interface Achievement {
  id: string;
  label: string;
  emoji: string;
  earned: boolean;
  tooltip: string;
  howTo: {
    title: string;
    steps: AchievementStep[];
  };
}

const isoYearWeekOf = (d: Date): string => {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

const previousIsoYearWeek = (d: Date = new Date()): string => {
  const prev = new Date(d);
  prev.setUTCDate(prev.getUTCDate() - 7);
  return isoYearWeekOf(prev);
};

const lpOpenedKey = (courseId: string | null | undefined) =>
  `student:lp-opened:${courseId ?? "none"}:${isoYearWeekOf(new Date())}`;

const baselineKey = (studentId: string, conceptId: string) =>
  `student:mastery-baseline:${studentId}:${conceptId}`;

export const useAchievements = (
  courseId: string | null | undefined,
  studentId: string | null | undefined,
  concepts: { id: string; name: string }[],
  conceptMastery: Record<string, { score: number; attempted: number }>,
) => {
  // Snapshot the earliest observed mastery level per concept (client-side baseline).
  useEffect(() => {
    if (!studentId) return;
    for (const c of concepts) {
      const m = conceptMastery[c.id];
      if (!m) continue;
      const key = baselineKey(studentId, c.id);
      try {
        if (!localStorage.getItem(key)) {
          const level = getMasteryLevel(m.attempted, m.score);
          localStorage.setItem(key, level);
        }
      } catch { /* ignore */ }
    }
  }, [studentId, concepts, conceptMastery]);

  const { data: quizRows } = useQuery({
    queryKey: ["achievements-quiz-rows", courseId, studentId],
    enabled: !!courseId && !!studentId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_results")
        .select("created_at, quiz_day, mode")
        .eq("course_id", courseId!)
        .eq("student_id", studentId!)
        .eq("mode", "daily_quiz");
      if (error) throw error;
      return data ?? [];
    },
  });

  return useMemo<{ achievements: Achievement[]; earnedCount: number }>(() => {
    const rows = quizRows ?? [];
    const hasWeek1Quiz = rows.some((r) => r.quiz_day === 1) || (rows.length > 0 && !rows.some((r) => r.quiz_day && r.quiz_day > 1));
    const openedLpThisWeek = (() => {
      try { return !!localStorage.getItem(lpOpenedKey(courseId)); } catch { return false; }
    })();

    // First Steps
    const firstSteps: Achievement = {
      id: "first-steps",
      label: "First Steps",
      emoji: "🚀",
      earned: hasWeek1Quiz && openedLpThisWeek,
      tooltip: `Complete Unit 1: weekly quiz ${hasWeek1Quiz ? "✓" : "✗"} · readings ${openedLpThisWeek ? "✓" : "✗"}`,
      howTo: {
        title: "Complete Unit 1 basics",
        steps: [
          { label: "Take the Week 1 quiz", done: hasWeek1Quiz },
          { label: "Open this week's Learning Path readings", done: openedLpThisWeek },
        ],
      },
    };

    // Comeback — any concept whose baseline was beginner and current is expert
    let comebackConcept: string | null = null;
    let promotedCount = 0;
    let bestJump: { name: string; from: MasteryLevel; to: MasteryLevel; delta: number } | null = null;
    const LEVEL_RANK: Record<MasteryLevel, number> = {
      not_explored: 0, beginner: 1, developing: 2, proficient: 3, expert: 4,
    };
    if (studentId) {
      for (const c of concepts) {
        const m = conceptMastery[c.id];
        if (!m) continue;
        const current = getMasteryLevel(m.attempted, m.score);
        let baseline: MasteryLevel | null = null;
        try {
          const raw = localStorage.getItem(baselineKey(studentId, c.id));
          if (raw && raw in LEVEL_RANK) baseline = raw as MasteryLevel;
        } catch { /* ignore */ }
        if (baseline === "beginner" && current === "expert") {
          promotedCount += 1;
          if (!comebackConcept) comebackConcept = c.name;
        }
        if (baseline) {
          const delta = LEVEL_RANK[current] - LEVEL_RANK[baseline];
          if (delta > 0 && (!bestJump || delta > bestJump.delta)) {
            bestJump = { name: c.name, from: baseline, to: current, delta };
          }
        }
      }
    }
    const LEVEL_LABEL: Record<MasteryLevel, string> = {
      not_explored: "Not explored",
      beginner: "Beginner",
      developing: "Developing",
      proficient: "Proficient",
      expert: "Expert",
    };
    const comebackHint = bestJump
      ? `Best jump so far: ${bestJump.name} (${LEVEL_LABEL[bestJump.from]} → ${LEVEL_LABEL[bestJump.to]})`
      : "No concept promoted yet — keep practicing your weakest topics";
    const comeback: Achievement = {
      id: "comeback",
      label: "Comeback",
      emoji: "↗",
      earned: promotedCount > 0,
      tooltip: promotedCount > 0
        ? `Earned via ${comebackConcept} (Beginner → Expert)`
        : "Grow any concept from Beginner to Expert",
      howTo: {
        title: "Grow any concept from Beginner to Expert",
        steps: [
          { label: comebackHint, done: false },
        ],
      },
    };

    // Consistency — quiz submitted this ISO week and the previous ISO week
    const thisWk = isoYearWeekOf(new Date());
    const prevWk = previousIsoYearWeek(new Date());
    const weeksWithQuiz = new Set(rows.map((r) => isoYearWeekOf(new Date(r.created_at))));
    const tookThisWk = weeksWithQuiz.has(thisWk);
    const tookPrevWk = weeksWithQuiz.has(prevWk);
    const consistencyCount = (tookThisWk ? 1 : 0) + (tookPrevWk ? 1 : 0);
    const consistency: Achievement = {
      id: "consistency",
      label: "Consistency",
      emoji: "🔥",
      earned: consistencyCount >= 2,
      tooltip: `Take weekly quizzes 2 weeks in a row · ${consistencyCount}/2 weeks`,
      howTo: {
        title: "Take a weekly quiz two weeks in a row",
        steps: [
          { label: "Last week's quiz", done: tookPrevWk },
          { label: "This week's quiz", done: tookThisWk },
        ],
      },
    };

    // Concept Master — every concept at proficient or expert
    const totalConcepts = concepts.length;
    const proficientCount = concepts.filter((c) => {
      const m = conceptMastery[c.id];
      if (!m) return false;
      const lv = getMasteryLevel(m.attempted, m.score);
      return lv === "proficient" || lv === "expert";
    }).length;
    const conceptMaster: Achievement = {
      id: "concept-master",
      label: "Concept Master",
      emoji: "🏆",
      earned: totalConcepts > 0 && proficientCount === totalConcepts,
      tooltip: `Reach Proficient or Expert on every concept · ${proficientCount}/${totalConcepts}`,
      howTo: {
        title: "Reach Proficient or Expert on every concept",
        steps: [
          {
            label: `${proficientCount} of ${totalConcepts} concepts at Proficient+`,
            done: totalConcepts > 0 && proficientCount === totalConcepts,
          },
        ],
      },
    };

    const achievements = [firstSteps, comeback, consistency, conceptMaster];
    return { achievements, earnedCount: achievements.filter((a) => a.earned).length };
  }, [quizRows, courseId, studentId, concepts, conceptMastery]);
};
