import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_CAREER_READINESS,
  parseCareerReadinessRow,
  type CareerReadinessContent,
} from "@/lib/careerReadinessContent";

/**
 * Professor-controlled Career Readiness content for one course.
 * Returns empty content (and the per-section published flags as false) when the
 * professor hasn't set anything up yet.
 */
export function useCourseCareerReadiness(courseId: string | null | undefined, enabled = true) {
  const [content, setContent] = useState<CareerReadinessContent>(EMPTY_CAREER_READINESS);
  const [loading, setLoading] = useState(!!courseId && enabled);

  const load = useCallback(async () => {
    if (!courseId || !enabled) {
      setContent(EMPTY_CAREER_READINESS);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("course_career_readiness")
      .select("*")
      .eq("course_id", courseId)
      .maybeSingle();
    setContent(parseCareerReadinessRow(data));
    setLoading(false);
  }, [courseId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { content, loading, refresh: load };
}
