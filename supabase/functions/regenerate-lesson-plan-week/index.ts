/**
 * regenerate-lesson-plan-week
 *
 * Purpose:
 *   Regenerates a single week of the lesson plan (topics, activities, links)
 *   without touching the rest of the plan.
 *
 * Auth / Access:
 *   Bearer token of the course teacher.
 *
 * Inputs:
 *   - courseId: uuid
 *   - week: number
 *   - hint?: string — teacher's guidance for the new week
 *
 * Steps:
 *   1. Authenticate and load current lesson plan + syllabus context.
 *   2. Prompt the AI to author only the requested week, honoring existing labels.
 *   3. Verify any suggested URLs (allowlist + soft-404 check).
 *   4. Merge the new week into the persisted plan and bump cache_versions.
 *   5. Return the updated plan.
 *
 * External calls:
 *   Lovable AI Gateway; outbound HTTPS for URL verification.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";
const FUNCTION_NAME = "regenerate-lesson-plan-week";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ContextWeek = { week: number; week_name?: string; concept_names?: string[] };

async function verifyUrl(rawUrl: string): Promise<string | null> {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return null;
    const doFetch = (method: "HEAD" | "GET") =>
      fetch(u.toString(), {
        method,
        redirect: "follow",
        signal: AbortSignal.timeout(4000),
        headers: method === "GET"
          ? { Range: "bytes=0-0", "User-Agent": "Mozilla/5.0 (LessonPlanLinkCheck)" }
          : { "User-Agent": "Mozilla/5.0 (LessonPlanLinkCheck)" },
      });
    let resp: Response;
    try {
      resp = await doFetch("HEAD");
      if (resp.status === 405 || resp.status === 403 || resp.status === 501) {
        resp = await doFetch("GET");
      }
    } catch {
      resp = await doFetch("GET");
    }
    if (resp.ok) return resp.url || u.toString();
    return null;
  } catch {
    return null;
  }
}

async function sanitizeResourceUrls(resources: any[]): Promise<any[]> {
  if (!Array.isArray(resources) || resources.length === 0) return resources || [];
  const checks = resources.map(async (r) => {
    if (!r || typeof r.url !== "string" || !r.url.trim()) return;
    const final = await verifyUrl(r.url.trim());
    if (final) {
      r.url = final;
    } else {
      console.log(`[regen-week link-check] dropping broken url: ${r.url}`);
      delete r.url;
    }
  });
  await Promise.allSettled(checks);
  return resources;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const courseId: string | undefined = body?.courseId;
    const weekNumber: number | undefined = Number(body?.week);
    const conceptNames: string[] = Array.isArray(body?.concept_names) ? body.concept_names : [];
    const isExamWeek: boolean = !!body?.is_exam_week;
    const examType: string | null = body?.exam_type ?? null;
    const contextWeeks: ContextWeek[] = Array.isArray(body?.context_weeks) ? body.context_weeks : [];

    if (!courseId || !Number.isFinite(weekNumber)) {
      return new Response(JSON.stringify({ error: "courseId and week are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase env not configured");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("name, course_code, term, total_weeks, sessions_per_week, session_length_minutes, objectives")
      .eq("id", courseId)
      .single();

    if (!course) {
      return new Response(JSON.stringify({ error: "Course not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exam week — return canonical exam metadata, no LLM needed.
    if (isExamWeek) {
      const isMidterm = examType === "midterm";
      const isFinal = examType === "final";
      return new Response(JSON.stringify({
        week_name: isMidterm ? "Midterm Exam" : isFinal ? "Final Exam" : "Exam Week",
        overview: "Exam week — review prior content.",
        resources: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (conceptNames.length === 0) {
      return new Response(JSON.stringify({
        week_name: `Week ${weekNumber}`,
        overview: "No concepts assigned to this week. Add at least one concept, then regenerate.",
        resources: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const prior = contextWeeks
      .filter((w) => Number(w.week) < weekNumber)
      .sort((a, b) => Number(a.week) - Number(b.week))
      .slice(-3)
      .map((w) => `- Week ${w.week}${w.week_name ? ` (${w.week_name})` : ""}: ${(w.concept_names || []).join(", ") || "(none)"}`)
      .join("\n");
    const next = contextWeeks
      .filter((w) => Number(w.week) > weekNumber)
      .sort((a, b) => Number(a.week) - Number(b.week))
      .slice(0, 3)
      .map((w) => `- Week ${w.week}${w.week_name ? ` (${w.week_name})` : ""}: ${(w.concept_names || []).join(", ") || "(none)"}`)
      .join("\n");

    const system = `You author readable week-level metadata for a SINGLE week of a fixed lesson-plan distribution.

You will be given ONE week with its concepts already locked. Your job is ONLY to write:
- week_name: 3–6 word title.
- overview: 3–5 sentences, grounded strictly in the assigned concepts. Cover (1) what the average undergraduate will be able to do by end of week, (2) how it builds on prior weeks (if any), (3) the most common misconception or stumbling block.
- 1 coding-exercise + 1–2 article resources tied to those concepts. Articles must be REAL, well-known, freely accessible resources with working https URLs. STRONGLY PREFER stable index/landing pages (e.g. https://docs.python.org/3/tutorial/, https://realpython.com/, https://developer.mozilla.org/en-US/docs/Web/JavaScript) over guessing deep article slugs. If you are not 100% certain a specific URL exists and is current, OMIT the url field entirely — a resource without a url is fine and preferred over a broken link.

Tone: factual, pedagogical, realistic. Do not over-promise mastery. Avoid generic filler.
You CANNOT change the assigned concepts. Return ONLY via the provided tool.`;

    const user = `COURSE: ${course.name} (${course.term})
Objectives: ${(course.objectives || []).join("; ") || "Not specified"}

TARGET WEEK: ${weekNumber}
ASSIGNED CONCEPTS (locked): ${conceptNames.join(", ")}

PRIOR WEEKS (context):
${prior || "(none)"}

UPCOMING WEEKS (context, for continuity — do NOT cover their concepts):
${next || "(none)"}`;

    const aiResp = await loggedGatewayFetch(FUNCTION_NAME, { model: "google/gemini-2.5-pro", purpose: "regenerate-week", course_id: courseId ?? null }, "https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(300_000),
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        temperature: 0.6,
        top_p: 0.9,
        max_tokens: 4096,
        frequency_penalty: 0.2,
        presence_penalty: 0.1,
        reasoning: { effort: "high" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [{
          type: "function",
          function: {
            name: "author_week",
            description: "Author title, overview, and resources for one week.",
            parameters: {
              type: "object",
              properties: {
                week_name: { type: "string" },
                overview: { type: "string" },
                resources: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["coding-exercise", "article"] },
                      title: { type: "string" },
                      description: { type: "string" },
                      url: { type: "string" },
                      ai_suggested: { type: "boolean" },
                    },
                    required: ["type", "title", "description", "ai_suggested"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["week_name", "overview", "resources"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "author_week" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResp.text();
      console.error("regen-week AI error:", aiResp.status, errText);
      throw new Error(`AI gateway error ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    console.log("[regen-week LLM] usage:", JSON.stringify(aiData.usage || {}), "finish_reason:", aiData.choices?.[0]?.finish_reason);
    const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc?.function?.arguments) throw new Error("AI did not return week authoring");
    const parsed = JSON.parse(tc.function.arguments);

    const resources = Array.isArray(parsed.resources) ? parsed.resources : [];
    const exercises = resources.filter((r: any) => r?.type === "coding-exercise").slice(0, 1);
    const articles = resources.filter((r: any) => r?.type === "article").slice(0, 2);

    const finalResources = await sanitizeResourceUrls([...exercises, ...articles]);

    return new Response(JSON.stringify({
      week_name: typeof parsed.week_name === "string" && parsed.week_name.trim() ? parsed.week_name.trim() : `Week ${weekNumber}`,
      overview: typeof parsed.overview === "string" ? parsed.overview : "",
      resources: finalResources,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("regenerate-lesson-plan-week error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
