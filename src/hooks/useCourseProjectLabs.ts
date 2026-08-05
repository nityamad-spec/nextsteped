import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ProjectLab, ProjectLabStep } from "@/config/projectLabTemplates";

const normalize = (row: any): ProjectLab => ({
  id: row.id,
  course_id: row.course_id,
  position: row.position ?? 0,
  title: row.title ?? "",
  summary: row.summary ?? "",
  tags: Array.isArray(row.tags) ? row.tags : [],
  mission: row.mission ?? "",
  caution: row.caution ?? null,
  learnings: Array.isArray(row.learnings) ? row.learnings : [],
  steps: Array.isArray(row.steps) ? (row.steps as ProjectLabStep[]) : [],
  published: !!row.published,
});

/**
 * Fetches Project Labs for a course.
 * `publishedOnly` is used by the student view + student nav visibility check.
 */
export function useCourseProjectLabs(courseId: string | null, publishedOnly = false) {
  const [labs, setLabs] = useState<ProjectLab[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!courseId) {
      setLabs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = supabase
      .from("course_project_labs")
      .select("*")
      .eq("course_id", courseId)
      .order("position", { ascending: true });
    if (publishedOnly) query = query.eq("published", true);
    const { data } = await query;
    setLabs((data ?? []).map(normalize));
    setLoading(false);
  }, [courseId, publishedOnly]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { labs, loading, refetch };
}
