import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EXTRACT_LESSON_PLAN_SYSTEM } from "../_shared/prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
    md: "text/plain",
  };
  return map[ext] || "application/octet-stream";
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(buf.subarray(i, i + chunk)) as unknown as number[],
    );
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { courseId } = await req.json();
    if (!courseId || typeof courseId !== "string") {
      return new Response(JSON.stringify({ error: "courseId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify caller is a member of the course.
    const { data: isMember, error: memberErr } = await admin.rpc("is_course_member", {
      _course_id: courseId,
      _user_id: userId,
    });
    if (memberErr || !isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load all lesson-plan-docs files for the course.
    const { data: rows, error: rowsErr } = await admin
      .from("course_material_files")
      .select("file_name, storage_path")
      .eq("course_id", courseId)
      .eq("folder_type", "lesson-plan-docs");
    if (rowsErr) throw new Error(rowsErr.message);
    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "No lesson plan documents found for this course" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build multimodal user content from all uploaded docs.
    const parts: any[] = [
      {
        type: "text",
        text:
          "Extract a structured weekly lesson plan from the attached document(s). " +
          "Merge content across files where they overlap on the same week. " +
          "Only include information explicitly present — do NOT invent weeks, concepts, or resources.",
      },
    ];
    for (const r of rows) {
      const { data: blob, error: dlErr } = await admin.storage
        .from("course-materials")
        .download(r.storage_path);
      if (dlErr || !blob) continue;
      const b64 = await blobToBase64(blob);
      const mime = getMimeType(r.file_name);
      parts.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${b64}` },
      });
    }

    const systemPrompt = EXTRACT_LESSON_PLAN_SYSTEM;

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: await resolveModel("extract-lesson-plan", null, "google/gemini-2.5-pro"),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: parts },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_lesson_plan",
                description: "Extract weekly lesson plan structure from documents.",
                parameters: {
                  type: "object",
                  properties: {
                    weeks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          week: { type: "number" },
                          week_name: { type: "string" },
                          overview: { type: "string" },
                          concepts: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                name: { type: "string" },
                                brief_description: { type: "string" },
                              },
                              required: ["name"],
                              additionalProperties: false,
                            },
                          },
                          resources: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                type: { type: "string" },
                                title: { type: "string" },
                                description: { type: "string" },
                                url: { type: "string" },
                              },
                              required: ["type", "title"],
                              additionalProperties: false,
                            },
                          },
                        },
                        required: ["week", "week_name", "overview", "concepts", "resources"],
                        additionalProperties: false,
                      },
                    },
                    overall_course_learning_outcomes: { type: "string" },
                  },
                  required: ["weeks", "overall_course_learning_outcomes"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_lesson_plan" },
          },
        }),
      },
    );

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(
        JSON.stringify({ error: "AI service unavailable. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiResp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "AI did not return structured data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const parsed = JSON.parse(args);

    const jsonPath = `${courseId}/lesson-plan/uploaded-lesson-plan.json`;
    const out = new Blob([JSON.stringify(parsed, null, 2)], {
      type: "application/json",
    });
    const { error: upErr } = await admin.storage
      .from("course-materials")
      .upload(jsonPath, out, { upsert: true, contentType: "application/json" });
    if (upErr) throw new Error(upErr.message);

    return new Response(
      JSON.stringify({
        path: jsonPath,
        weekCount: Array.isArray(parsed.weeks) ? parsed.weeks.length : 0,
        sourceFileCount: rows.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("extract-lesson-plan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
