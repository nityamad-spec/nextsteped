import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { LearningPlanWeek } from "@/hooks/useLearningPlan";
import { textMatchesUnit, unitTerms } from "@/lib/unitStage";

interface ChatSessionRow {
  title: string | null;
}

interface PracticeResultRow {
  answers: unknown;
}

interface MasteryRow {
  concept_code: string | null;
  questions_attempted: number | string | null;
}

export interface UnitProgressResult {
  /** Unit number → student has studied this unit with the teaching assistant. */
  studiedByUnit: Record<number, boolean>;
  /** Unit number → student has finished at least one practice set for this unit. */
  practisedByUnit: Record<number, boolean>;
  loading: boolean;
}

/**
 * Read-only activity signals per unit:
 *  - studied: a chat session whose title references the unit topic/concepts,
 *    or any concept in the unit with attempted mastery.
 *  - practised: an `assessment_results` row with mode = "practice" whose answer
 *    topics intersect the unit's topic/concepts.
 */
export function useUnitProgress(
  courseId: string | null,
  lessonPlan: LearningPlanWeek[],
): UnitProgressResult {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ChatSessionRow[]>([]);
  const [practice, setPractice] = useState<PracticeResultRow[]>([]);
  const [mastery, setMastery] = useState<MasteryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId || !user?.id) {
      setSessions([]);
      setPractice([]);
      setMastery([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [sessionRes, practiceRes, masteryRes] = await Promise.all([
        supabase
          .from("chat_sessions")
          .select("title")
          .eq("user_id", user.id)
          .eq("course_id", courseId)
          .order("updated_at", { ascending: false })
          .limit(100),
        supabase
          .from("assessment_results")
          .select("answers")
          .eq("student_id", user.id)
          .eq("course_id", courseId)
          .eq("mode", "practice")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("student_concept_mastery")
          .select("concept_code, questions_attempted")
          .eq("student_id", user.id)
          .eq("course_id", courseId),
      ]);
      if (cancelled) return;
      if (sessionRes.error) console.error("[useUnitProgress] chat sessions load error", sessionRes.error);
      if (practiceRes.error) console.error("[useUnitProgress] practice load error", practiceRes.error);
      if (masteryRes.error) console.error("[useUnitProgress] mastery load error", masteryRes.error);
      setSessions((sessionRes.data as ChatSessionRow[]) || []);
      setPractice((practiceRes.data as PracticeResultRow[]) || []);
      setMastery((masteryRes.data as MasteryRow[]) || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, user?.id]);

  return useMemo(() => {
    const attemptedConcepts = new Set(
      mastery
        .filter((m) => (Number(m.questions_attempted) || 0) > 0 && m.concept_code)
        .map((m) => String(m.concept_code)),
    );

    const practiceTopics: string[] = [];
    practice.forEach((row) => {
      const answers = Array.isArray(row.answers) ? (row.answers as Record<string, unknown>[]) : [];
      answers.forEach((a) => {
        const topic = typeof a?.topic === "string" ? a.topic : "";
        if (topic) practiceTopics.push(topic);
      });
    });

    const studiedByUnit: Record<number, boolean> = {};
    const practisedByUnit: Record<number, boolean> = {};

    lessonPlan.forEach((week) => {
      const terms = unitTerms(week);
      const conceptNames = (week.concepts || []).map((c) => c?.name).filter(Boolean) as string[];

      studiedByUnit[week.day] =
        conceptNames.some((name) => attemptedConcepts.has(name)) ||
        sessions.some((s) => textMatchesUnit(s.title, terms));

      practisedByUnit[week.day] = practiceTopics.some((t) => textMatchesUnit(t, terms));
    });

    return { studiedByUnit, practisedByUnit, loading };
  }, [sessions, practice, mastery, lessonPlan, loading]);
}
