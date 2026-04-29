import { supabase } from "@/integrations/supabase/client";

export interface StepProgress {
  opened: Record<string, boolean>;
  completed: Record<string, boolean>;
}

/**
 * Fetch a teacher's setup progress for a specific course.
 * Progress is scoped per (teacher_id, course_id, step_id) so adding or
 * switching courses gives a clean slate.
 */
export const fetchStepProgress = async (
  uid: string,
  courseId: string | null,
): Promise<StepProgress> => {
  const opened: Record<string, boolean> = {};
  const completed: Record<string, boolean> = {};
  if (!courseId) return { opened, completed };

  const { data, error } = await supabase
    .from("teacher_setup_progress")
    .select("step_id, completed_at")
    .eq("teacher_id", uid)
    .eq("course_id", courseId);
  if (error || !data) return { opened, completed };
  for (const row of data) {
    opened[row.step_id] = true;
    if (row.completed_at) completed[row.step_id] = true;
  }
  return { opened, completed };
};

export const markStepOpened = async (
  uid: string,
  stepId: string,
  courseId: string | null,
) => {
  if (!courseId) return;
  await supabase
    .from("teacher_setup_progress")
    .upsert(
      {
        teacher_id: uid,
        course_id: courseId,
        step_id: stepId,
        opened_at: new Date().toISOString(),
      },
      { onConflict: "teacher_id,course_id,step_id" },
    );
};

export const markStepCompleted = async (
  uid: string,
  stepId: string,
  courseId: string | null,
) => {
  if (!courseId) return;
  await supabase
    .from("teacher_setup_progress")
    .upsert(
      {
        teacher_id: uid,
        course_id: courseId,
        step_id: stepId,
        opened_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      },
      { onConflict: "teacher_id,course_id,step_id" },
    );
};
