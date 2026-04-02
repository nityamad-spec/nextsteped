import { useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Course } from "@/types";

/**
 * Returns the current course ID for teacher pages.
 * Auto-recovers from DB if AppContext is empty (e.g. after localStorage clear).
 * Syncs localStorage for backward compatibility.
 */
export function useTeacherCourseId(): string | null {
  const { currentCourse, setCurrentCourse } = useApp();
  const { user } = useAuth();

  useEffect(() => {
    if (currentCourse || !user) return;
    const recover = async () => {
      // Try owned course first
      let { data } = await supabase
        .from("courses")
        .select("id, name, course_code")
        .eq("teacher_id", user.id)
        .limit(1)
        .maybeSingle();

      // Fallback: collaborator
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

      if (data) {
        setCurrentCourse({ id: data.id, name: data.name } as Course);
        localStorage.setItem("currentCourseId", data.id);
      }
    };
    recover();
  }, [currentCourse, user, setCurrentCourse]);

  return currentCourse?.id || localStorage.getItem("currentCourseId");
}
