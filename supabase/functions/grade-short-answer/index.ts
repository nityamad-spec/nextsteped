/**
 * grade-short-answer
 *
 * Purpose:
 *   Grades a student's short free-text answer as accepted / rejected and
 *   persists the grade onto the response row the caller already inserted into
 *   `student_answer_rationales` (response_kind = 'short_answer').
 *
 * Auth:
 *   Bearer token of the student. The row must belong to that student.
 *
 * Input (single item, or { items: [...] } up to 12):
 *   { course_id?, question_id, question_text, student_answer, model_answer?,
 *     answer?, topic?, bloom_level?, source_result_id? }
 *
 * Output:
 *   { results: [{ question_id, verdict, feedback, model_reasoning,
 *                 graded_by, reason? }] }
 *   A null verdict means "ungraded" — the caller advances the student anyway.
 *
 * Scope: grading + persistence only. The caller owns row creation.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";
import {
  buildUserPrompt,
  EXACT_MATCH_FEEDBACK,
  exactMatch,
  type GradeItem,
  type GradeResult,
  parseGrade,
  referenceAnswer,
  RESPONSE_FORMAT,
  SYSTEM_PROMPT,
} from "./grade.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "google/gemini-3.1-flash-lite";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const CALL_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 600;
const MAX_ITEMS = 12;

const ItemSchema = z.object({
  question_id: z.string().min(1).max(200),
  question_text: z.string().min(1).max(4000),
  student_answer: z.string().min(1).max(4000),
  model_answer: z.string().max(4000).nullable().optional(),
  answer: z.string().max(2000).nullable().optional(),
  topic: z.string().max(300).nullable().optional(),
  bloom_level: z.number().int().min(1).max(6).optional(),
  source_result_id: z.string().uuid().nullable().optional(),
});

const BodySchema = z.union([
  z.object({ items: z.array(ItemSchema).min(1).max(MAX_ITEMS) }),
  ItemSchema.transform((item) => ({ items: [item] })),
]);

type Item = z.infer<typeof ItemSchema>;

interface Outcome extends GradeResult {
  reason?: string;
}

const ungraded = (questionId: string, reason: string): Outcome => ({
  question_id: questionId,
  verdict: null,
  feedback: "",
  model_reasoning: "",
  graded_by: null,
  reason,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGateway(
  item: GradeItem,
  apiKey: string,
  courseId: string | null,
  attempt: number,
): Promise<{ result: Outcome | null; retryable: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await loggedGatewayFetch(
      "grade-short-answer",
      {
        model: MODEL,
        purpose: "grade_short_answer",
        course_id: courseId,
        attempt,
        total_attempts: 2,
        context: { question_id: item.question_id, graded_by: "model" },
      },
      GATEWAY_URL,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(item) },
          ],
          temperature: 0.2,
          max_tokens: 400,
          response_format: RESPONSE_FORMAT,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error(
        `grade-short-answer gateway ${res.status}: ${body.slice(0, 300)}`,
      );
      const retryable = res.status === 429 || res.status >= 500;
      return {
        result: retryable ? null : ungraded(item.question_id, `gateway_${res.status}`),
        retryable,
      };
    }
    return { result: parseGrade(await res.json(), item.question_id), retryable: false };
  } catch (e) {
    console.error(
      "grade-short-answer call failed:",
      e instanceof Error ? e.message : e,
    );
    return { result: null, retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

async function gradeOne(
  item: Item,
  apiKey: string,
  courseId: string | null,
): Promise<Outcome> {
  // Deterministic pre-check: a normalised match with a reference answer is
  // accepted outright, with no gateway call. Never used to reject.
  if (exactMatch(item.student_answer, [item.model_answer, item.answer])) {
    return {
      question_id: item.question_id,
      verdict: "accepted",
      feedback: EXACT_MATCH_FEEDBACK,
      model_reasoning: referenceAnswer(item),
      graded_by: "exact_match",
    };
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { result, retryable } = await callGateway(item, apiKey, courseId, attempt);
    if (result) return result;
    if (!retryable || attempt === 2) break;
    await sleep(RETRY_DELAY_MS);
  }
  return ungraded(item.question_id, "grading_unavailable");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "missing_auth" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "invalid_auth" }, 401);
  const studentId = userRes.user.id;

  let items: Item[];
  let courseId: string | null = null;
  try {
    const raw = await req.json();
    courseId = typeof raw?.course_id === "string" ? raw.course_id : null;
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
    }
    items = parsed.data.items;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "missing_api_key" }, 500);
  if (!SERVICE_ROLE) return json({ error: "missing_service_role" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Locate every caller-created row up front; a missing row is a hard 404 for
  // that item since this function never creates one.
  const located = await Promise.all(items.map(async (item) => {
    let q = admin
      .from("student_answer_rationales")
      .select("id, ai_verdict")
      .eq("student_id", studentId)
      .eq("question_id", item.question_id)
      .eq("response_kind", "short_answer")
      .order("created_at", { ascending: false })
      .limit(1);
    if (item.source_result_id) q = q.eq("source_result_id", item.source_result_id);
    const { data, error } = await q.maybeSingle();
    if (error) console.error("row lookup failed:", error.message);
    return { item, row: data ?? null };
  }));

  const missing = located.filter((l) => !l.row).map((l) => l.item.question_id);
  if (missing.length === items.length) {
    return json({ error: "response_row_not_found", question_ids: missing }, 404);
  }

  const results: Outcome[] = await Promise.all(
    located.map(async ({ item, row }) => {
      if (!row) return ungraded(item.question_id, "response_row_not_found");

      // Idempotency: a landed grade is never overwritten.
      if (row.ai_verdict) {
        return {
          question_id: item.question_id,
          verdict: row.ai_verdict as "accepted" | "rejected",
          feedback: "",
          model_reasoning: "",
          graded_by: null,
          reason: "already_graded",
        };
      }

      const outcome = await gradeOne(item, apiKey, courseId);
      if (!outcome.verdict) return outcome;

      const { error: updErr } = await admin
        .from("student_answer_rationales")
        .update({
          ai_verdict: outcome.verdict,
          ai_feedback: outcome.feedback || null,
          ai_model_reasoning: outcome.model_reasoning || null,
          ai_evaluated_at: new Date().toISOString(),
          model_answer_snapshot: referenceAnswer(item) || null,
        })
        .eq("id", row.id)
        .is("ai_verdict", null);
      if (updErr) {
        console.error("grade persist failed:", updErr.message);
        return { ...outcome, reason: "persist_failed" };
      }
      return outcome;
    }),
  );

  return json({ results });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
