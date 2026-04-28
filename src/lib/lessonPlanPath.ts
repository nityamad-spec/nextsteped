// Centralized helper for resolving the storage paths of lesson plan JSON files.
//
// Storage paths are course-scoped: every file lives under
//   {courseId}/lesson-plan/{published|draft}-plan(-v2).json
// so collaborators (not just the course owner) can read and write them
// under the course-membership storage RLS policies.
//
// Path columns recorded on the `courses` table:
//   - `lesson_plan_path`         → published plan JSON path
//   - `lesson_plan_draft_path`   → draft plan JSON path
//   - `lesson_plan_published_at` → timestamp of last publish
//
// For courses where these columns are still null we fall back to deriving
// the canonical path from the course id. The path is upgraded lazily on
// the next save/publish.

import { supabase } from "@/integrations/supabase/client";

export const LESSON_PLAN_BUCKET = "course-materials";

export const canonicalPublishedPath = (courseId: string) =>
  `${courseId}/lesson-plan/published-plan.json`;

export const canonicalDraftPath = (courseId: string) =>
  `${courseId}/lesson-plan/draft-plan-v2.json`;

export const resolvePublishedPath = (
  course: { lesson_plan_path?: string | null } | null | undefined,
  courseId: string,
): string => course?.lesson_plan_path || canonicalPublishedPath(courseId);

export const resolveDraftPath = (
  course: { lesson_plan_draft_path?: string | null } | null | undefined,
  courseId: string,
): string => course?.lesson_plan_draft_path || canonicalDraftPath(courseId);

/**
 * Fetch the stored published plan path for a course (or fall back to the
 * canonical course-scoped path). Returns the path plus the publish
 * timestamp when available.
 */
export const fetchPublishedPath = async (
  courseId: string,
): Promise<{ path: string; publishedAt: string | null }> => {
  const { data } = await supabase
    .from("courses")
    .select("lesson_plan_path, lesson_plan_published_at")
    .eq("id", courseId)
    .maybeSingle();
  return {
    path: resolvePublishedPath(data, courseId),
    publishedAt: data?.lesson_plan_published_at ?? null,
  };
};

/**
 * Record the published plan path + publish timestamp on the course row.
 * Best-effort: errors are logged but never thrown so storage upload remains
 * the source of truth.
 */
export const recordPublishedPath = async (
  courseId: string,
  path: string,
): Promise<void> => {
  try {
    const { error } = await supabase
      .from("courses")
      .update({
        lesson_plan_path: path,
        lesson_plan_published_at: new Date().toISOString(),
      })
      .eq("id", courseId);
    if (error) console.warn("recordPublishedPath:", error.message);
  } catch (e) {
    console.warn("recordPublishedPath threw:", e);
  }
};

/**
 * Record the draft plan path on the course row, but only if it's currently
 * null — avoids write amplification on every debounced save.
 */
export const recordDraftPathIfMissing = async (
  courseId: string,
  path: string,
): Promise<void> => {
  try {
    const { data } = await supabase
      .from("courses")
      .select("lesson_plan_draft_path")
      .eq("id", courseId)
      .maybeSingle();
    if (data?.lesson_plan_draft_path) return;
    const { error } = await supabase
      .from("courses")
      .update({ lesson_plan_draft_path: path })
      .eq("id", courseId);
    if (error) console.warn("recordDraftPathIfMissing:", error.message);
  } catch (e) {
    console.warn("recordDraftPathIfMissing threw:", e);
  }
};
