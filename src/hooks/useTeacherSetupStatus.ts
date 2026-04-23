import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { resolvePublishedPath, LESSON_PLAN_BUCKET } from "@/lib/lessonPlanPath";

/**
 * Centralized check for whether the professor has fully completed the
 * required Course Setup pipeline. Used to gate access to Course Dashboard
 * and other non-setup teacher routes.
 *
 * Required to be considered "complete":
 *   1. Profile basics: name + department
 *   2. Course basics: name, course_code, term, graduation_year
 *   3. At least one uploaded course material (any folder type)
 *   4. At least one confirmed concept (Concept Review finalized)
 *   5. A published lesson plan (storage: {uid}/lesson-plan/published-plan.json)
 */
export function useTeacherSetupStatus() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setIsComplete(false);
      return;
    }
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        // 1. Profile basics
        const { data: profile } = await supabase
          .from("profiles")
          .select("name, department")
          .eq("id", user.id)
          .maybeSingle();
        if (!profile?.name?.trim() || !profile?.department?.trim()) {
          if (!cancelled) { setIsComplete(false); setLoading(false); }
          return;
        }

        // 2. Course basics — find the teacher's most recent course
        const { data: course } = await supabase
          .from("courses")
          .select("id, name, course_code, term, graduation_year, lesson_plan_path")
          .eq("teacher_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (
          !course ||
          !course.name?.trim() ||
          !course.course_code?.trim() ||
          !course.term?.trim() ||
          !Array.isArray(course.graduation_year) ||
          course.graduation_year.length === 0
        ) {
          if (!cancelled) { setIsComplete(false); setLoading(false); }
          return;
        }

        // 3. At least one uploaded course material
        const { data: materials } = await supabase
          .from("course_material_files")
          .select("id")
          .eq("teacher_id", user.id)
          .limit(1);
        if (!materials || materials.length === 0) {
          if (!cancelled) { setIsComplete(false); setLoading(false); }
          return;
        }

        // 4. At least one confirmed concept
        const { data: concepts } = await supabase
          .from("concepts")
          .select("id")
          .eq("course_id", course.id)
          .limit(1);
        if (!concepts || concepts.length === 0) {
          if (!cancelled) { setIsComplete(false); setLoading(false); }
          return;
        }

        // 5. Lesson plan published to storage (path comes from DB, with fallback)
        const publishedPath = resolvePublishedPath(course, user.id);
        const { data: published } = await supabase.storage
          .from(LESSON_PLAN_BUCKET)
          .download(publishedPath);
        if (!published) {
          if (!cancelled) { setIsComplete(false); setLoading(false); }
          return;
        }

        if (!cancelled) { setIsComplete(true); setLoading(false); }
      } catch {
        if (!cancelled) { setIsComplete(false); setLoading(false); }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [user]);

  return { loading, isComplete };
}
