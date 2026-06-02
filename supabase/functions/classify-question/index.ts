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
    const { message, courseName, objectives, concepts } = await req.json();

    if (!message || !courseName) {
      return new Response(
        JSON.stringify({ error: "message and courseName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

Use the classify_relevance function to respond.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: await resolveModel("classify-question", null, "google/gemini-2.5-flash-lite"),
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
                      description: "true if the question is related to the course content, false otherwise",
                    },
                  },
                  required: ["relevant"],
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
        JSON.stringify({ relevant: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    
    // Extract from tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        return new Response(
          JSON.stringify({ relevant: args.relevant ?? true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        // fall through
      }
    }

    // Default to relevant if parsing fails
    return new Response(
      JSON.stringify({ relevant: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Classify function error:", e);
    // Default to relevant on error
    return new Response(
      JSON.stringify({ relevant: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
