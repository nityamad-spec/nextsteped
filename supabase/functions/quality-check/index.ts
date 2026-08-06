/**
 * quality-check
 *
 * Purpose:
 *   Runs an AI quality review over a parsed syllabus, flagging missing
 *   sections, ambiguities, and consistency issues before the teacher approves it.
 *
 * Auth / Access:
 *   Bearer token of the course teacher.
 *
 * Inputs:
 *   - syllabus: parsed syllabus JSON
 *
 * Steps:
 *   1. Validate the payload.
 *   2. Prompt the AI with the syllabus and a rubric.
 *   3. Parse a JSON verdict listing per-section findings + severity.
 *   4. Return the verdict for teacher review UI.
 *
 * External calls:
 *   Lovable AI Gateway.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";
const FUNCTION_NAME = "quality-check";

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
    const { syllabusJson, sourceText } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a meticulous academic quality reviewer specializing in course syllabi.
You will receive:
1. A structured JSON extraction of a syllabus.
2. The original source text of the syllabus (if available).

Your job is to review the JSON for issues AND suggest important missing sections.

CRITICAL RULES — READ CAREFULLY:
- You MUST cross-reference every finding against the original source text (if provided) to verify accuracy.
- NEVER confuse different sections of the syllabus. "Learning Objectives" and "Learning Outcomes" (or "Course Outcomes") are DIFFERENT sections. Do not conflate them.
- Before citing any item (e.g. "objective 3"), COUNT the actual items in the JSON array to verify that index exists.
- NEVER reference items that do not exist. If learningObjectives has 5 items, do not reference "objective 6" or higher.
- NEVER invent or hallucinate specific content (e.g. specific readings, textbook titles, dates) not in the data.
- For corrections: only flag issues where you can point to SPECIFIC text in the JSON that is wrong or inconsistent.
- For suggestions (missing sections): you may suggest the syllabus include important standard sections (grading policy, assessment details, attendance policy, academic integrity, office hours, prerequisites) IF they are truly absent.
- Do NOT suggest adding trivial or stylistic things.
- Prefer FEWER, high-confidence issues over many speculative ones. When in doubt, do NOT flag it.

What to look for:
1. **Factual errors** — incorrect dates, wrong terminology, contradictory information
2. **Internal inconsistencies** — grading weights not summing to 100%, schedule gaps, mismatched objectives
3. **Ambiguities** — vague grading criteria, unclear policies
4. **Missing important sections** — no grading policy, no exam details, no attendance policy, etc.

For each issue, provide:
- A short human-readable title that describes the SPECIFIC topic of the issue (e.g. "Attendance Policy", "Academic Integrity", "Grading Weights", "Week 3 Schedule", "Learning Objectives"). For missing sections, use the name of the missing section (e.g. "Attendance Policy", "Office Hours") — NOT generic words like "Syllabus".
- The exact original text that is problematic (copy verbatim). For missing sections, use "N/A - section not found"
- Your suggested correction or addition
- A clear, accurate reason. VERIFY all claims against the source data before writing.
- Category: "correction" (fix existing content) or "suggestion" (add missing content)`;

    let userPrompt = `Review this syllabus JSON for quality issues:\n\n${JSON.stringify(syllabusJson, null, 2)}`;
    
    if (sourceText) {
      userPrompt += `\n\n--- ORIGINAL SOURCE TEXT (for cross-reference) ---\n${sourceText}`;
    }

    const response = await loggedGatewayFetch(
      FUNCTION_NAME,
      { model: "google/gemini-2.5-pro", purpose: "quality-check" },
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        signal: AbortSignal.timeout(300_000),
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
                          title: { type: "string", description: "Short human-readable title for this issue (e.g. 'Grading Policy', 'Week 5 Topic')" },
                          original: { type: "string", description: "The original text or value that is problematic, copied verbatim. Use 'N/A - section not found' for missing sections." },
                          correction: { type: "string", description: "Suggested corrected text, value, or addition" },
                          reason: { type: "string", description: "Why this is flagged — must be accurate and verifiable against the source" },
                          severity: { type: "string", enum: ["correction", "suggestion"], description: "correction = fix existing content, suggestion = add missing content" },
                        },
                        required: ["title", "original", "correction", "reason", "severity"],
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
