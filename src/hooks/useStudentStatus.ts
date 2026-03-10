import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface StudentStatus {
  loading: boolean;
  hasProfile: boolean;
  hasEnrollment: boolean;
  hasDiagnostic: boolean;
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
    profileData: null,
  });

  useEffect(() => {
    if (!user) {
      setStatus(s => ({ ...s, loading: false }));
      return;
    }

    const check = async () => {
      const [profileRes, enrollmentRes, diagnosticRes] = await Promise.all([
        supabase.from("profiles").select("name, learner_level, role").eq("id", user.id).maybeSingle(),
        supabase.from("enrollments").select("id").eq("student_id", user.id).limit(1),
        supabase.from("diagnostic_results").select("id").eq("student_id", user.id).maybeSingle(),
      ]);

      const profile = profileRes.data;
      const isStudentProfile = profile && profile.role === "student";

      setStatus({
        loading: false,
        hasProfile: !!isStudentProfile,
        hasEnrollment: !!(enrollmentRes.data && enrollmentRes.data.length > 0),
        hasDiagnostic: !!diagnosticRes.data,
        profileData: isStudentProfile ? { name: profile.name, learner_level: profile.learner_level } : null,
      });
    };

    check();
  }, [user]);

  return status;
}
