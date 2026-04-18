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
  return /\.(txt|md|csv|json|html?|xml|rtf)$/i.test(name);
}

async function downloadFileAsText(
  supabaseAdmin: ReturnType<typeof createClient>,
  storagePath: string,
  fileName: string,
): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from("course-materials")
      .download(storagePath);
    if (error || !data) return "";
    const buffer = await data.arrayBuffer();
    if (isProbablyTextual(fileName)) {
      return decodeText(buffer).slice(0, MAX_DOC_CHARS_PER_FILE);
    }
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
    const { courseId, mode: requestedMode } = await req.json();
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

    // 1. Fetch course metadata (incl exam weeks)
    const { data: course, error: courseError } = await supabaseAdmin
      .from("courses")
      .select("name, course_code, term, total_weeks, sessions_per_week, session_length_minutes, objectives, teacher_id, syllabus_json_path, midterm_week, final_week")
      .eq("id", courseId)
      .single();

    if (courseError || !course) {
      return new Response(JSON.stringify({ error: "Course not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalWeeks = course.total_weeks || 16;
    const midtermWeek = course.midterm_week || null;
    const finalWeek = course.final_week || null;

    // 2. Fetch all uploaded files; classify by folder type
    const { data: files } = await supabaseAdmin
      .from("course_material_files")
      .select("file_name, storage_path, folder_type")
      .eq("teacher_id", course.teacher_id)
      .or(`course_id.eq.${courseId},course_id.is.null`)
      .order("created_at", { ascending: false });

    const syllabusFiles = (files || []).filter((f) => f.folder_type === "syllabus");
    const lessonPlanFiles = (files || []).filter((f) => f.folder_type === "lesson-plans");
    const materialFiles = (files || []).filter((f) => f.folder_type === "materials");

    // 2a. Syllabus context — prefer uploaded syllabus files, fall back to legacy syllabus_json_path
    let syllabusContext = "";
    let syllabusChars = 0;
    for (const f of syllabusFiles) {
      if (syllabusChars >= 12000) break;
      const text = await downloadFileAsText(supabaseAdmin, f.storage_path, f.file_name);
      if (text) {
        const slice = text.slice(0, 12000 - syllabusChars);
        syllabusContext += `--- ${f.file_name} ---\n${slice}\n\n`;
        syllabusChars += slice.length;
      }
    }
    if (!syllabusContext && course.syllabus_json_path) {
      try {
        const { data: syllabusData } = await supabaseAdmin.storage
          .from("course-materials")
          .download(course.syllabus_json_path);
        if (syllabusData) {
          const text = await syllabusData.text();
          syllabusContext = text.slice(0, 12000);
        }
      } catch (e) {
        console.error("legacy syllabus fetch failed:", e);
      }
    }

    // 2b. Lesson plan docs (PRIMARY)
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

    // 3. Build prompts
    const examWeeksDescription = [
      midtermWeek ? `- Week ${midtermWeek}: MIDTERM EXAM` : null,
      finalWeek ? `- Week ${finalWeek}: FINAL EXAM` : null,
    ].filter(Boolean).join("\n");

    // Gap mode = teacher uploaded existing lesson plan docs; surface only NEW additions/insights
    const gapMode = requestedMode === "gap" || lessonPlanFiles.length > 0;

    const gapModeInstruction = gapMode
      ? `
GAP MODE (CRITICAL): The professor has uploaded existing lesson plan/teaching materials. Your job is NOT to repeat or paraphrase what is already in those documents. Instead, for each week, the overview, concepts, exercise, articles, and key concepts you emit should ONLY be net-new additions, gaps, or current-industry insights NOT already present in the uploaded materials. If a week is fully covered by uploaded content, emit a short overview that says "Existing materials cover this week well — see additions below." and provide only true additions in concepts/resources. Mark every concept and resource you emit as ai_suggested=true in this mode.`
      : "";

    const systemPrompt = `You are an expert curriculum designer building a complete week-by-week lesson plan for a university course.

OUTPUT RULES:
1. Produce EXACTLY ${totalWeeks} weeks, numbered 1..${totalWeeks}, in chronological teaching order. Prerequisites first; complexity grows.
2. Ground EVERY week in the actual uploaded materials. Lesson plan documents are the PRIMARY source. The syllabus is the structural skeleton. Other materials are context.
3. Topics MUST be specific to THIS course — never default to a generic Python/intro template.
4. Mark exam weeks with is_exam_week=true (we will pass which weeks are exam weeks). Exam weeks still get normal content; the badge is just a flag.
${gapModeInstruction}

PER-WEEK CONTENT (STRICT FORMAT):
- "week_name": A short, specific title for the week's theme (e.g., "Functions & Scope", "Intro to Pandas DataFrames"). 3-6 words. Required.
- "overview": 1 to 2 sentences summarizing what students learn this week.
- "concepts" (Topics Covered): 2-5 items. Each = a topic name + one short sentence describing it. Set ai_suggested=true ONLY when the concept is genuinely missing from the uploaded docs but is a necessary prerequisite or a current/timely real-world topic that strengthens the course. Otherwise ai_suggested=false.
- "resources": EXACTLY 1 coding-exercise + 1 to 2 articles. NO other types are allowed.
   * coding-exercise (exactly 1 per week): an industry-relevant coding task. Title + a concrete prompt-style description that ties to a real-world application.
   * article (1 to 2 per week): a recent (last ~3 years), real, high-quality article tying the week's concepts to current industry/real-world examples. Provide a working URL (https://...).
  Set ai_suggested=true if YOU generated it (vs. extracted from uploads). All articles you generate are ai_suggested=true.
- The LAST 1 to 2 concepts in the concepts array (with ai_suggested=true preferred) will be surfaced as "Key Concepts to Include" — make sure at least the final concept is something the professor must ensure students understand by the end of the week.

TOP-LEVEL OUTPUT:
- "overall_course_learning_outcomes": ONE short paragraph (3-5 sentences) summarizing what students should be able to do by the end of the entire course. Returned ONCE, not per week.

FORBIDDEN:
- Do NOT include any "Learning Outcomes by Week" section.
- Do NOT include any "Additional Tips", "Teaching Strategies", or freeform sections.
- Do NOT emit more than 1 coding-exercise per week. Do NOT emit more than 2 articles per week.

Return ONLY via the provided tool — no prose.`;

    const userPrompt = `COURSE METADATA:
- Name: ${course.name}
- Code: ${course.course_code || "N/A"}
- Term: ${course.term}
- Total weeks: ${totalWeeks}
- Sessions/week: ${course.sessions_per_week || 2}
- Session length: ${course.session_length_minutes || 60} min
- Objectives: ${(course.objectives || []).join("; ") || "Not specified"}

EXAM WEEKS (mark is_exam_week=true on these):
${examWeeksDescription || "(no exam weeks specified)"}

SYLLABUS (uploaded by professor):
${syllabusContext || "(none uploaded)"}

UPLOADED LESSON PLAN DOCUMENTS (PRIMARY SOURCE):
${lessonPlanExcerpts.length > 0 ? lessonPlanExcerpts.join("\n\n") : "(none uploaded — derive plan from syllabus + objectives)"}

OTHER COURSE MATERIALS AVAILABLE (filenames only, for context):
${materialFileNames.length > 0 ? materialFileNames.join(", ") : "(none)"}

Generate exactly ${totalWeeks} weeks following all rules. Mode: ${gapMode ? "GAP (additions only)" : "FULL"}.`;

    // 4. Call Lovable AI gateway with tool calling
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
                        week_name: { type: "string", description: "Short specific title for the week's theme, 3-6 words" },
                        overview: { type: "string", description: "1-2 sentence overview of what's taught this week" },
                        is_exam_week: { type: "boolean" },
                        concepts: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string" },
                              brief_description: { type: "string", description: "One short sentence" },
                              ai_suggested: { type: "boolean", description: "True only when this concept is genuinely missing from uploads but additive" },
                            },
                            required: ["name", "brief_description", "ai_suggested"],
                            additionalProperties: false,
                          },
                        },
                        resources: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              type: { type: "string", enum: ["coding-exercise", "article"] },
                              title: { type: "string" },
                              description: { type: "string", description: "For coding-exercise: a prompt-style task. For article: 1-2 sentence summary." },
                              url: { type: "string", description: "Required for article (https://...). Optional for coding-exercise." },
                              ai_suggested: { type: "boolean" },
                            },
                            required: ["type", "title", "description", "ai_suggested"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["week", "week_name", "overview", "is_exam_week", "concepts", "resources"],
                      additionalProperties: false,
                    },
                  },
                  overall_course_learning_outcomes: {
                    type: "string",
                    description: "ONE short paragraph (3-5 sentences) summarizing what students should be able to do by the end of the entire course. Returned ONCE.",
                  },
                },
                required: ["weeks", "overall_course_learning_outcomes"],
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
    const rawWeeks: any[] = parsed.weeks || [];
    const overallOutcomes: string = typeof parsed.overall_course_learning_outcomes === "string"
      ? parsed.overall_course_learning_outcomes.trim()
      : "";

    // Cap resources to enforce: max 1 coding-exercise + max 2 articles per week
    const capResources = (resources: any[]) => {
      if (!Array.isArray(resources)) return [];
      const exercises = resources.filter((r) => r?.type === "coding-exercise").slice(0, 1);
      const articles = resources.filter((r) => r?.type === "article").slice(0, 2);
      return [...exercises, ...articles];
    };

    // Normalize: sort, slice to totalWeeks, force is_exam_week based on midterm/final
    const normalized = rawWeeks
      .slice()
      .sort((a, b) => (a.week || 0) - (b.week || 0))
      .slice(0, totalWeeks)
      .map((w, i) => {
        const weekNum = i + 1;
        const isExam = weekNum === midtermWeek || weekNum === finalWeek || !!w.is_exam_week;
        return {
          week: weekNum,
          week_name: typeof w.week_name === "string" ? w.week_name.trim() : "",
          overview: w.overview || "",
          is_exam_week: isExam,
          exam_type: weekNum === midtermWeek ? "midterm" : weekNum === finalWeek ? "final" : null,
          concepts: Array.isArray(w.concepts) ? w.concepts : [],
          resources: capResources(w.resources),
        };
      });

    // Pad if AI returned fewer weeks
    while (normalized.length < totalWeeks) {
      const i = normalized.length;
      const weekNum = i + 1;
      const isExam = weekNum === midtermWeek || weekNum === finalWeek;
      normalized.push({
        week: weekNum,
        week_name: "",
        overview: "",
        is_exam_week: isExam,
        exam_type: weekNum === midtermWeek ? "midterm" : weekNum === finalWeek ? "final" : null,
        concepts: [],
        resources: [],
      });
    }

    // 5. Store derived concepts in the concepts table (backend mapping for diagnostic/exam targeting)
    try {
      const allConceptNames = new Set<string>();
      for (const w of normalized) {
        for (const c of w.concepts || []) {
          if (c?.name) allConceptNames.add(String(c.name).trim());
        }
      }

      // Wipe existing concepts for this course and reseed
      await supabaseAdmin.from("concepts").delete().eq("course_id", courseId);

      if (allConceptNames.size > 0) {
        const weight = Math.round((100 / allConceptNames.size) * 100) / 100;
        const rows = Array.from(allConceptNames).map((name) => ({
          course_id: courseId,
          concept_code: name,
          weight,
        }));
        await supabaseAdmin.from("concepts").insert(rows);
      }
    } catch (conceptErr) {
      console.error("concept persistence failed (non-fatal):", conceptErr);
    }

    return new Response(
      JSON.stringify({
        weeks: normalized,
        overall_course_learning_outcomes: overallOutcomes,
        meta: {
          totalWeeks,
          midtermWeek,
          finalWeek,
          syllabusFilesUsed: syllabusFiles.length,
          lessonPlanFilesUsed: lessonPlanFiles.length,
          materialFilesAvailable: materialFiles.length,
          syllabusContextLoaded: !!syllabusContext,
          gapMode,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("generate-lesson-plan error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
