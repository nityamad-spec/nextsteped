// Shared types + helpers for coding/lab week exercises.
// Public fields live in `coding_exercises`; reference solutions and hidden
// test cases live in `coding_exercise_private` (RLS: teachers/admins only).

import { supabase } from "@/integrations/supabase/client";

// Keep in sync with ALLOWED_LANGUAGES in
// supabase/functions/generate-coding-exercises/index.ts
export const CODING_LANGUAGES = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "c", label: "C" },
  { value: "go", label: "Go" },
  { value: "ruby", label: "Ruby" },
] as const;

export const languageLabel = (value: string) =>
  CODING_LANGUAGES.find((l) => l.value === value)?.label ?? value;

export interface CodingExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface CodingTestCase {
  input: string;
  expected_output: string;
}

/** Ordered AI quality checks — keep in sync with CHECKS in the
 * `validate-coding-exercise` edge function. */
export const CODING_VALIDATION_CHECKS = [
  { id: "problem_statement", label: "Problem statement" },
  { id: "input_spec", label: "Input specification" },
  { id: "output_spec", label: "Output specification" },
  { id: "constraints", label: "Constraints" },
  { id: "examples", label: "Examples" },
  { id: "test_cases", label: "Test cases" },
] as const;

export type ValidationStatus = "pass" | "warning" | "fail";

export interface ValidationCheck {
  id: string;
  label: string;
  status: ValidationStatus;
  note: string;
}

export interface ValidationReport {
  checks: ValidationCheck[];
  model?: string;
  validated_at?: string;
}

export interface CodingExercise {
  id: string;
  course_id: string;
  week_number: number;
  position: number;
  title: string;
  problem_statement: string;
  language: string;
  input_spec: string;
  output_spec: string;
  constraints: string | null;
  examples: CodingExample[];
  /** Student-visible skeleton code the terminal pre-fills with (no solution logic). */
  starter_code: string | null;
  primary_language: string | null;
  standard_test_cases: CodingTestCase[];
  published: boolean;
  published_at: string | null;
  /** Null until a teacher explicitly marks the exercise reviewed; required before publish. */
  reviewed_at: string | null;
  // Joined from coding_exercise_private (teacher-only; absent for students)
  reference_solution: string;
  hidden_test_cases: CodingTestCase[];
  /** Advisory AI quality review; cleared whenever the exercise is edited. */
  validation_report: ValidationReport | null;
  validated_at: string | null;
}

/**
 * Overall state of a validation report: "fail" when any check failed,
 * "warning" when any warned, "pass" when all passed, null when there is no
 * usable report.
 */
export function summariseValidation(
  report: ValidationReport | null | undefined,
): { overall: ValidationStatus; failed: number; warnings: number; passed: number } | null {
  const checks = report?.checks;
  if (!Array.isArray(checks) || checks.length === 0) return null;
  const failed = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warning").length;
  const passed = checks.filter((c) => c.status === "pass").length;
  const overall: ValidationStatus = failed > 0 ? "fail" : warnings > 0 ? "warning" : "pass";
  return { overall, failed, warnings, passed };
}


/** Student-safe shape — no solutions, no hidden tests. */
export interface PublishedCodingExercise {
  id: string;
  week_number: number;
  position: number;
  title: string;
  problem_statement: string;
  language: string;
  input_spec: string;
  output_spec: string;
  constraints: string | null;
  examples: CodingExample[];
  starter_code: string | null;
  primary_language: string | null;
  standard_test_cases: CodingTestCase[];
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Teacher view: public row + private solution/tests joined. */
export async function fetchWeekExercises(
  courseId: string,
  weekNumber: number,
): Promise<CodingExercise[]> {
  const { data, error } = await supabase
    .from("coding_exercises")
    .select("*, coding_exercise_private(reference_solution, hidden_test_cases)")
    .eq("course_id", courseId)
    .eq("week_number", weekNumber)
    .order("position");
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => {
    const priv = Array.isArray(row.coding_exercise_private)
      ? row.coding_exercise_private[0]
      : row.coding_exercise_private;
    return {
      ...row,
      examples: asArray<CodingExample>(row.examples),
      standard_test_cases: asArray<CodingTestCase>(row.standard_test_cases),
      reference_solution: priv?.reference_solution ?? "",
      hidden_test_cases: asArray<CodingTestCase>(priv?.hidden_test_cases),
    } as CodingExercise;
  });
}

/** Student view: published exercises only, public fields only (RLS enforces both). */
export async function fetchPublishedExercises(
  courseId: string,
): Promise<PublishedCodingExercise[]> {
  const { data, error } = await supabase
    .from("coding_exercises")
    .select(
      "id, week_number, position, title, problem_statement, language, input_spec, output_spec, constraints, examples, starter_code, primary_language, standard_test_cases",
    )
    .eq("course_id", courseId)
    .eq("published", true)
    .order("week_number")
    .order("position");
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    ...row,
    examples: asArray<CodingExample>(row.examples),
    standard_test_cases: asArray<CodingTestCase>(row.standard_test_cases),
  }));
}

