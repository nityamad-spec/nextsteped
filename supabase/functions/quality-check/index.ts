import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { syllabusJson } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a meticulous academic quality reviewer specializing in course syllabi.
You will receive a structured syllabus JSON. Review it ONLY for issues that are actually present in the data provided.

CRITICAL RULES:
- NEVER invent, assume, or hallucinate content that is not explicitly present in the JSON.
- If a field is empty, null, or missing, do NOT fabricate what it "should" contain.
- Only flag issues where you can quote the EXACT text from the JSON that is problematic.
- Do NOT suggest adding readings, textbooks, or resources that are not already referenced somewhere in the syllabus.
- Do NOT flag missing due dates, reading assignments, or calendar details unless the syllabus itself contradicts or promises them elsewhere.
- Do NOT flag optional omissions or stylistic preferences.
- Do NOT suggest adding extra sections just because they are common in some syllabi.
- Prefer returning FEWER issues. Only flag concrete, high-signal problems.

What to look for:
1. **Factual errors** — incorrect dates, wrong terminology, contradictory information WITHIN the provided data
2. **Internal inconsistencies** — grading weights that don't sum to 100%, schedule gaps, mismatched objectives
3. **Ambiguities** — vague grading criteria, unclear policies, undefined terms that appear elsewhere
4. **Pedagogical issues** — unrealistic schedules, misaligned objectives and assessments

For each issue, specify:
- The exact JSON path (e.g. "schedule[2].description" or "gradingPolicy.components[0].weight")
- The EXACT original text at that location (copy it verbatim from the JSON — do not paraphrase)
- Your suggested correction
- A clear reason why this is an issue
- Severity: "error" (factually wrong/contradictory), "warning" (potentially misleading/incomplete), "suggestion" (could be improved)

If the syllabus is well-constructed, return an empty array. When in doubt, do NOT flag it.`;

    const userPrompt = `Review this syllabus JSON for quality issues:

${JSON.stringify(syllabusJson, null, 2)}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
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
                name: "report_issues",
                description: "Report quality issues found in the syllabus",
                parameters: {
                  type: "object",
                  properties: {
                    issues: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          jsonPath: { type: "string", description: "Dot/bracket path in the JSON (e.g. schedule[2].description)" },
                          original: { type: "string", description: "The original text or value at this path" },
                          correction: { type: "string", description: "Suggested corrected text or value" },
                          reason: { type: "string", description: "Why this is flagged" },
                          severity: { type: "string", enum: ["error", "warning", "suggestion"], description: "Issue severity" },
                        },
                        required: ["jsonPath", "original", "correction", "reason", "severity"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["issues"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "report_issues" } },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service unavailable. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ issues: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ issues: result.issues || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("quality-check error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
