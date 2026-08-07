/**
 * evaluate-reasoning
 *
 * Purpose:
 *   Judges a student's written rationale for a Bloom 3+ question. The model
 *   either accepts or rejects the reasoning and returns the correct semantic
 *   reasoning for the item. Formative only — no scoring or mastery impact.
 *
 * Auth:
 *   Bearer token of the student.
 *
 * Input (single or batched):
 *   { course_id?, items: [{ question_id, question_text, options?,
 *     correct_answer, selected_answer?, topic?, bloom_level?, rationale_text }] }
 *   A single item may also be posted at the top level.
 *
 * Output:
 *   { results: [{ question_id, verdict: "accepted"|"rejected"|null,
 *                 feedback, model_reasoning }] }
 *   A null verdict means "unevaluated" — the caller advances the student anyway.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";
import {
  buildUserPrompt,
  type EvaluationResult,
  parseEvaluation,
  RESPONSE_FORMAT,
  SYSTEM_PROMPT,
} from "./parse.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "google/gemini-3.1-flash-lite";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const CALL_TIMEOUT_MS = 15_000;
const MAX_ITEMS = 12;

const ItemSchema = z.object({
  question_id: z.string().min(1),
  question_text: z.string().min(1).max(4000),
  options: z.array(z.string().max(1000)).max(10).optional(),
  correct_answer: z.string().max(2000).optional().default(""),
  selected_answer: z.string().max(2000).nullable().optional(),
  topic: z.string().max(300).nullable().optional(),
  bloom_level: z.number().int().min(1).max(6).optional(),
  rationale_text: z.string().min(1).max(4000),
});

const BodySchema = z.union([
  z.object({ items: z.array(ItemSchema).min(1).max(MAX_ITEMS) }),
  ItemSchema.transform((item) => ({ items: [item] })),
]);

type Item = z.infer<typeof ItemSchema>;

const unevaluated = (questionId: string): EvaluationResult => ({
  question_id: questionId,
  verdict: null,
  feedback: "",
  model_reasoning: "",
});

async function evaluateOne(
  item: Item,
  apiKey: string,
  courseId: string | null,
): Promise<EvaluationResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await loggedGatewayFetch(
      "evaluate-reasoning",
      {
        model: MODEL,
        purpose: "evaluate_student_rationale",
        course_id: courseId,
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
        `evaluate-reasoning gateway ${res.status}: ${body.slice(0, 300)}`,
      );
      return unevaluated(item.question_id);
    }
    return parseEvaluation(await res.json(), item.question_id);
  } catch (e) {
    console.error(
      "evaluate-reasoning call failed:",
      e instanceof Error ? e.message : e,
    );
    return unevaluated(item.question_id);
  } finally {
    clearTimeout(timer);
  }
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
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "invalid_auth" }, 401);

  let items: Item[];
  let courseId: string | null = null;
  try {
    const raw = await req.json();
    courseId = typeof raw?.course_id === "string" ? raw.course_id : null;
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { error: "invalid_body", details: parsed.error.flatten() },
        400,
      );
    }
    items = parsed.data.items;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "missing_api_key" }, 500);

  const results = await Promise.all(
    items.map((item) => evaluateOne(item, apiKey, courseId)),
  );

  return json({ results });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