/**
 * Pick the exercise a terminal deep link should open: the `exerciseId` match
 * when provided, else the unit's first published exercise, else null.
 */
export function selectTerminalExercise(
  exercises: PublishedCodingExercise[],
  unit: number,
  exerciseId?: string | null,
): PublishedCodingExercise | null {
  return (
    (exerciseId ? exercises.find((e) => e.id === exerciseId) : undefined) ??
    exercises.find((e) => e.week_number === unit) ??
    null
  );
}

/**
 * Terminal deep links carry `freeform=1` when they come from the Practice step
 * of a coding/lab week — those open a blank terminal, so no exercise should be
 * auto-selected. Exercise step cards omit the flag and keep the auto-select.
 */
export function shouldAutoSelectExercise(freeformParam: string | null): boolean {
  return freeformParam !== "1";
}

/** Everything that must be filled before an exercise can be published. */
export function exerciseMissingFields(ex: CodingExercise): string[] {
  const missing: string[] = [];
  if (!ex.title?.trim()) missing.push("title");
  if (!ex.problem_statement?.trim()) missing.push("problem statement");
  if (!ex.input_spec?.trim()) missing.push("input specification");
  if (!ex.output_spec?.trim()) missing.push("output specification");
  if (!ex.examples?.length) missing.push("at least one example");
  if (!ex.standard_test_cases?.length) missing.push("at least one standard test case");
  if (!ex.reference_solution?.trim()) missing.push("reference solution");
  if (!ex.hidden_test_cases?.length) missing.push("at least one hidden test case");
  return missing;
}

export type ExerciseDraft = {
  title: string;
  problem_statement: string;
  language: string;
  input_spec: string;
  output_spec: string;
  constraints: string | null;
  examples: CodingExample[];
  starter_code: string;
  standard_test_cases: CodingTestCase[];
  reference_solution: string;
  hidden_test_cases: CodingTestCase[];
};

/**
 * Saves an exercise draft. Edits invalidate any prior review: `reviewed_at` is
 * reset to null unless `opts.markReviewed` is set (review-mode save), which
 * marks the exercise reviewed in the same update.
 */
export async function updateExercise(
  id: string,
  draft: ExerciseDraft,
  opts?: { markReviewed?: boolean },
): Promise<void> {
  const { reference_solution, hidden_test_cases, ...pub } = draft;
  const { error: pubErr } = await supabase
    .from("coding_exercises")
    .update({
      ...pub,
      constraints: pub.constraints?.trim() ? pub.constraints : null,
      starter_code: pub.starter_code?.trim() ? pub.starter_code : null,
      examples: pub.examples as any,
      standard_test_cases: pub.standard_test_cases as any,
      reviewed_at: opts?.markReviewed ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (pubErr) throw pubErr;
  const { error: privErr } = await supabase
    .from("coding_exercise_private")
    .update({ reference_solution, hidden_test_cases: hidden_test_cases as any })
    .eq("exercise_id", id);
  if (privErr) throw privErr;
}

/** Marks an exercise reviewed without changing its content. */
export async function markExerciseReviewed(id: string): Promise<void> {
  const { error } = await supabase
    .from("coding_exercises")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteExercise(id: string): Promise<void> {
  const { error } = await supabase.from("coding_exercises").delete().eq("id", id);
  if (error) throw error;
}

export async function setWeekExercisesPublished(
  courseId: string,
  weekNumber: number,
  published: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("coding_exercises")
    .update({ published, published_at: published ? new Date().toISOString() : null })
    .eq("course_id", courseId)
    .eq("week_number", weekNumber);
  if (error) throw error;
}

export async function deleteWeekExercises(courseId: string, weekNumber: number): Promise<void> {
  const { error } = await supabase
    .from("coding_exercises")
    .delete()
    .eq("course_id", courseId)
    .eq("week_number", weekNumber);
  if (error) throw error;
}

/**
 * Follow lesson-plan week renumbering (drag-reorder) so exercises stay attached
 * to their week. Maps old week_number -> new week_number; rows whose number is
 * unchanged are skipped.
 */
export async function renumberExercises(
  courseId: string,
  oldToNew: Map<number, number>,
): Promise<void> {
  if (oldToNew.size === 0) return;
  const { data, error } = await supabase
    .from("coding_exercises")
    .select("id, week_number")
    .eq("course_id", courseId);
  if (error) throw error;
  const updates = (data ?? [])
    .map((row) => ({ id: row.id as string, next: oldToNew.get(row.week_number) }))
    .filter(
      (u): u is { id: string; next: number } =>
        typeof u.next === "number" && u.next !== undefined,
    );
  for (const u of updates) {
    const { error: upErr } = await supabase
      .from("coding_exercises")
      .update({ week_number: u.next })
      .eq("id", u.id);
    if (upErr) throw upErr;
  }
}
