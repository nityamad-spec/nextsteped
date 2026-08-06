import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Resolves whether the signed-in student's access to a given course has been
 * suspended by an admin (per-course suspension, distinct from account-level
 * suspension which blocks sign-in entirely).
 */
export function useCourseAccess(courseId: string | null) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [suspended, setSuspended] = useState(false);

  useEffect(() => {
    if (!user || !courseId) {
      setSuspended(false);
      setLoading(!!courseId);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("suspended_at")
        .eq("student_id", user.id)
        .eq("course_id", courseId)
        .maybeSingle();
      if (cancelled) return;
      setSuspended(!!(data as any)?.suspended_at);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, courseId]);

  return { loading, suspended };
}
