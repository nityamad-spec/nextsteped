import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// Paths always visible/reachable regardless of admin config.
// Support is the fallback landing for restricted teachers.
export const TEACHER_NAV_ALWAYS_ON: readonly string[] = [
  "/teacher/support",
];

/**
 * Returns the set of teacher-nav paths the current teacher is allowed to see.
 * IMPORTANT: `allowed` is empty until `ready === true`. Consumers MUST wait for
 * `ready` before rendering nav items or making access decisions — otherwise a
 * stale/default state can leak un-granted UI during the initial fetch.
 */
export function useTeacherNavPermissions() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [canCreateCourses, setCanCreateCourses] = useState<boolean>(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setReady(true);
      setAllowed([]);
      setCanCreateCourses(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setReady(false);
    (async () => {
      const { data, error } = await supabase
        .from("teacher_nav_permissions")
        .select("allowed_paths, can_create_courses")
        .eq("teacher_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      // On error or missing row → most restrictive default: Support only.
      const paths = !error && data?.allowed_paths ? (data.allowed_paths as string[]) : [];
      const merged = Array.from(new Set([...TEACHER_NAV_ALWAYS_ON, ...paths]));
      setAllowed(merged);
      setCanCreateCourses(!error && Boolean(data?.can_create_courses));
      setLoading(false);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const isAllowed = (path: string) => isTeacherPathAllowed(path, allowed);

  return { loading, ready, allowed, isAllowed, canCreateCourses };
}

/**
 * Deterministic check used by both the layout nav filter and the per-route
 * guard. A grant on a top-level path (e.g. `/teacher/setup`) unlocks its
 * sub-paths (e.g. `/teacher/setup/upload`). All other paths require an exact
 * top-level grant.
 */
export function isTeacherPathAllowed(path: string, allowed: string[]): boolean {
  return allowed.some((p) => path === p || path.startsWith(p + "/"));
}
