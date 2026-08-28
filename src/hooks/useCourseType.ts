import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CourseType = "academic" | "employment";

export const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  academic: "Academic Course",
  employment: "Employment Pathway",
};

/**
 * Per-course type gate. Chosen at course creation and locked afterwards
 * (only admins can change it). Employment-pathway courses unlock the Soft
 * Skills setup step and a Soft Skills unit in the student learning path.
 *
 * IMPORTANT: `isEmployment` is false until `ready === true` — consumers must
 * wait for `ready` before rendering employment-only UI.
 */
export function useCourseType(courseId: string | null | undefined) {
  const [ready, setReady] = useState(false);
  const [courseType, setCourseType] = useState<CourseType>("academic");

  useEffect(() => {
    if (!courseId) {
      setCourseType("academic");
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    (async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("course_type")
        .eq("id", courseId)
        .maybeSingle();
      if (cancelled) return;
      const t = !error ? data?.course_type : undefined;
      setCourseType(t === "employment" ? "employment" : "academic");
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  return { ready, courseType, isEmployment: ready && courseType === "employment" };
}
