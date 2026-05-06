import { useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Course } from "@/types";

/**
 * Returns the current course ID for teacher pages.
 *
 * Hardened: validates the candidate id (from AppContext or localStorage)
 * against the `courses` table. If the id no longer resolves (deleted course,
 * stale localStorage, wrong tenant), it clears the persisted state and
 * recovers from the teacher's owned/collaborator courses.
 */
export function useTeacherCourseId(): string | null {
  const { currentCourse, setCurrentCourse } = useApp();
  const { user } = useAuth();
  const [validatedId, setValidatedId] = useState<string | null>(null);
  const lastChecked = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      setValidatedId(null);
      lastChecked.current = null;
      return;
    }

    const candidate =
      currentCourse?.id ||
      (typeof window !== "undefined" ? localStorage.getItem("currentCourseId") : null);

    // Skip if we already validated this candidate this session.
    if (candidate && candidate === lastChecked.current && validatedId === candidate) return;

    let cancelled = false;
    const run = async () => {
      // 1. If we have a candidate, confirm it still exists / is visible to user.
      if (candidate) {
        const { data } = await supabase
          .from("courses")
          .select("id, name")
          .eq("id", candidate)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          lastChecked.current = candidate;
          setValidatedId(candidate);
          // Sync AppContext name if it drifted.
          if (!currentCourse || currentCourse.id !== data.id) {
            setCurrentCourse({ id: data.id, name: data.name } as Course);
            localStorage.setItem("currentCourseId", data.id);
          }
          return;
        }
        // Stale id — clear it.
        if (typeof window !== "undefined") localStorage.removeItem("currentCourseId");
        setCurrentCourse(null);
      }

      // 2. Recover: most recent owned course, then collaborator.
      let { data } = await supabase
        .from("courses")
        .select("id, name, course_code")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) {
        const { data: membership } = await supabase
          .from("course_teachers")
          .select("course_id")
          .eq("teacher_id", user.id)
          .limit(1)
          .maybeSingle();
        if (membership?.course_id) {
          const res = await supabase
            .from("courses")
            .select("id, name, course_code")
            .eq("id", membership.course_id)
            .maybeSingle();
          data = res.data;
        }
      }

      if (cancelled) return;
      if (data) {
        lastChecked.current = data.id;
        setValidatedId(data.id);
        setCurrentCourse({ id: data.id, name: data.name } as Course);
        localStorage.setItem("currentCourseId", data.id);
      } else {
        lastChecked.current = null;
        setValidatedId(null);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [currentCourse, user, setCurrentCourse, validatedId]);

  return validatedId;
}
