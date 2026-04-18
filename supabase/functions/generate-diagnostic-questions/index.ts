import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GeneratedQuestion {
  content_text: string;
  format: "mcq" | "true_false" | "short_answer";
  options: string[] | null;
  answer: string;
  difficulty_estimate: number;
  bloom_level: number;
  explanation: string;
  topic: string;
}

const TIER_SPEC = [
  { tier: "standard", count: 5, difficulty: 0.5, label: "Standard (medium difficulty, common to all students)" },
  { tier: "easy", count: 5, difficulty: 0.2, label: "Easy adaptive tier (for struggling students)" },
  { tier: "medium", count: 5, difficulty: 0.5, label: "Medium adaptive tier (for average students)" },
  { tier: "hard", count: 5, difficulty: 0.85, label: "Hard adaptive tier (for advanced students)" },
];

Deno.serve(async (req) => {
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch course + concepts
    const [{ data: course, error: cErr }, { data: concepts }] = await Promise.all([
      admin.from("courses").select("id, name, teacher_id, course_code").eq("id", courseId).maybeSingle(),
      admin.from("concepts").select("id, concept_code, weight").eq("course_id", courseId),
    ]);

    if (cErr || !course) {
      return new Response(JSON.stringify({ error: "Course not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!concepts || concepts.length === 0) {
      return new Response(
        JSON.stringify({ error: "No concepts found for this course. Generate the lesson plan first to extract concepts." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const conceptList = concepts.map((c) => c.concept_code).join(", ");
    const conceptByCode: Record<string, string> = {};
    for (const c of concepts) conceptByCode[c.concept_code] = c.id;

    // One AI call per tier in parallel
    const tierPromises = TIER_SPEC.map(async (spec) => {
      const systemPrompt = `You are an expert assessment designer creating diagnostic quiz questions for a course titled "${course.name}". Generate exactly ${spec.count} ${spec.tier} tier diagnostic questions.

Tier: ${spec.label}
Target difficulty (0=easy, 1=hard): ${spec.difficulty}

Available concepts (use concept_code values from this list as the topic field): ${conceptList}

Rules:
- Mix question formats: ~60% mcq, ~20% true_false, ~20% short_answer
- For mcq: provide exactly 4 options labeled internally as A/B/C/D — return them in the options array (no letter prefix), and put the correct option's full text in answer
- For true_false: options must be ["True", "False"], answer is "True" or "False"
- For short_answer: options=null, answer is the expected concise response
- Each question must clearly map to one concept_code from the list above (return as topic)
- bloom_level: 1=Remember, 2=Understand, 3=Apply, 4=Analyze, 5=Evaluate, 6=Create
- difficulty_estimate near ${spec.difficulty} (±0.15)
- Provide a 1-2 sentence explanation for the correct answer`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Generate ${spec.count} ${spec.tier} tier diagnostic questions now.` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "submit_questions",
                description: "Submit the generated diagnostic questions",
                parameters: {
                  type: "object",
                  properties: {
                    questions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          content_text: { type: "string" },
                          format: { type: "string", enum: ["mcq", "true_false", "short_answer"] },
                          options: { type: ["array", "null"], items: { type: "string" } },
                          answer: { type: "string" },
                          difficulty_estimate: { type: "number" },
                          bloom_level: { type: "integer", minimum: 1, maximum: 6 },
                          explanation: { type: "string" },
                          topic: { type: "string" },
                        },
                        required: [
                          "content_text",
                          "format",
                          "options",
                          "answer",
                          "difficulty_estimate",
                          "bloom_level",
                          "explanation",
                          "topic",
                        ],
                      },
                    },
                  },
                  required: ["questions"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "submit_questions" } },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI gateway ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error(`No tool call returned for ${spec.tier}`);

      const args = JSON.parse(toolCall.function.arguments);
      return { tier: spec.tier, questions: args.questions as GeneratedQuestion[] };
    });

    const tierResults = await Promise.all(tierPromises);

    // Build rows
    const rows: any[] = [];
    let counter = 1;
    for (const { tier, questions } of tierResults) {
      for (const q of questions) {
        rows.push({
          item_code: `${course.course_code || "Q"}-${tier.toUpperCase()}-${String(counter).padStart(3, "0")}`,
          content_text: q.content_text,
          format: q.format,
          options: q.options,
          answer: q.answer,
          difficulty_estimate: Math.max(0, Math.min(1, q.difficulty_estimate)),
          bloom_level: Math.max(1, Math.min(6, q.bloom_level)),
          explanation: q.explanation,
          topic: q.topic,
          concept_id: conceptByCode[q.topic] || null,
          course_id: course.id,
          teacher_id: course.teacher_id,
          in_test: true,
          is_distractor: false,
        });
        counter++;
      }
    }

    // Replace existing
    await admin.from("diagnostic_questions").delete().eq("course_id", course.id);
    const { error: insertErr } = await admin.from("diagnostic_questions").insert(rows);
    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({
        message: `Generated ${rows.length} diagnostic questions`,
        breakdown: tierResults.map((t) => ({ tier: t.tier, count: t.questions.length })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("generate-diagnostic-questions error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
