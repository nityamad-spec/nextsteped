import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Resolves the student's *active* enrolled course id.
 * Priority: localStorage("enrolledCourseId") → profiles.active_course_id → first enrollment.
 */
export function useEnrolledCourseId(): string | null {
  const { user } = useAuth();
  const [courseId, setCourseId] = useState<string | null>(() => localStorage.getItem("enrolledCourseId"));

  useEffect(() => {
    if (courseId || !user) return;

    const resolve = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("active_course_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.active_course_id) {
        localStorage.setItem("enrolledCourseId", profile.active_course_id);
        setCourseId(profile.active_course_id);
        return;
      }

      const { data } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("student_id", user.id)
        .order("enrolled_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.course_id) {
        localStorage.setItem("enrolledCourseId", data.course_id);
        await supabase.from("profiles").update({ active_course_id: data.course_id }).eq("id", user.id);
        setCourseId(data.course_id);
      }
    };

    resolve();
  }, [user, courseId]);

  return courseId;
}
