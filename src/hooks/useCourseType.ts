import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CourseType = "academic" | "employment";

interface CourseTypeState {
  loading: boolean;
  courseType: CourseType;
  /** The course id the state describes (undefined before any fetch, null for "no course"). */
  forId: string | null | undefined;
}

/**
 * Fetches `courses.course_type` and exposes pathway booleans.
 *
 * `ready` is only true when the state actually describes the requested
 * courseId — the initial state and the state for a previously requested
 * course are treated as "not ready" so callers never read a stale type
 * during the courseId null → value transition (or a course switch).
 */
export function useCourseType(courseId: string | null) {
  const [state, setState] = useState<CourseTypeState>({
    loading: false,
    courseType: "academic",
    forId: undefined,
  });

  useEffect(() => {
    let cancelled = false;
    if (!courseId) {
      setState({ loading: false, courseType: "academic", forId: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("course_type")
        .eq("id", courseId)
        .maybeSingle();
      if (cancelled) return;
      const t = !error && data?.course_type === "employment" ? "employment" : "academic";
      setState({ loading: false, courseType: t, forId: courseId });
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const ready = !state.loading && state.forId === courseId;
  const courseType = ready ? state.courseType : "academic";
  return {
    loading: state.loading,
    ready,
    courseType,
    isEmployment: ready && courseType === "employment",
    isAcademic: ready && courseType === "academic",
  };
}
