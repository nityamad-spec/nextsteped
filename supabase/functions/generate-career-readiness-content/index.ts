/**
 * generate-career-readiness-content
 *
 * Drafts Career Readiness content for one course (skills-training pathway):
 * interview rounds, "what they're really testing" questions, most-tested
 * skills, STAR common prompts, and mock interview types with prompts.
 *
 * The draft is returned to the professor for review/edit — nothing is written
 * to the database here.
 *
 * Auth:    Bearer token of a course teacher, collaborator, or admin.
 * Inputs:  { course_id: uuid, section: "understand" | "prepare" | "practice" | "all" }
 * Output:  { draft: { interview_rounds?, tested_questions?, tested_skills?,
 *                     common_prompts?, mock_types? } }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";

const FUNCTION_NAME = "generate-career-readiness-content";
const MODEL = "openai/gpt-6-astra";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SECTIONS = ["understand", "prepare", "practice", "all"] as const;
type Section = (typeof SECTIONS)[number];

const ICONS = ["code", "network", "brain", "star", "sparkles"];
const ACCENTS = ["blue", "purple", "orange", "green", "pink"];

function schemaFor(section: Section) {
  const props: Record<string, unknown> = {};
  const required: string[] = [];

  if (section === "understand" || section === "all") {
    props.interview_rounds = {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          weight: { type: "integer" },
        },
        required: ["title", "description", "weight"],
        additionalProperties: false,
      },
    };
    props.tested_questions = {
      type: "array",
      items: {
        type: "object",
        properties: { question: { type: "string" }, guidance: { type: "string" } },
        required: ["question", "guidance"],
        additionalProperties: false,
      },
    };
    props.tested_skills = { type: "array", items: { type: "string" } };
    required.push("interview_rounds", "tested_questions", "tested_skills");
  }

  if (section === "prepare" || section === "all") {
    props.common_prompts = {
      type: "array",
      items: {
        type: "object",
        properties: { question: { type: "string" }, guidance: { type: "string" } },
        required: ["question", "guidance"],
        additionalProperties: false,
      },
    };
    required.push("common_prompts");
  }

  if (section === "practice" || section === "all") {
    props.mock_types = {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          minutes: { type: "integer" },
          description: { type: "string" },
          icon: { type: "string", enum: ICONS },
          accent: { type: "string", enum: ACCENTS },
          target: { type: "integer" },
          prompt: {
            type: "object",
            properties: { question: { type: "string" }, followUp: { type: "string" } },
            required: ["question", "followUp"],
            additionalProperties: false,
          },
        },
        required: ["title", "minutes", "description", "icon", "accent", "target", "prompt"],
        additionalProperties: false,
      },
    };
    required.push("mock_types");
  }

  return {
    type: "object",
    properties: props,
    required,
    additionalProperties: false,
  };
}

function instructionsFor(section: Section): string {
  const parts: string[] = [
    "You prepare interview-readiness material for a university course that trains students for a specific job role.",
    "Write concrete, role-specific content a professor can hand to final-year students. No filler, no marketing language.",
  ];
  if (section === "understand" || section === "all") {
    parts.push(
      "interview_rounds: exactly 4 rounds of a realistic hiring loop for the role; weight is a percentage and the four weights must sum to 100.",
      "tested_questions: 4 questions interviewers actually ask, each with one sentence on what a strong answer does.",
      "tested_skills: 4 short skill labels (1-3 words each).",
    );
  }
  if (section === "prepare" || section === "all") {
    parts.push(
      "common_prompts: 5 behavioural prompts students should prepare STAR stories for, each with one sentence of guidance.",
    );
  }
  if (section === "practice" || section === "all") {
    parts.push(
      "mock_types: 4-5 mock interview types for this role. minutes between 20 and 90, target is how many mocks of that type a student should complete (between 4 and 10), description is one line, and prompt is a realistic session question plus a follow-up probe. Give each type a different icon and accent from the allowed values.",
    );
  }
  return parts.join("\n");
}

async function run(req: Request): Promise<{ status: number; payload: unknown }> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { status: 401, payload: { error: "Not authenticated" } };
  }
  const token = authHeader.slice("Bearer ".length);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return { status: 401, payload: { error: "Not authenticated" } };
  }
  const userId = claimsData.claims.sub as string;

  const body = await req.json().catch(() => null);
  const courseId = typeof body?.course_id === "string" ? body.course_id.trim() : "";
  const section = (typeof body?.section === "string" ? body.section : "all") as Section;
  if (!/^[0-9a-f-]{36}$/i.test(courseId)) {
    return { status: 400, payload: { error: "course_id (uuid) is required" } };
  }
  if (!SECTIONS.includes(section)) {
    return { status: 400, payload: { error: "section must be understand, prepare, practice or all" } };
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: course } = await admin
    .from("courses")
    .select("id, teacher_id, name, code, target_role, course_type")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return { status: 404, payload: { error: "Course not found" } };

  let allowed = course.teacher_id === userId;
  if (!allowed) {
    const { data: ct } = await admin
      .from("course_teachers")
      .select("teacher_id")
      .eq("course_id", courseId)
      .eq("teacher_id", userId)
      .maybeSingle();
    allowed = !!ct;
  }
  if (!allowed) {
    const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    allowed = prof?.role === "admin";
  }
  if (!allowed) return { status: 403, payload: { error: "Forbidden" } };

  const { data: concepts } = await admin
    .from("concepts")
    .select("concept_code")
    .eq("course_id", courseId)
    .limit(40);

  const conceptList = (concepts ?? [])
    .map((c: any) => c?.concept_code)
    .filter(Boolean)
    .join(", ");

  const input = `COURSE: ${course.name ?? ""} (${course.code ?? ""})
TARGET ROLE: ${course.target_role || "entry-level technical role"}
COURSE CONCEPTS: ${conceptList || "(not listed)"}

Draft the requested content for this role.`;

  const resp = await loggedGatewayFetch(
    FUNCTION_NAME,
    {
      model: MODEL,
      purpose: `career-readiness-${section}`,
      attempt: 1,
      total_attempts: 1,
      teacher_id: userId,
      course_id: courseId,
      context: { section },
    },
    "https://ai.gateway.lovable.dev/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        instructions: instructionsFor(section),
        input,
        stream: false,
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 6000,
        text: {
          format: {
            type: "json_schema",
            name: "career_readiness_draft",
            strict: true,
            schema: schemaFor(section),
          },
        },
      }),
    },
  );

  if (!resp.ok) {
    const status = resp.status;
    const errText = await resp.text().catch(() => "");
    console.error(`[career-readiness] gateway ${status}:`, errText.slice(0, 400));
    let msg = `AI gateway error (HTTP ${status}).`;
    if (status === 429) msg = "Rate limited by the AI gateway. Try again shortly.";
    else if (status === 402) msg = "AI credits exhausted. Add funds in Settings > Workspace > Usage.";
    return { status: status === 429 || status === 402 ? status : 502, payload: { error: msg } };
  }

  const json = await resp.json();
  let text: string = typeof json?.output_text === "string" ? json.output_text : "";
  if (!text && Array.isArray(json?.output)) {
    for (const item of json.output) {
      for (const c of item?.content ?? []) {
        if (typeof c?.text === "string") text += c.text;
      }
    }
  }
  let draft: unknown;
  try {
    draft = JSON.parse(text);
  } catch {
    console.error("[career-readiness] unparseable draft:", text.slice(0, 300));
    return { status: 502, payload: { error: "The AI returned an unreadable draft. Try again." } };
  }

  return { status: 200, payload: { draft } };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { status, payload } = await run(req);
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[${FUNCTION_NAME}]`, e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
