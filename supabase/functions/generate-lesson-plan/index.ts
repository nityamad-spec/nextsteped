import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_DOC_CHARS_PER_FILE = 8000;
const MAX_TOTAL_DOC_CHARS = 30000;

function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  } catch {
    return "";
  }
}

function isProbablyTextual(name: string): boolean {
  const lower = name.toLowerCase();
  return /\.(txt|md|csv|json|html?|xml|rtf)$/i.test(lower);
}

async function downloadFileAsText(
  supabaseAdmin: ReturnType<typeof createClient>,
  storagePath: string,
  fileName: string
): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from("course-materials")
      .download(storagePath);
    if (error || !data) return "";
    const buffer = await data.arrayBuffer();
    if (isProbablyTextual(fileName)) {
      const text = decodeText(buffer);
      return text.slice(0, MAX_DOC_CHARS_PER_FILE);
    }
    // Best-effort: try decoding binary as utf-8; for PDFs/DOCX this yields garbage,
    // so we fall back to file-name-only context for non-text uploads.
    const text = decodeText(buffer);
    const printable = text.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
    if (printable.length < 200) return "";
    return printable.slice(0, MAX_DOC_CHARS_PER_FILE);
  } catch {
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { courseId } = await req.json();
    if (!courseId) {
      return new Response(JSON.stringify({ error: "courseId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase env not configured");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch course metadata
    const { data: course, error: courseError } = await supabaseAdmin
      .from("courses")
      .select("name, course_code, term, total_weeks, sessions_per_week, session_length_minutes, objectives, teacher_id, syllabus_json_path, start_date, end_date")
      .eq("id", courseId)
      .single();

    if (courseError || !course) {
      return new Response(JSON.stringify({ error: "Course not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalWeeks = course.total_weeks || 16;

    // 2. Fetch syllabus JSON
    let syllabusContext = "";
    if (course.syllabus_json_path) {
      try {
        const { data: syllabusData } = await supabaseAdmin.storage
          .from("course-materials")
          .download(course.syllabus_json_path);
        if (syllabusData) {
          const text = await syllabusData.text();
          // Compact: strip whitespace from JSON
          try {
            const parsed = JSON.parse(text);
            syllabusContext = JSON.stringify(parsed).slice(0, 12000);
          } catch {
            syllabusContext = text.slice(0, 12000);
          }
        }
      } catch (e) {
        console.error("syllabus fetch failed:", e);
      }
    }

    // 3. Fetch uploaded files: prioritize lesson-plans folder, then materials
    const { data: files } = await supabaseAdmin
      .from("course_material_files")
      .select("file_name, storage_path, folder_type")
      .eq("teacher_id", course.teacher_id)
      .or(`course_id.eq.${courseId},course_id.is.null`)
      .order("created_at", { ascending: false });

    const lessonPlanFiles = (files || []).filter((f) => f.folder_type === "lesson-plans");
    const materialFiles = (files || []).filter((f) => f.folder_type === "materials");

    let totalChars = 0;
    const lessonPlanExcerpts: string[] = [];
    for (const f of lessonPlanFiles) {
      if (totalChars >= MAX_TOTAL_DOC_CHARS) break;
      const text = await downloadFileAsText(supabaseAdmin, f.storage_path, f.file_name);
      if (text) {
        const slice = text.slice(0, MAX_TOTAL_DOC_CHARS - totalChars);
        lessonPlanExcerpts.push(`--- ${f.file_name} ---\n${slice}`);
        totalChars += slice.length;
      } else {
        lessonPlanExcerpts.push(`--- ${f.file_name} (binary, name only) ---`);
      }
    }

    const materialFileNames = materialFiles.map((f) => f.file_name);

    // 4. Build the AI prompt
    const systemPrompt = `You are a curriculum designer. Generate a complete week-by-week lesson plan for a university course.

CRITICAL RULES:
1. Output EXACTLY ${totalWeeks} weeks, numbered 1 through ${totalWeeks}, in chronological teaching order.
2. Base content PRIMARILY on the uploaded lesson plan documents (if provided). Use the syllabus as a secondary structural guide. Use other materials only for context.
3. If lesson plan documents are sparse or missing, derive the plan from the syllabus schedule.
4. Each week should build logically on prior weeks (prerequisites first, complexity grows).
5. Topics must be specific to THIS course — do NOT default to a generic Python intro.
6. Each week needs a clear topic title, a 2-3 sentence description, and 2-4 concrete resources/activities.

Return ONLY a JSON object via the provided tool — no prose.`;

    const userPrompt = `COURSE METADATA:
- Name: ${course.name}
- Code: ${course.course_code || "N/A"}
- Term: ${course.term}
- Total weeks: ${totalWeeks}
- Sessions/week: ${course.sessions_per_week || 2}
- Session length: ${course.session_length_minutes || 60} min
- Objectives: ${(course.objectives || []).join("; ") || "Not specified"}

SYLLABUS (structured JSON):
${syllabusContext || "(none uploaded)"}

UPLOADED LESSON PLAN DOCUMENTS (PRIMARY SOURCE):
${lessonPlanExcerpts.length > 0 ? lessonPlanExcerpts.join("\n\n") : "(none uploaded — derive plan from syllabus schedule)"}

OTHER COURSE MATERIALS AVAILABLE (filenames only, for context):
${materialFileNames.length > 0 ? materialFileNames.join(", ") : "(none)"}

Generate exactly ${totalWeeks} weeks.`;

    // 5. Call Lovable AI gateway with tool calling for structured output
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "emit_lesson_plan",
              description: "Emit the complete week-by-week lesson plan",
              parameters: {
                type: "object",
                properties: {
                  weeks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        week: { type: "integer", description: "Week number, 1-indexed" },
                        topic: { type: "string", description: "Concise week topic title" },
                        description: { type: "string", description: "2-3 sentence overview of the week" },
                        resources: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              title: { type: "string" },
                              action: { type: "string", description: "What students do with this resource" },
                              type: {
                                type: "string",
                                enum: ["textbook", "exercise", "lab", "tool", "case-study", "article", "video"],
                              },
                              concept: { type: "string", description: "Concept this resource belongs to" },
                            },
                            required: ["title", "action", "type", "concept"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["week", "topic", "description", "resources"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["weeks"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_lesson_plan" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return a structured lesson plan");
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const weeks: Array<{ week: number; topic: string; description: string; resources: any[] }> = parsed.weeks || [];

    // Normalize: ensure exactly totalWeeks, sorted, sequential
    const normalized = weeks
      .slice()
      .sort((a, b) => (a.week || 0) - (b.week || 0))
      .slice(0, totalWeeks)
      .map((w, i) => ({
        week: i + 1,
        topic: w.topic || `Week ${i + 1}`,
        description: w.description || "",
        resources: Array.isArray(w.resources) ? w.resources : [],
      }));

    // Pad if AI returned fewer weeks
    while (normalized.length < totalWeeks) {
      const i = normalized.length;
      normalized.push({
        week: i + 1,
        topic: `Week ${i + 1} — TBD`,
        description: "",
        resources: [],
      });
    }

    return new Response(
      JSON.stringify({
        weeks: normalized,
        meta: {
          totalWeeks,
          lessonPlanFilesUsed: lessonPlanFiles.length,
          materialFilesAvailable: materialFiles.length,
          syllabusUsed: !!syllabusContext,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-lesson-plan error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
