import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CareerReadinessStep } from "@/lib/careerReadiness";
import { normalizeStep } from "@/lib/careerReadiness";

export interface SoftSkillsModuleView {
  id: string;
  title: string;
  summary: string;
  outcomes: string[];
  activities: { title: string; body?: string }[];
  step: CareerReadinessStep;
}

/**
 * Published Soft Skills (Career Readiness) modules for a course.
 * Used by the student Career Readiness page and the nav visibility check.
 */
export function useCourseSoftSkills(courseId: string | null, publishedOnly = true) {
  const [modules, setModules] = useState<SoftSkillsModuleView[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!courseId) {
      setModules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = supabase
      .from("course_soft_skills")
      .select("id, title, summary, outcomes, activities, step")
      .eq("course_id", courseId)
      .order("position", { ascending: true });
    if (publishedOnly) query = query.eq("published", true);
    const { data } = await query;
    setModules(
      (data ?? []).map((row: any) => ({
        id: row.id,
        title: row.title ?? "",
        summary: row.summary ?? "",
        outcomes: Array.isArray(row.outcomes) ? row.outcomes : [],
        activities: Array.isArray(row.activities) ? row.activities : [],
        step: normalizeStep(row.step),
      })),
    );
    setLoading(false);
  }, [courseId, publishedOnly]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { modules, loading, refetch };
}
