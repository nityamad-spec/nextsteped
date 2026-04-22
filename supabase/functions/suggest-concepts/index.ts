// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { courseId, existingConcepts = [] } = await req.json();
    if (!courseId) {
      return new Response(JSON.stringify({ error: "courseId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch course + uploaded materials snapshot for grounding
    const { data: course } = await admin
      .from("courses")
      .select("name, course_code, objectives, syllabus_json_path")
      .eq("id", courseId)
      .maybeSingle();

    let materialContext = "";
    if (course?.syllabus_json_path) {
      try {
        const { data: blob } = await admin.storage
          .from("course-materials")
          .download(course.syllabus_json_path);
        if (blob) {
          const txt = await blob.text();
          materialContext = txt.slice(0, 12000);
        }
      } catch (e) {
        console.warn("syllabus fetch failed:", e);
      }
    }

    const { data: files } = await admin
      .from("course_material_files")
      .select("file_name, folder_type")
      .eq("course_id", courseId)
      .limit(40);

    const fileList = (files || [])
      .map((f) => `- ${f.file_name} (${f.folder_type})`)
      .join("\n");

    const existingList = (existingConcepts as string[])
      .map((c) => `- ${c}`)
      .join("\n");

    const systemPrompt =
      "You are an expert curriculum designer. Identify concepts that appear MISSING or UNDER-REPRESENTED for a technical university course given the existing confirmed concept list and uploaded material context. Suggest 5–10 concise, distinct concepts the professor may have overlooked. Do NOT repeat any existing concept.";

    const userPrompt = `Course: ${course?.name || "Untitled"} (${course?.course_code || "n/a"})
Objectives: ${(course?.objectives || []).join("; ") || "n/a"}

Confirmed concepts already in the course:
${existingList || "(none yet)"}

Uploaded materials:
${fileList || "(none)"}

Excerpt from approved syllabus (may be truncated):
"""
${materialContext || "(no syllabus available)"}
"""

Return suggestions as concise concept names (2–6 words each), with a one-sentence rationale.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_concepts",
              description: "Return missing/underrepresented concepts.",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        rationale: { type: "string" },
                      },
                      required: ["name", "rationale"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_concepts" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Lovable AI credits required." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    let suggestions: { name: string; rationale: string }[] = [];
    try {
      const args = toolCall?.function?.arguments
        ? JSON.parse(toolCall.function.arguments)
        : {};
      if (Array.isArray(args.suggestions)) suggestions = args.suggestions;
    } catch (e) {
      console.error("Failed to parse tool call:", e);
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-concepts error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
