import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Resolves the student's *active* enrolled course id.
 *
 * Hardened: validates any candidate id (from localStorage or
 * profiles.active_course_id) against the `enrollments` table. If the id no
 * longer resolves to a real enrollment (deleted course, stale cache, wrong
 * tenant), we clear it and recover from profiles.active_course_id or the
 * most recent enrollment. Mirrors the pattern in `useTeacherCourseId`.
 */
export function useEnrolledCourseId(): string | null {
  const { user } = useAuth();
  const [courseId, setCourseId] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("enrolledCourseId") : null,
  );
  const lastValidated = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      lastValidated.current = null;
      return;
    }

    const candidate =
      courseId ||
      (typeof window !== "undefined" ? localStorage.getItem("enrolledCourseId") : null);

    if (candidate && candidate === lastValidated.current) return;

    let cancelled = false;

    const persist = (id: string | null) => {
      if (cancelled) return;
      if (id) {
        localStorage.setItem("enrolledCourseId", id);
        lastValidated.current = id;
        setCourseId(id);
      } else {
        localStorage.removeItem("enrolledCourseId");
        lastValidated.current = null;
        setCourseId(null);
      }
    };

    const isEnrolled = async (id: string): Promise<boolean> => {
      const { data } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("student_id", user.id)
        .eq("course_id", id)
        .maybeSingle();
      return !!data;
    };

    const run = async () => {
      // 1. Validate candidate (from localStorage / state) against enrollments.
      if (candidate) {
        if (await isEnrolled(candidate)) {
          persist(candidate);
          return;
        }
        // Stale — clear it before falling back.
        if (typeof window !== "undefined") localStorage.removeItem("enrolledCourseId");
      }

      // 2. Fall back to profiles.active_course_id (revalidated).
      const { data: profile } = await supabase
        .from("profiles")
        .select("active_course_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.active_course_id && (await isEnrolled(profile.active_course_id))) {
        persist(profile.active_course_id);
        return;
      }

      // 3. Final fallback: most recent enrollment, preferring one that is not
      //    suspended so students keep working in their other courses.
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id, suspended_at")
        .eq("student_id", user.id)
        .order("enrolled_at", { ascending: false });

      const rows = (enrollments ?? []) as { course_id: string; suspended_at: string | null }[];
      const pick = rows.find((r) => !r.suspended_at) ?? rows[0];

      if (pick?.course_id) {
        await supabase
          .from("profiles")
          .update({ active_course_id: pick.course_id })
          .eq("id", user.id);
        persist(pick.course_id);
        return;
      }

      persist(null);
    };


    run();
    return () => {
      cancelled = true;
    };
  }, [user, courseId]);

  return courseId;
}
