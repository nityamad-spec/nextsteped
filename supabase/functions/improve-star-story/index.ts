/**
 * improve-star-story
 *
 * Purpose:
 *   Rewrites a student's behavioural interview story into a tighter STAR
 *   answer: crisper structure, first-person voice, and prompts for concrete
 *   numbers where the student left them out.
 *
 * Auth:
 *   Bearer token of the student.
 *
 * Input:
 *   { title?, themes?: string[], situation, task, action, result, role? }
 *
 * Output:
 *   { improved: { title, situation, task, action, result }, notes?: string[] }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "google/gemini-3.1-flash-lite";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const BodySchema = z.object({
  title: z.string().max(200).optional().default(""),
  themes: z.array(z.string().max(80)).max(12).optional().default([]),
  situation: z.string().max(3000).optional().default(""),
  task: z.string().max(3000).optional().default(""),
  action: z.string().max(3000).optional().default(""),
  result: z.string().max(3000).optional().default(""),
  role: z.string().max(120).optional().default(""),
});

const SYSTEM_PROMPT =
  `You are an interview coach helping a student sharpen a behavioural (STAR) interview story.
Rewrite the story so it can be told aloud in under 2 minutes.
Rules:
- Keep the student's real facts. Never invent an employer, metric, or outcome that is not implied by the input.
- Where a concrete number is clearly missing, insert a short bracketed prompt like [add number: how many users?] instead of making one up.
- First person, plain language, no buzzwords.
- Situation: 1-2 sentences of context. Task: 1 sentence on your responsibility. Action: 3-5 crisp sentences, mostly "I" not "we". Result: 1-2 sentences with outcome and impact.
- Also return a short, specific title (max 10 words).
Respond with JSON only.`;

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "improved_star_story",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        situation: { type: "string" },
        task: { type: "string" },
        action: { type: "string" },
        result: { type: "string" },
        notes: { type: "array", items: { type: "string" } },
      },
      required: ["title", "situation", "task", "action", "result", "notes"],
    },
  },
};

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

  let body: z.infer<typeof BodySchema>;
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json(
        { error: "invalid_body", details: parsed.error.flatten() },
        400,
      );
    }
    body = parsed.data;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const filled = [body.situation, body.task, body.action, body.result]
    .join("").trim();
  if (!filled) return json({ error: "empty_story" }, 400);

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "missing_api_key" }, 500);

  const userPrompt = [
    body.role ? `Target role: ${body.role}` : "",
    body.themes.length ? `Themes it should show: ${body.themes.join(", ")}` : "",
    body.title ? `Current title: ${body.title}` : "",
    `Situation: ${body.situation || "(empty)"}`,
    `Task: ${body.task || "(empty)"}`,
    `Action: ${body.action || "(empty)"}`,
    `Result: ${body.result || "(empty)"}`,
  ].filter(Boolean).join("\n");

  try {
    const res = await loggedGatewayFetch(
      "improve-star-story",
      { model: MODEL, purpose: "improve_star_story", course_id: null },
      GATEWAY_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 900,
          response_format: RESPONSE_FORMAT,
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error(
        `improve-star-story gateway ${res.status}: ${text.slice(0, 300)}`,
      );
      if (res.status === 429) {
        return json({ error: "rate_limited" }, 429);
      }
      if (res.status === 402 || res.status === 403) {
        return json({ error: "ai_unavailable" }, res.status);
      }
      return json({ error: "gateway_error" }, 502);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      return json({ error: "unparsable_response" }, 502);
    }

    const str = (v: unknown, fallback: string) =>
      typeof v === "string" && v.trim() ? v.trim() : fallback;

    return json({
      improved: {
        title: str(parsed.title, body.title),
        situation: str(parsed.situation, body.situation),
        task: str(parsed.task, body.task),
        action: str(parsed.action, body.action),
        result: str(parsed.result, body.result),
      },
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.filter((n): n is string => typeof n === "string").slice(0, 5)
        : [],
    });
  } catch (e) {
    console.error(
      "improve-star-story failed:",
      e instanceof Error ? e.message : e,
    );
    return json({ error: "call_failed" }, 502);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
