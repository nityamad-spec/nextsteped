import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import CourseAnalyticsView, { type CourseLite } from "@/components/CourseAnalyticsView";
import { Loader2 } from "lucide-react";

const CourseAnalytics = () => {
  const courseId = useTeacherCourseId();
  const [course, setCourse] = useState<CourseLite | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!courseId) {
      setCourse(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data: c } = await supabase
        .from("courses")
        .select("id, name, course_code, term, enrollment_code, published, enrollment_open, teacher_id")
        .eq("id", courseId)
        .maybeSingle();
      if (cancelled) return;
      if (!c) {
        setCourse(null);
        setLoading(false);
        return;
      }
      let teacher_name = "";
      let teacher_email: string | null = null;
      if (c.teacher_id) {
        const { data: p } = await supabase
          .from("profiles")
          .select("name, email")
          .eq("id", c.teacher_id)
          .maybeSingle();
        teacher_name = p?.name || "";
        teacher_email = p?.email ?? null;
      }
      if (cancelled) return;
      setCourse({
        id: c.id,
        name: c.name,
        course_code: c.course_code ?? null,
        term: c.term,
        enrollment_code: c.enrollment_code,
        published: !!c.published,
        enrollment_open: !!c.enrollment_open,
        teacher_name,
        teacher_email,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [courseId]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Course Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Live view of enrollment, diagnostic, mastery, quizzes, exams and chat engagement for your course.
        </p>
      </div>

      {loading ? (
        <div className="rounded-lg border bg-card p-6 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div>
            <div className="text-sm font-medium">Preparing course…</div>
            <div className="text-xs text-muted-foreground">Resolving your active course.</div>
          </div>
        </div>
      ) : !course ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Select a course to view analytics.
        </div>
      ) : (
        <CourseAnalyticsView course={course} />
      )}
    </div>
  );
};

export default CourseAnalytics;
