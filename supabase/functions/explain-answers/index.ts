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
    const { answers } = await req.json();

    if (!Array.isArray(answers) || answers.length === 0) {
      return new Response(JSON.stringify({ error: "No answers provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build a prompt that asks for explanations for each question
    const questionsText = answers
      .map(
        (a: any, i: number) =>
          `Q${i + 1} [Topic: ${a.topic}]: ${a.question_text}\nStudent answered: "${a.selected || "No answer"}"\nCorrect answer: "${a.correct}"\nResult: ${a.is_correct ? "CORRECT" : "INCORRECT"}`
      )
      .join("\n\n");

    const systemPrompt = `You are an expert teaching assistant. For each question below, provide a clear, concise explanation (2-4 sentences) of:
1. WHY the correct answer is correct — explain the underlying concept
2. If the student got it wrong, explain WHY their answer was incorrect and the common misconception

Return a JSON array where each element has:
- "index": the question number (0-based)
- "explanation": the explanation text (use markdown for formatting)

Be educational and encouraging. Focus on building understanding, not just stating facts.
Return ONLY the JSON array, no other text.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: questionsText },
          ],
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate explanations" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // Parse the JSON from the response (handle markdown code blocks)
    let explanations: { index: number; explanation: string }[] = [];
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      explanations = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse explanations:", content);
      explanations = [];
    }

    return new Response(JSON.stringify({ explanations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("explain-answers error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
