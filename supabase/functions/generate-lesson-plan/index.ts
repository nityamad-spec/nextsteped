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
  supabaseAdmin: any,
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

    // 2. Load CONFIRMED concepts from Concept Review (source of truth)
    const { data: conceptRows, error: conceptError } = await supabaseAdmin
      .from("concepts")
      .select("id, concept_code, weight, created_at")
      .eq("course_id", courseId)
      .order("created_at", { ascending: true });

    if (conceptError) {
      throw new Error(`Failed to load concepts: ${conceptError.message}`);
    }

    if (!conceptRows || conceptRows.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No confirmed concepts. Complete Concept Review first.",
          code: "NO_CONCEPTS",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const orderedConceptNames: string[] = conceptRows.map((c: any) => String(c.concept_code).trim());
    // Lookup map for case-insensitive name resolution
    const conceptNameLookup = new Map<string, string>();
    for (const name of orderedConceptNames) {
      conceptNameLookup.set(name.toLowerCase(), name);
    }

    // 3. Fetch uploaded files (for context only)
    const { data: files } = await supabaseAdmin
      .from("course_material_files")
      .select("file_name, storage_path, folder_type")
      .eq("teacher_id", course.teacher_id)
      .or(`course_id.eq.${courseId},course_id.is.null`)
      .order("created_at", { ascending: false });

    const syllabusFiles = (files || []).filter((f) => f.folder_type === "syllabus");
    const lessonPlanFiles = (files || []).filter((f) => f.folder_type === "lesson-plans");
    const materialFiles = (files || []).filter((f) => f.folder_type === "materials");

    // 3a. Syllabus context
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

    // 3b. Lesson plan docs (context for pacing)
    let totalChars = 0;
    const lessonPlanExcerpts: string[] = [];
    for (const f of lessonPlanFiles) {
      if (totalChars >= MAX_TOTAL_DOC_CHARS) break;
      const text = await downloadFileAsText(supabaseAdmin, f.storage_path, f.file_name);
      if (text) {
        const slice = text.slice(0, MAX_TOTAL_DOC_CHARS - totalChars);
        lessonPlanExcerpts.push(`--- ${f.file_name} ---\n${slice}`);
        totalChars += slice.length;
      }
    }

    const materialFileNames = materialFiles.map((f) => f.file_name);

    // 4. Build prompts
    const examWeeks = new Set<number>();
    if (midtermWeek) examWeeks.add(midtermWeek);
    if (finalWeek) examWeeks.add(finalWeek);
    const teachingWeeksCount = totalWeeks - examWeeks.size;

    const examWeeksDescription = [
      midtermWeek ? `- Week ${midtermWeek}: MIDTERM EXAM (no new concepts)` : null,
      finalWeek ? `- Week ${finalWeek}: FINAL EXAM (no new concepts)` : null,
    ].filter(Boolean).join("\n");

    const systemPrompt = `You are an expert curriculum designer distributing a finalized list of approved course concepts across teaching weeks for a university course.

CRITICAL RULES:
1. You will be given a finalized ORDERED list of concepts. You MUST distribute ALL of them across the ${teachingWeeksCount} teaching weeks (excluding exam weeks).
2. Maintain the SAME LEARNING ORDER as the input list — concepts in earlier list positions go in earlier weeks. Never reorder them.
3. Estimate how many weeks each concept needs based on depth/complexity:
   - A simple concept may share a week with 1-2 other concepts.
   - A complex concept may span 2 consecutive weeks (repeat the SAME concept name in both weeks).
   - Aim for roughly balanced cognitive load per week.
4. Exam weeks (midterm/final) get NO new concepts — set is_exam_week=true, concept_names=[], no resources, and overview="Exam week — review prior content."
5. Every concept from the input list MUST appear in at least one week. DO NOT invent new concepts. DO NOT drop any concepts. Use concept names EXACTLY as given.
6. Produce EXACTLY ${totalWeeks} weeks numbered 1..${totalWeeks} in order.

PER-WEEK CONTENT (for non-exam weeks):
- "week_name": short specific title for the theme (3-6 words), e.g. "Functions & Scope", "Intro to Pandas".
- "overview": 1-2 sentences summarizing what students learn this week, grounded in the assigned concepts.
- "concept_names": array of concept names assigned to this week, drawn EXACTLY from the input list.
- "resources": EXACTLY 1 coding-exercise + 1 to 2 articles tied to the week's concepts.
   * coding-exercise (exactly 1): industry-relevant task. Title + concrete prompt-style description.
   * article (1-2): real, recent (~3 yrs), high-quality article with working https URL.

TOP-LEVEL OUTPUT:
- "overall_course_learning_outcomes": ONE short paragraph (3-5 sentences) on what students will be able to do by course end.

Return ONLY via the provided tool — no prose.`;

    const conceptListBlock = orderedConceptNames
      .map((n, i) => `${i + 1}. ${n}`)
      .join("\n");

    const userPrompt = `COURSE METADATA:
- Name: ${course.name}
- Code: ${course.course_code || "N/A"}
- Term: ${course.term}
- Total weeks: ${totalWeeks}
- Teaching weeks (non-exam): ${teachingWeeksCount}
- Sessions/week: ${course.sessions_per_week || 2}
- Session length: ${course.session_length_minutes || 60} min
- Objectives: ${(course.objectives || []).join("; ") || "Not specified"}

EXAM WEEKS (must be marked is_exam_week=true with no concepts):
${examWeeksDescription || "(no exam weeks specified)"}

APPROVED CONCEPTS — DISTRIBUTE THESE EXACTLY, IN THIS ORDER:
${conceptListBlock}

SYLLABUS CONTEXT (for pacing/depth signals only — DO NOT add new concepts from here):
${syllabusContext || "(none uploaded)"}

LESSON PLAN DOCUMENTS (for pacing signals only):
${lessonPlanExcerpts.length > 0 ? lessonPlanExcerpts.join("\n\n") : "(none uploaded)"}

OTHER COURSE MATERIALS AVAILABLE (filenames only, for context):
${materialFileNames.length > 0 ? materialFileNames.join(", ") : "(none)"}

Distribute the ${orderedConceptNames.length} approved concepts above across ${totalWeeks} weeks (${teachingWeeksCount} teaching + ${examWeeks.size} exam). Maintain order. Every concept must appear at least once.`;

    // 5. Call Lovable AI gateway with tool calling
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
              name: "distribute_concepts_into_weeks",
              description: "Distribute the approved concepts across the course weeks in learning order.",
              parameters: {
                type: "object",
                properties: {
                  weeks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        week: { type: "integer", description: "Week number, 1-indexed" },
                        week_name: { type: "string", description: "Short specific title (3-6 words). Empty for exam weeks." },
                        overview: { type: "string", description: "1-2 sentence overview. For exam weeks: 'Exam week — review prior content.'" },
                        is_exam_week: { type: "boolean" },
                        concept_names: {
                          type: "array",
                          items: { type: "string" },
                          description: "Concept names drawn EXACTLY from the approved list. Empty array for exam weeks.",
                        },
                        resources: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              type: { type: "string", enum: ["coding-exercise", "article"] },
                              title: { type: "string" },
                              description: { type: "string" },
                              url: { type: "string", description: "Required for article (https://...)." },
                              ai_suggested: { type: "boolean" },
                            },
                            required: ["type", "title", "description", "ai_suggested"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["week", "week_name", "overview", "is_exam_week", "concept_names", "resources"],
                      additionalProperties: false,
                    },
                  },
                  overall_course_learning_outcomes: {
                    type: "string",
                    description: "ONE short paragraph (3-5 sentences) on what students will be able to do by course end.",
                  },
                },
                required: ["weeks", "overall_course_learning_outcomes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "distribute_concepts_into_weeks" } },
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
      throw new Error("AI did not return a structured distribution");
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

    // Resolve a concept name (case-insensitive) back to its canonical form. Returns null if unknown.
    const resolveConceptName = (raw: string): string | null => {
      if (!raw || typeof raw !== "string") return null;
      const key = raw.trim().toLowerCase();
      return conceptNameLookup.get(key) || null;
    };

    // Track which approved concepts have been assigned at least once
    const assignedConcepts = new Set<string>();

    // Normalize: index by week number, slice/pad to totalWeeks, force exam-week behavior
    const byWeek = new Map<number, any>();
    for (const w of rawWeeks) {
      const num = Number(w?.week);
      if (Number.isFinite(num) && num >= 1 && num <= totalWeeks && !byWeek.has(num)) {
        byWeek.set(num, w);
      }
    }

    const normalized: any[] = [];
    for (let weekNum = 1; weekNum <= totalWeeks; weekNum++) {
      const w = byWeek.get(weekNum) || {};
      const isExam = examWeeks.has(weekNum);
      const examType = weekNum === midtermWeek ? "midterm" : weekNum === finalWeek ? "final" : null;

      if (isExam) {
        normalized.push({
          week: weekNum,
          week_name: examType === "midterm" ? "Midterm Exam" : examType === "final" ? "Final Exam" : "Exam Week",
          overview: "Exam week — review prior content.",
          is_exam_week: true,
          exam_type: examType,
          concepts: [],
          resources: [],
        });
        continue;
      }

      // Resolve concept names against the approved list
      const rawNames: string[] = Array.isArray(w.concept_names) ? w.concept_names : [];
      const resolvedNames: string[] = [];
      const seenInWeek = new Set<string>();
      for (const rn of rawNames) {
        const canonical = resolveConceptName(rn);
        if (canonical && !seenInWeek.has(canonical)) {
          resolvedNames.push(canonical);
          seenInWeek.add(canonical);
          assignedConcepts.add(canonical);
        }
      }

      const concepts = resolvedNames.map((name) => ({
        name,
        brief_description: "",
        ai_suggested: false,
      }));

      normalized.push({
        week: weekNum,
        week_name: typeof w.week_name === "string" ? w.week_name.trim() : "",
        overview: typeof w.overview === "string" ? w.overview : "",
        is_exam_week: false,
        exam_type: null,
        concepts,
        resources: capResources(w.resources),
      });
    }

    // Defensive fallback: any approved concept the AI failed to assign goes to the last non-exam week
    const unassigned = orderedConceptNames.filter((n) => !assignedConcepts.has(n));
    if (unassigned.length > 0) {
      console.warn("Unassigned concepts appended to last teaching week:", unassigned);
      // Find last non-exam week
      for (let i = normalized.length - 1; i >= 0; i--) {
        if (!normalized[i].is_exam_week) {
          for (const name of unassigned) {
            normalized[i].concepts.push({
              name,
              brief_description: "",
              ai_suggested: false,
            });
          }
          break;
        }
      }
    }

    // NOTE: We intentionally do NOT modify the concepts table here.
    // The Concept Review step is the sole source of truth for concepts.

    return new Response(
      JSON.stringify({
        weeks: normalized,
        overall_course_learning_outcomes: overallOutcomes,
        meta: {
          totalWeeks,
          midtermWeek,
          finalWeek,
          teachingWeeksCount,
          approvedConceptsCount: orderedConceptNames.length,
          unassignedConcepts: unassigned,
          syllabusFilesUsed: syllabusFiles.length,
          lessonPlanFilesUsed: lessonPlanFiles.length,
          materialFilesAvailable: materialFiles.length,
          syllabusContextLoaded: !!syllabusContext,
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
