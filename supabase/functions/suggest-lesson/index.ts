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
    const { dayNumber, dayTopic, existingDescription, courseObjectives, totalDays, existingResources } =
      await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert curriculum designer and pedagogy specialist. You will generate TWO things for a single week of a university-level course:

1. A structured lesson description with these clearly labeled sections (use exactly these headings):
   **Overview:** A 2-3 sentence overview of the week's focus and goals.
   **Learning Outcomes:** 3-5 specific, measurable learning outcomes as bullet points.
   **Concepts & Topics:** List each concept/topic covered this week in sequential order. Under each concept, embed the specific lectures, exercises, activities, readings, case studies, coding time, etc. that relate to that concept. Format like:
   
   Concept: [Concept Name]
   - [type] [Resource/Activity Title]: [Brief description of what students do]
   - [type] [Resource/Activity Title]: [Brief description]
   
   Concept: [Next Concept Name]
   - [type] [Resource/Activity Title]: [Brief description]
   
   Valid types in brackets: [Reading], [Lecture], [Exercise], [Lab], [Case Study], [Article], [Video], [Tool], [Discussion], [Coding]
   
   **Additional Tips:** 2-4 practical tips for teaching, assessing, or engaging students during this week.

2. A JSON array of the resources/activities you embedded in the Concepts & Topics section, plus any additional suggestions. Each resource should include a "concept" field indicating which concept it belongs to.

Format your response EXACTLY like this (the JSON block must be valid):

**Overview:**
[overview text]

**Learning Outcomes:**
- [outcome 1]
- [outcome 2]
...

**Concepts & Topics:**

Concept: [First Concept]
- [Reading] Intro to Python Slides: Cover variables, data types, operators
- [Exercise] Variables Practice: Students practice declaring and using variables
...

Concept: [Second Concept]
- [Lecture] Control Flow Overview: If/else statements and loops
- [Coding] Loop Challenge: Write programs using for and while loops
...

**Additional Tips:**
- [tip 1]
- [tip 2]
...

---RESOURCES_JSON---
[{"title":"Resource Title","action":"Description","type":"exercise","provenance":"instructor","concept":"Concept Name"},...]

Valid types: textbook, lab, case-study, exercise, article, video, tool, news
Valid provenance values: instructor, web`;

    const existingResourcesSummary = existingResources?.length > 0
      ? `\nExisting resources (incorporate these into the appropriate concepts, and suggest NEW additional ones):\n${existingResources.map((r: any) => `- ${r.title}: ${r.action}`).join("\n")}`
      : "";

    const userPrompt = `Course context:
- Total weeks in the course: ${totalDays}
- Course objectives: ${courseObjectives?.join(", ") || "Not specified"}

Generate a detailed lesson description AND resource suggestions for:
- Week ${dayNumber} of ${totalDays}
- Topic: ${dayTopic}
${existingDescription ? `\nExisting description (improve upon this):\n${existingDescription}` : ""}
${existingResourcesSummary}

Important: In the Concepts & Topics section, list concepts in chronological teaching order and embed all activities/resources directly under their relevant concept. Focus on making the lesson flow intuitive and sequential.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
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
          JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const fullContent = data.choices?.[0]?.message?.content || "";

    let suggestion = fullContent;
    let suggestedResources: any[] = [];

    const jsonSplitter = "---RESOURCES_JSON---";
    const splitIndex = fullContent.indexOf(jsonSplitter);
    if (splitIndex !== -1) {
      suggestion = fullContent.substring(0, splitIndex).trim();
      const jsonPart = fullContent.substring(splitIndex + jsonSplitter.length).trim();
      try {
        const jsonMatch = jsonPart.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          suggestedResources = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error("Failed to parse resources JSON:", e);
      }
    }

    return new Response(JSON.stringify({ suggestion, suggestedResources }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("suggest-lesson error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
