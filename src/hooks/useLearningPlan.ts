import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEnrolledCourseId } from "@/hooks/useEnrolledCourseId";

interface RawConcept {
  id?: string | number;
  name?: string;
  brief_description?: string;
}

interface RawResource {
  id?: string | number;
  type?: string;
  title?: string;
  description?: string;
  url?: string;
  concept?: string;
  action?: string;
}

interface RawLessonPlanRow {
  week_number: number;
  week_name?: string;
  overview?: string;
  is_exam_week?: boolean;
  concepts?: unknown;
  resources?: unknown;
}

export interface LearningPlanWeek {
  id: string;
  day: number;
  topic: string;
  description: string;
  is_exam_week: boolean;
  locked: boolean;
  concepts: { id: string; name: string; brief_description?: string }[];
  resources: {
    id: string;
    type: string;
    title: string;
    description?: string;
    url?: string;
    concept: string;
    action?: string;
  }[];
}

export interface UseLearningPlanResult {
  courseName: string | null;
  courseStartDate: string | null;
  totalWeeks: number;
  currentWeek: number;
  lessonPlan: LearningPlanWeek[];
  planLoading: boolean;
  lessonPlanPublished: boolean;
  lessonPlanError: boolean;
}

export function useLearningPlan(): UseLearningPlanResult {
  const { user } = useAuth();
  const enrolledCourseId = useEnrolledCourseId();

  const [courseName, setCourseName] = useState<string | null>(null);
  const [courseStartDate, setCourseStartDate] = useState<string | null>(null);
  const [totalWeeks, setTotalWeeks] = useState(16);
  const [lessonPlanPublished, setLessonPlanPublished] = useState(false);
  const [lessonPlanError, setLessonPlanError] = useState(false);
  const [lessonPlan, setLessonPlan] = useState<LearningPlanWeek[]>([]);
  const [planLoading, setPlanLoading] = useState(true);

  const currentWeek = useMemo(() => {
    if (!courseStartDate) return 1;
    const start = new Date(courseStartDate).getTime();
    const now = Date.now();
    const week = Math.floor((now - start) / (7 * 24 * 60 * 60 * 1000)) + 1;
    return Math.max(1, Math.min(totalWeeks, week));
  }, [courseStartDate, totalWeeks]);

  useEffect(() => {
    const loadPlan = async () => {
      if (!enrolledCourseId) {
        setPlanLoading(false);
        setCourseName(null);
        return;
      }
      let publishedAt: string | null = null;
      try {
        const { data: course } = await supabase
          .from("courses")
          .select("teacher_id, name, start_date, total_weeks, lesson_plan_published_at")
          .eq("id", enrolledCourseId)
          .maybeSingle();

        if (!course?.teacher_id) {
          console.warn("[useLearningPlan] enrolledCourseId did not resolve to a visible course", enrolledCourseId);
          if (typeof window !== "undefined") localStorage.removeItem("enrolledCourseId");
          setPlanLoading(false);
          return;
        }

        if (course.name) setCourseName(course.name);
        if (course.start_date) setCourseStartDate(course.start_date);
        if (course.total_weeks) setTotalWeeks(course.total_weeks);
        publishedAt = course.lesson_plan_published_at ?? null;

        const { data: rows, error: rowsError } = await supabase
          .from("lesson_plan_weeks")
          .select("week_number, week_name, overview, is_exam_week, concepts, resources")
          .eq("course_id", enrolledCourseId)
          .order("week_number");

        if (rowsError) {
          console.error("Learning path load error:", rowsError);
          setLessonPlanPublished(false);
          setLessonPlanError(Boolean(publishedAt));
          setLessonPlan([]);
          setPlanLoading(false);
          return;
        }

        if (!publishedAt && (!rows || rows.length === 0)) {
          setLessonPlanPublished(false);
          setLessonPlanError(false);
          setLessonPlan([]);
          setPlanLoading(false);
          return;
        }

        const mapped: LearningPlanWeek[] = (rows || []).map((r: RawLessonPlanRow) => {
          const conceptList = Array.isArray(r.concepts) ? (r.concepts as RawConcept[]) : [];
          const conceptNames: string[] = conceptList
            .map((c) => c?.name)
            .filter((n): n is string => typeof n === "string" && n.length > 0);
          const resources = (Array.isArray(r.resources) ? (r.resources as RawResource[]) : []).map((res, i: number) => ({
            id: String(res?.id ?? `r_${r.week_number}_${i}`),
            type: String(res?.type ?? "resource"),
            title: String(res?.title ?? ""),
            description: res?.description ? String(res.description) : undefined,
            url: res?.url ? String(res.url) : undefined,
            concept: res?.concept ? String(res.concept) : (conceptNames[0] || "General"),
            action: res?.action ? String(res.action) : (res?.description ? String(res.description) : undefined),
          }));
          return {
            id: `w_${r.week_number}`,
            day: r.week_number,
            topic: r.week_name || `Week ${r.week_number}`,
            description: r.overview || "",
            is_exam_week: !!r.is_exam_week,
            locked: false,
            concepts: conceptList.map((c, i: number) => ({
              id: String(c?.id ?? `c_${r.week_number}_${i}`),
              name: String(c?.name ?? ""),
              brief_description: c?.brief_description ? String(c.brief_description) : undefined,
            })),
            resources,
          };
        });

        if (mapped.length > 0) {
          setLessonPlanPublished(true);
          setLessonPlanError(false);
          setLessonPlan(mapped);
          setPlanLoading(false);
          return;
        }

        setLessonPlanPublished(true);
        setLessonPlanError(false);
        setLessonPlan([]);
        setPlanLoading(false);
      } catch (err) {
        console.error("Learning path load error:", err);
        setLessonPlanError(Boolean(publishedAt));
        setLessonPlanPublished(false);
        setLessonPlan([]);
        setPlanLoading(false);
      }
    };

    loadPlan();
  }, [enrolledCourseId]);

  return {
    courseName,
    courseStartDate,
    totalWeeks,
    currentWeek,
    lessonPlan,
    planLoading,
    lessonPlanPublished,
    lessonPlanError,
  };
}
