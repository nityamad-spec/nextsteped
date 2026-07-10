import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// Paths that are always visible to teachers regardless of admin config.
// Setup must remain reachable so brand-new teachers can complete onboarding;
// Support must remain reachable so they can request help.
// Paths that are always visible to teachers regardless of admin config.
// Support must remain reachable so teachers can always request help and
// serves as the fallback landing for hidden-route redirects.
export const TEACHER_NAV_ALWAYS_ON: readonly string[] = [
  "/teacher/support",
];

/**
 * Returns the set of teacher-nav paths the current teacher is allowed to see.
 * Defaults to `TEACHER_NAV_ALWAYS_ON` when no explicit config row exists.
 */
export function useTeacherNavPermissions() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<string[]>([...TEACHER_NAV_ALWAYS_ON]);
  const [canCreateCourses, setCanCreateCourses] = useState<boolean>(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("teacher_nav_permissions")
        .select("allowed_paths, can_create_courses")
        .eq("teacher_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const paths = (data?.allowed_paths ?? []) as string[];
      const merged = Array.from(new Set([...TEACHER_NAV_ALWAYS_ON, ...paths]));
      setAllowed(merged);
      setCanCreateCourses(Boolean(data?.can_create_courses));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const isAllowed = (path: string) =>
    allowed.some((p) => path === p || path.startsWith(p + "/"));

  return { loading, allowed, isAllowed, canCreateCourses };
}

