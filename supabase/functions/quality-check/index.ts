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
You will receive a structured syllabus JSON. Your job is twofold:
1. Review what IS present for errors, inconsistencies, and ambiguities.
2. Identify important academic sections that are MISSING ENTIRELY from the syllabus.

CRITICAL RULES:
- NEVER invent or hallucinate specific content (e.g. specific readings, textbook titles, specific dates) that is not in the JSON.
- For corrections: only flag issues where you can quote the EXACT text from the JSON that is problematic.
- For missing sections: you MAY suggest that the syllabus should include a section on a topic IF that topic is a standard, important part of a course syllabus (e.g. grading policy, assessment/exam details, final project, attendance policy, academic integrity policy, office hours, prerequisites). Use severity "suggestion" for these.
- Do NOT suggest adding trivial or stylistic things (e.g. a specific reading list, calendar details, or formatting preferences).
- Prefer returning FEWER issues. Only flag concrete, high-signal problems and genuinely missing important sections.

What to look for:
1. **Factual errors** — incorrect dates, wrong terminology, contradictory information WITHIN the provided data
2. **Internal inconsistencies** — grading weights that don't sum to 100%, schedule gaps, mismatched objectives
3. **Ambiguities** — vague grading criteria, unclear policies, undefined terms that appear elsewhere
4. **Pedagogical issues** — unrealistic schedules, misaligned objectives and assessments
5. **Missing important sections** — if the syllabus lacks grading/assessment details, exam information, final project description, attendance policy, or other standard academic sections, suggest the professor consider adding them

For each issue, specify:
- The exact JSON path (e.g. "schedule[2].description") — for missing sections, use "syllabus" as the path
- The EXACT original text at that location (copy verbatim) — for missing sections, use "N/A - section not found"
- Your suggested correction or addition
- A clear reason why this is an issue or why this section matters
- Severity: "correction" (something existing that needs fixing — errors, inconsistencies, ambiguities) or "suggestion" (something missing that should be added)

If the syllabus is comprehensive and well-constructed, return an empty array.`;

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
                          severity: { type: "string", enum: ["correction", "suggestion"], description: "correction = fix existing content, suggestion = add missing content" },
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
