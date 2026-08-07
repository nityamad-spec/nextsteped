/**
 * classify-question
 *
 * Purpose:
 *   Lightweight relevance gate that decides whether a user chat message is
 *   on-topic for the current course before the main chat function answers.
 *
 * Auth / Access:
 *   Bearer token required.
 *
 * Inputs:
 *   - message: string — user's question
 *   - courseContext: string — brief course/topic summary
 *
 * Steps:
 *   1. Parse and validate the request body.
 *   2. Build a compact system prompt asking the model to classify relevance.
 *   3. Call the Lovable AI Gateway with a fast/cheap model.
 *   4. Parse the model's yes/no + reason into a JSON verdict.
 *   5. Return { relevant, reason } for the client to enforce.
 *
 * External calls:
 *   Lovable AI Gateway (Gemini flash-lite).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isConversationalFiller } from "../_shared/conversational-intent.ts";

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
    const { message, courseName, objectives, concepts } = await req.json();

    if (!message || !courseName) {
      return new Response(
        JSON.stringify({ error: "message and courseName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fast path: conversational filler ("ok", "sounds good", "what's next")
    // never needs a model call, and must never be treated as off-topic.
    if (isConversationalFiller(message)) {
      return new Response(
        JSON.stringify({ relevant: true, intent: "conversational" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const objectivesText = objectives?.length
      ? `Course objectives: ${objectives.join("; ")}`
      : "";
    const conceptsText = concepts?.length
      ? `Key concepts: ${concepts.join(", ")}`
      : "";

    const classificationPrompt = `You are a course relevance classifier. Given the following course context, determine if the student's question is relevant to the course.

Course: ${courseName}
${objectivesText}
${conceptsText}

Student's question: "${message}"

Classify the intent:
- "conversational" — small talk, acknowledgements, or filler that continues the conversation ("ok", "thanks", "sounds good", "what's next", "go on", greetings). These are always relevant.
- "question" — a genuine question or request about the course, its prerequisites, or directly supporting concepts. This ALSO includes course-administration questions answered by the syllabus or lesson plan: grading and marks breakdown, assessment scheme, attendance, late-submission and academic-integrity policies, prerequisites, textbooks and reading lists, office hours, credit hours, learning outcomes, the course outline/schedule, and "what is covered in week/unit N".
- "off_topic" — a genuine request that is unrelated to the course.

When in doubt between "question" and "off_topic", choose "question".

Use the classify_relevance function to respond.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        signal: AbortSignal.timeout(300_000),
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "user", content: classificationPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "classify_relevance",
                description: "Classify whether the student's question is relevant to the course content, syllabus, objectives, or concepts.",
                parameters: {
                  type: "object",
                  properties: {
                    relevant: {
                      type: "boolean",
                      description: "true if the message is related to the course content or is conversational filler, false otherwise",
                    },
                    intent: {
                      type: "string",
                      enum: ["question", "conversational", "off_topic"],
                      description: "conversational for small talk/filler, question for a real course question, off_topic otherwise",
                    },
                  },
                  required: ["relevant", "intent"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "classify_relevance" } },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("Classification error:", response.status, await response.text());
      // Default to relevant on error so chat still works
      return new Response(
        JSON.stringify({ relevant: true, intent: "question" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    
    // Extract from tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        const intent = args.intent === "conversational" || args.intent === "off_topic"
          ? args.intent
          : "question";
        return new Response(
          JSON.stringify({
            relevant: intent === "conversational" ? true : (args.relevant ?? true),
            intent,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        // fall through
      }
    }

    // Default to relevant if parsing fails
    return new Response(
      JSON.stringify({ relevant: true, intent: "question" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Classify function error:", e);
    // Default to relevant on error
    return new Response(
      JSON.stringify({ relevant: true, intent: "question" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
