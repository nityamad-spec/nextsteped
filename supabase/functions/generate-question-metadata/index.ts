import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BLOOM_NAMES: Record<number, string> = {
  1: "Remember",
  2: "Understand",
  3: "Apply",
  4: "Analyze",
  5: "Evaluate",
  6: "Create",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const question: string = (body?.question ?? "").toString().trim();
    const questionType: string = (body?.questionType ?? "MCQ").toString();
    const options: string[] = Array.isArray(body?.options)
      ? body.options.filter((o: unknown) => typeof o === "string" && o.trim())
      : [];
    const correctAnswer: string = (body?.correctAnswer ?? "").toString().trim();

    if (!question || !correctAnswer) {
      return new Response(
        JSON.stringify({ error: "question and correctAnswer are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (questionType === "MCQ" && options.length < 2) {
      return new Response(
        JSON.stringify({ error: "MCQ requires at least 2 options" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const optionsBlock =
      questionType === "MCQ"
        ? options.map((o, i) => `  ${String.fromCharCode(65 + i)}) ${o}`).join("\n")
        : questionType === "True/False"
        ? "  A) True\n  B) False"
        : "  (open-ended)";

    const userPrompt = `Analyze the following assessment question and return metadata as JSON.

Question Type: ${questionType}
Question: ${question}
Options:
${optionsBlock}
Correct Answer: ${correctAnswer}

Return a JSON object with EXACTLY these keys and value constraints:
{
  "difficulty": "Easy" | "Medium" | "Hard",
  "bloomsLevel": integer 1-6 (1=Remember, 2=Understand, 3=Apply, 4=Analyze, 5=Evaluate, 6=Create),
  "difficultyEstimate": number between 0.00 and 1.00 (expected probability a typical student answers CORRECTLY; lower = harder),
  "bloomJustification": string (1-2 sentences explaining why this Bloom's level fits),
  "difficultyJustification": string (1-2 sentences explaining why this difficulty was assigned),
  "explanation": string (2-4 sentence student-facing explanation of why the correct answer is correct)
}

Rules:
- "difficulty" must match cognitive load: Easy = recall/recognition, Medium = comprehension/application, Hard = analysis/evaluation/synthesis.
- "bloomsLevel" and "difficulty" should be broadly consistent (Bloom 1-2 ~ Easy, 3-4 ~ Medium, 5-6 ~ Hard) but use judgment.
- Return ONLY the JSON object. No prose, no markdown fences.`;

    const systemPrompt =
      "You are an assessment design expert. You classify questions on Bloom's taxonomy, estimate item difficulty, and write clear, concise student-facing explanations. Always respond with a single valid JSON object matching the requested schema exactly.";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(120_000),
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
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "Failed to generate metadata" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? "{}";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed: any = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse LLM JSON:", content);
      return new Response(
        JSON.stringify({ error: "LLM returned invalid JSON" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize & validate
    const diffRaw = String(parsed.difficulty ?? "").toLowerCase();
    const difficulty =
      diffRaw.startsWith("e") ? "Easy" : diffRaw.startsWith("h") ? "Hard" : "Medium";

    let bloomsLevel = Number(parsed.bloomsLevel);
    if (!Number.isFinite(bloomsLevel)) bloomsLevel = 2;
    bloomsLevel = Math.min(6, Math.max(1, Math.round(bloomsLevel)));

    let difficultyEstimate = Number(parsed.difficultyEstimate);
    if (!Number.isFinite(difficultyEstimate)) difficultyEstimate = 0.5;
    difficultyEstimate = Math.min(1, Math.max(0, difficultyEstimate));
    difficultyEstimate = Math.round(difficultyEstimate * 100) / 100;

    const result = {
      difficulty,
      bloomsLevel,
      bloomsLevelName: BLOOM_NAMES[bloomsLevel],
      difficultyEstimate,
      bloomJustification: String(parsed.bloomJustification ?? "").trim(),
      difficultyJustification: String(parsed.difficultyJustification ?? "").trim(),
      explanation: String(parsed.explanation ?? "").trim(),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-question-metadata error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
