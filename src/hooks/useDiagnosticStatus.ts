import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns whether the current student has completed the diagnostic quiz
 * for the given course. Used to gate assessment-scored surfaces.
 */
export function useDiagnosticStatus(courseId: string | null | undefined): {
  loading: boolean;
  taken: boolean | null;
  refresh: () => void;
} {
  const { user } = useAuth();
  const [state, setState] = useState<{ loading: boolean; taken: boolean | null }>({
    loading: true,
    taken: null,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user?.id || !courseId) {
      setState({ loading: false, taken: null });
      return;
    }
    let cancelled = false;
    setState({ loading: true, taken: null });
    (async () => {
      const { data, error } = await supabase
        .from("diagnostic_results")
        .select("id")
        .eq("student_id", user.id)
        .eq("course_id", courseId)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("useDiagnosticStatus error:", error);
        setState({ loading: false, taken: false });
        return;
      }
      setState({ loading: false, taken: !!data });
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, courseId, tick]);

  return { ...state, refresh: () => setTick((t) => t + 1) };
}
