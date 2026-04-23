import { supabase } from "@/integrations/supabase/client";

export interface StepProgress {
  opened: Record<string, boolean>;
  completed: Record<string, boolean>;
}

export const fetchStepProgress = async (uid: string): Promise<StepProgress> => {
  const { data, error } = await supabase
    .from("teacher_setup_progress")
    .select("step_id, completed_at")
    .eq("teacher_id", uid);
  const opened: Record<string, boolean> = {};
  const completed: Record<string, boolean> = {};
  if (error || !data) return { opened, completed };
  for (const row of data) {
    opened[row.step_id] = true;
    if (row.completed_at) completed[row.step_id] = true;
  }
  return { opened, completed };
};

export const markStepOpened = async (uid: string, stepId: string) => {
  await supabase
    .from("teacher_setup_progress")
    .upsert(
      { teacher_id: uid, step_id: stepId, opened_at: new Date().toISOString() },
      { onConflict: "teacher_id,step_id" }
    );
};

export const markStepCompleted = async (uid: string, stepId: string) => {
  await supabase
    .from("teacher_setup_progress")
    .upsert(
      {
        teacher_id: uid,
        step_id: stepId,
        opened_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      },
      { onConflict: "teacher_id,step_id" }
    );
};
