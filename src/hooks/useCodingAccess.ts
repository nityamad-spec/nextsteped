import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CodingAccessStatus = "none" | "pending" | "approved" | "rejected";

/**
 * Per-course coding access gate. Professors request access from
 * /teacher/setup/upload; admins approve from the admin Courses dialog.
 *
 * IMPORTANT: `isApproved` is false until `ready === true`. Consumers MUST wait
 * for `ready` before rendering coding UI — otherwise coding surfaces can leak
 * to un-approved courses during the initial fetch (mirrors
 * useTeacherNavPermissions' most-restrictive-until-ready pattern).
 */
export function useCodingAccess(courseId: string | null | undefined) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<CodingAccessStatus>("none");

  useEffect(() => {
    if (!courseId) {
      setStatus("none");
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    (async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("coding_access_status")
        .eq("id", courseId)
        .maybeSingle();
      if (cancelled) return;
      // On error or missing row → most restrictive default: no coding access.
      const s = !error ? data?.coding_access_status : undefined;
      setStatus(
        s === "pending" || s === "approved" || s === "rejected" ? s : "none",
      );
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  return { ready, status, isApproved: ready && status === "approved" };
}
