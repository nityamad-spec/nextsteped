// Helper for syncing lesson-plan week metadata to the `lesson_plan_weeks`
// table. The table is the source of truth for student visibility — RLS
// hides locked + future weeks from enrolled students automatically.

import { supabase } from "@/integrations/supabase/client";

export type WeekUpsertInput = {
  week_number: number;
  week_name: string;
  overview: string;
  is_exam_week: boolean;
  exam_type?: "midterm" | "final" | null;
  locked: boolean;
  concepts: any[];
  resources: any[];
};

/**
 * Replace all weeks for a course with the supplied list (clean-slate publish).
 * Throws on failure so callers can surface a toast.
 */
export async function upsertPublishedWeeks(
  courseId: string,
  weeks: WeekUpsertInput[],
  overallOutcomes?: string,
): Promise<void> {
  // Delete existing rows for this course
  const { error: delError } = await supabase
    .from("lesson_plan_weeks")
    .delete()
    .eq("course_id", courseId);
  if (delError) throw delError;

  if (weeks.length > 0) {
    const rows = weeks.map((w) => ({
      course_id: courseId,
      week_number: w.week_number,
      week_name: w.week_name || `Week ${w.week_number}`,
      overview: w.overview || "",
      is_exam_week: !!w.is_exam_week,
      exam_type: w.is_exam_week ? (w.exam_type ?? null) : null,
      locked: !!w.locked,
      concepts: w.concepts || [],
      resources: w.resources || [],
    }));
    const { error: insError } = await supabase
      .from("lesson_plan_weeks")
      .insert(rows);
    if (insError) throw insError;
  }

  if (overallOutcomes !== undefined) {
    await supabase
      .from("courses")
      .update({ lesson_plan_overall_outcomes: overallOutcomes })
      .eq("id", courseId);
  }
}

/**
 * Flip a single week's locked flag without republishing the whole plan.
 */
export async function setWeekLocked(
  courseId: string,
  weekNumber: number,
  locked: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("lesson_plan_weeks")
    .update({ locked })
    .eq("course_id", courseId)
    .eq("week_number", weekNumber);
  if (error) throw error;
}

/**
 * Read visible weeks for a course. RLS handles visibility filtering for
 * students; teachers/collaborators get all weeks.
 */
export async function fetchVisibleWeeks(courseId: string) {
  const { data, error } = await supabase
    .from("lesson_plan_weeks")
    .select("week_number, week_name, overview, is_exam_week, locked, concepts, resources")
    .eq("course_id", courseId)
    .order("week_number");
  if (error) throw error;
  return data || [];
}
