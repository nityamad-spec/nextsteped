import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { LearningPlanWeek } from "@/hooks/useLearningPlan";

export const READINESS_THRESHOLD = 70;

interface ConceptRow {
  id: string;
  concept_code: string;
  weight: number | string | null;
}

interface MasteryRow {
  concept_id: string;
  mastery_score: number | string | null;
}

export interface UnitReadinessResult {
  /** Unit (week) number → readiness percentage 0..100. */
  readinessByUnit: Record<number, number>;
  /** Unit number → up to 3 weakest concept names for that unit. */
  weakConceptsByUnit: Record<number, string[]>;
  loading: boolean;
}

/**
 * Unit readiness = weight-weighted average of the student's concept mastery
 * for the concepts that belong to that unit. Mastery rows are written by the
 * `update-mastery` edge function after quizzes, exams and practice, so practice
 * naturally raises readiness after the one-shot weekly quiz.
 */
export function useUnitReadiness(
  courseId: string | null,
  lessonPlan: LearningPlanWeek[],
): UnitReadinessResult {
  const { user } = useAuth();
  const [concepts, setConcepts] = useState<ConceptRow[]>([]);
  const [mastery, setMastery] = useState<MasteryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId || !user?.id) {
      setConcepts([]);
      setMastery([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [conceptRes, masteryRes] = await Promise.all([
        supabase.from("concepts").select("id, concept_code, weight").eq("course_id", courseId),
        supabase
          .from("student_concept_mastery")
          .select("concept_id, mastery_score")
          .eq("student_id", user.id)
          .eq("course_id", courseId),
      ]);
      if (cancelled) return;
      if (conceptRes.error) console.error("[useUnitReadiness] concepts load error", conceptRes.error);
      if (masteryRes.error) console.error("[useUnitReadiness] mastery load error", masteryRes.error);
      setConcepts((conceptRes.data as ConceptRow[]) || []);
      setMastery((masteryRes.data as MasteryRow[]) || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, user?.id]);

  return useMemo(() => {
    const byCode = new Map<string, ConceptRow>();
    concepts.forEach((c) => byCode.set(c.concept_code, c));
    const masteryById = new Map<string, number>();
    mastery.forEach((m) => {
      const raw = Number(m.mastery_score) || 0;
      // mastery_score is stored 0..1 in some sources and 0..100 in others.
      masteryById.set(m.concept_id, raw <= 1 ? raw * 100 : raw);
    });

    const readinessByUnit: Record<number, number> = {};
    const weakConceptsByUnit: Record<number, string[]> = {};

    lessonPlan.forEach((week) => {
      const names = (week.concepts || []).map((c) => c.name).filter(Boolean);
      const scored: { name: string; weight: number; score: number }[] = [];
      names.forEach((name) => {
        const concept = byCode.get(name);
        if (!concept) return;
        scored.push({
          name,
          weight: Math.max(0, Number(concept.weight) || 0),
          score: masteryById.get(concept.id) ?? 0,
        });
      });

      if (scored.length === 0) {
        readinessByUnit[week.day] = 0;
        weakConceptsByUnit[week.day] = names.slice(0, 3);
        return;
      }

      const totalWeight = scored.reduce((sum, s) => sum + s.weight, 0);
      const readiness = totalWeight > 0
        ? scored.reduce((sum, s) => sum + s.weight * s.score, 0) / totalWeight
        : scored.reduce((sum, s) => sum + s.score, 0) / scored.length;

      readinessByUnit[week.day] = Math.max(0, Math.min(100, Math.round(readiness)));
      weakConceptsByUnit[week.day] = [...scored]
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
        .map((s) => s.name);
    });

    return { readinessByUnit, weakConceptsByUnit, loading };
  }, [concepts, mastery, lessonPlan, loading]);
}
