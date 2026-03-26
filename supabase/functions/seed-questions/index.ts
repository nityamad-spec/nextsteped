import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractMcqOptions(contentText: string): { stem: string; options: string[] } {
  const lines = contentText.split("\n");
  const optionLines: string[] = [];
  const stemLines: string[] = [];
  const optionRegex = /^[A-Z]\)\s+/;

  for (const line of lines) {
    if (optionRegex.test(line.trim())) {
      optionLines.push(line.trim().replace(optionRegex, "").trim());
    } else {
      stemLines.push(line);
    }
  }

  return {
    stem: stemLines.join("\n").trim(),
    options: optionLines.length > 0 ? optionLines : [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent } = await req.json();
    if (!fileContent) {
      return new Response(JSON.stringify({ error: "fileContent is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = typeof fileContent === "string" ? JSON.parse(fileContent) : fileContent;
    const concepts = parsed.concepts;
    if (!Array.isArray(concepts) || concepts.length === 0) {
      return new Response(JSON.stringify({ error: "No concepts array found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Look up PWIM course
    const { data: course, error: courseErr } = await adminClient
      .from("courses")
      .select("id, teacher_id")
      .eq("course_code", "PWIM")
      .single();

    if (courseErr || !course) {
      return new Response(JSON.stringify({ error: "Course 'PWIM' not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build concept_code → UUID map
    const { data: dbConcepts } = await adminClient
      .from("concepts")
      .select("id, concept_code")
      .eq("course_id", course.id);

    const conceptMap: Record<string, string> = {};
    for (const c of dbConcepts || []) {
      conceptMap[c.concept_code] = c.id;
    }

    const formatMap: Record<string, string> = {
      mcq: "mcq",
      true_false: "true_false",
      single_token_fill: "short_answer",
      code_output: "short_answer",
      code_completion: "short_answer",
    };

    const rows: any[] = [];

    for (const concept of concepts) {
      const conceptCode = concept.concept_id;
      const conceptUuid = conceptMap[conceptCode] || null;
      const questions = concept.questions || [];

      for (const q of questions) {
        if (q.format === "match_following") continue;

        const mappedFormat = formatMap[q.format] || "short_answer";
        let contentText = q.content_text || "";
        let options: string[] | null = null;
        let answer = q.answer || "";

        if (mappedFormat === "mcq") {
          const extracted = extractMcqOptions(contentText);
          contentText = extracted.stem;
          options = extracted.options.length > 0 ? extracted.options : null;
        } else if (mappedFormat === "true_false") {
          options = ["True", "False"];
          if (answer === "True" || answer === "true") answer = "A";
          else if (answer === "False" || answer === "false") answer = "B";
        } else {
          // short_answer — strip any option lines from content
          const lines = contentText.split("\n");
          const optionRegex = /^[A-Z]\)\s+/;
          contentText = lines.filter(l => !optionRegex.test(l.trim())).join("\n").trim();
          options = null;
        }

        rows.push({
          item_code: q.item_id,
          content_text: contentText,
          format: mappedFormat,
          options: options,
          answer: answer,
          difficulty_estimate: q.difficulty_estimate ?? 0.5,
          bloom_level: q.bloom_level ?? 1,
          bloom_justification: q.bloom_justification ?? null,
          difficulty_justification: q.difficulty_justification ?? null,
          explanation: q.explanation ?? null,
          is_distractor: q.is_distractor ?? false,
          topic: q.topic ?? null,
          concept_id: conceptUuid,
          course_id: course.id,
          teacher_id: course.teacher_id,
        });
      }
    }

    // Delete existing questions for this course
    await adminClient.from("diagnostic_questions").delete().eq("course_id", course.id);

    // Bulk insert
    const { error: insertErr } = await adminClient
      .from("diagnostic_questions")
      .insert(rows);

    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({ message: `Inserted ${rows.length} diagnostic questions for PWIM` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
