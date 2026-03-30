import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useEnrolledCourseId(): string | null {
  const { user } = useAuth();
  const [courseId, setCourseId] = useState<string | null>(() => localStorage.getItem("enrolledCourseId"));

  useEffect(() => {
    if (courseId || !user) return;

    const resolve = async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("student_id", user.id)
        .limit(1)
        .maybeSingle();

      if (data?.course_id) {
        localStorage.setItem("enrolledCourseId", data.course_id);
        setCourseId(data.course_id);
      }
    };

    resolve();
  }, [user, courseId]);

  return courseId;
}
