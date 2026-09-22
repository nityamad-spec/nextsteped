// Daily-practice ("Daily DSA") question bank — mirrors codingExercises.ts but
// backed by the dedicated daily_dsa_questions / daily_dsa_question_private /
// daily_dsa_attempts tables. The student Daily DSA card picks from this bank.

import { supabase } from "@/integrations/supabase/client";
import type {
  CodingExercise,
  ExerciseDraft,
  PublishedCodingExercise,
  ValidationProgress,
  ValidationReport,
} from "@/lib/codingExercises";

/** A daily DSA question is structurally identical to a coding exercise. */
export type DailyDsaQuestion = CodingExercise;
export type PublishedDailyDsaQuestion = PublishedCodingExercise;

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Teacher view: all questions for the course, private fields joined. */
export async function fetchDailyDsaQuestions(courseId: string): Promise<DailyDsaQuestion[]> {
  const { data, error } = await supabase
    .from("daily_dsa_questions")
    .select(
      "*, daily_dsa_question_private(reference_solution, hidden_test_cases, validation_report, validated_at)",
    )
    .eq("course_id", courseId)
    .order("week_number")
    .order("position");
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => {
    const priv = Array.isArray(row.daily_dsa_question_private)
      ? row.daily_dsa_question_private[0]
      : row.daily_dsa_question_private;
    return {
      ...row,
      examples: asArray(row.examples),
      standard_test_cases: asArray(row.standard_test_cases),
      reference_solution: priv?.reference_solution ?? "",
      hidden_test_cases: asArray(priv?.hidden_test_cases),
      validation_report: (priv?.validation_report as ValidationReport | null) ?? null,
      validated_at: priv?.validated_at ?? null,
    } as DailyDsaQuestion;
  });
}

/** Student view: published questions only, public fields only (RLS enforces both). */
export async function fetchPublishedDailyDsaQuestions(
  courseId: string,
): Promise<PublishedDailyDsaQuestion[]> {
  const { data, error } = await supabase
    .from("daily_dsa_questions")
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
    examples: asArray(row.examples),
    standard_test_cases: asArray(row.standard_test_cases),
  }));
}

/**
 * Saves a question draft. Edits invalidate any prior review: `reviewed_at` is
 * reset to null unless `opts.markReviewed` is set.
 */
export async function updateDailyDsaQuestion(
  id: string,
  draft: ExerciseDraft,
  opts?: { markReviewed?: boolean },
): Promise<void> {
  const { reference_solution, hidden_test_cases, ...pub } = draft;
  const { error: pubErr } = await supabase
    .from("daily_dsa_questions")
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
  // Any content edit invalidates the AI validation report.
  const { error: privErr } = await supabase
    .from("daily_dsa_question_private")
    .update({
      reference_solution,
      hidden_test_cases: hidden_test_cases as any,
      validation_report: null,
      validated_at: null,
    })
    .eq("question_id", id);
  if (privErr) throw privErr;
}

/** Marks a question reviewed without changing its content. */
export async function markDailyDsaQuestionReviewed(id: string): Promise<void> {
  const { error } = await supabase
    .from("daily_dsa_questions")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteDailyDsaQuestion(id: string): Promise<void> {
  const { error } = await supabase.from("daily_dsa_questions").delete().eq("id", id);
  if (error) throw error;
}

/** Publishes (or unpublishes) the whole bank at once. */
export async function setDailyDsaBankPublished(courseId: string, published: boolean): Promise<void> {
  const { error } = await supabase
    .from("daily_dsa_questions")
    .update({ published, published_at: published ? new Date().toISOString() : null })
    .eq("course_id", courseId);
  if (error) throw error;
}

/**
 * Runs the AI quality review for one question. Streams NDJSON progress frames
 * into `onProgress`, resolves with the final report.
 */
export async function runDailyDsaQuestionValidation(
  questionId: string,
  onProgress: (p: ValidationProgress) => void,
): Promise<ValidationReport> {
  const { data: sess } = await supabase.auth.getSession();
  const accessToken = sess.session?.access_token;
  if (!accessToken) throw new Error("Not authenticated");

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-daily-dsa-question`;
  const resp = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    },
    body: JSON.stringify({ question_id: questionId }),
  });
  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `HTTP ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finalFrame: { type: string; payload?: any; message?: string } | null = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let frame: any;
      try {
        frame = JSON.parse(line);
      } catch {
        continue;
      }
      if (frame?.type === "progress") {
        onProgress(frame as ValidationProgress);
      } else if (frame?.type === "result" || frame?.type === "error") {
        finalFrame = frame;
      }
    }
  }
  if (!finalFrame) throw new Error("Validation was interrupted");
  if (finalFrame.type === "error") throw new Error(finalFrame.message || "Validation failed");
  const payload = finalFrame.payload ?? {};
  if (payload?.error) throw new Error(payload.error);
  const report = payload?.report as ValidationReport | undefined;
  if (!report?.checks?.length) throw new Error("Validation returned no results");
  return report;
}

export interface DailyDsaGenerationProgress {
  stage: string;
  week?: number;
  generated: number;
  weeksDone: number;
  totalWeeks: number;
}

/**
 * Bulk-generates the course's daily-practice bank (drafts). Streams NDJSON
 * progress frames into `onProgress`, resolves with the final payload.
 */
export async function generateDailyDsaBank(
  courseId: string,
  opts: { count: number; language: string; hint?: string },
  onProgress: (p: DailyDsaGenerationProgress) => void,
): Promise<{ generated: number; total_in_bank: number }> {
  const { data: sess } = await supabase.auth.getSession();
  const accessToken = sess.session?.access_token;
  if (!accessToken) throw new Error("Not authenticated");

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-daily-dsa-questions`;
  const resp = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    },
    body: JSON.stringify({
      course_id: courseId,
      count: opts.count,
      language: opts.language,
      hint: opts.hint ?? "",
    }),
  });
  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `HTTP ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finalFrame: { type: string; status?: number; payload?: any; message?: string } | null = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let frame: any;
      try {
        frame = JSON.parse(line);
      } catch {
        continue;
      }
      if (frame?.type === "progress") {
        onProgress(frame as DailyDsaGenerationProgress);
      } else if (frame?.type === "result" || frame?.type === "error") {
        finalFrame = frame;
      }
    }
  }
  if (!finalFrame) throw new Error("Generation was interrupted");
  if (finalFrame.type === "error") throw new Error(finalFrame.message || "Generation failed");
  const payload = finalFrame.payload ?? {};
  if (payload?.error) throw new Error(payload.error);
  return payload as { generated: number; total_in_bank: number };
}
