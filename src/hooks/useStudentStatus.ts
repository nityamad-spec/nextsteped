import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface StudentStatus {
  loading: boolean;
  hasProfile: boolean;
  hasEnrollment: boolean;
  /** True only if a diagnostic exists for the *active* course. */
  hasDiagnostic: boolean;
  activeCourseId: string | null;
  role: string | null;
  profileData: {
    name: string;
    learner_level: string | null;
  } | null;
}

export function useStudentStatus() {
  const { user } = useAuth();
  const [status, setStatus] = useState<StudentStatus>({
    loading: true,
    hasProfile: false,
    hasEnrollment: false,
    hasDiagnostic: false,
    activeCourseId: null,
    profileData: null,
  });

  useEffect(() => {
    if (!user) {
      setStatus(s => ({ ...s, loading: false }));
      return;
    }

    const check = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, learner_level, role, active_course_id")
        .eq("id", user.id)
        .maybeSingle();

      const isStudent = profile && profile.role === "student";

      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id, enrolled_at")
        .eq("student_id", user.id)
        .order("enrolled_at", { ascending: false });

      // Pick active course: profiles.active_course_id if it's still enrolled, else most recent
      let activeCourseId: string | null = null;
      if (enrollments && enrollments.length > 0) {
        const ids = enrollments.map(e => e.course_id);
        activeCourseId = profile?.active_course_id && ids.includes(profile.active_course_id)
          ? profile.active_course_id
          : enrollments[0].course_id;
      }

      let hasDiagnostic = false;
      if (activeCourseId) {
        const { data: diag } = await supabase
          .from("diagnostic_results")
          .select("id")
          .eq("student_id", user.id)
          .eq("course_id", activeCourseId)
          .maybeSingle();
        hasDiagnostic = !!diag;
      }

      setStatus({
        loading: false,
        hasProfile: !!isStudent,
        hasEnrollment: !!(enrollments && enrollments.length > 0),
        hasDiagnostic,
        activeCourseId,
        profileData: isStudent ? { name: profile.name, learner_level: profile.learner_level } : null,
      });
    };

    check();
  }, [user]);

  return status;
}
