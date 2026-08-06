/**
 * suggest-lesson
 *
 * Purpose:
 *   Suggests a single lesson (topics, activities, resources) for a chosen week
 *   or concept, used by the teacher's course-assistant chat.
 *
 * Auth / Access:
 *   Bearer token of the course teacher.
 *
 * Inputs:
 *   - courseId: uuid
 *   - week? or conceptCodes?
 *   - hint?: string
 *
 * Steps:
 *   1. Authenticate and load syllabus + existing plan context.
 *   2. Prompt the AI to author a single lesson block.
 *   3. Return the suggestion (not persisted).
 *
 * External calls:
 *   Lovable AI Gateway.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";
const FUNCTION_NAME = "suggest-lesson";

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
    const { dayNumber, dayTopic, existingDescription, courseObjectives, totalDays, existingResources, sessionsPerWeek, sessionLengthMinutes } =
      await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert curriculum designer and pedagogy specialist. You will generate TWO things for a single week of a university-level course:

1. A structured lesson description with these clearly labeled sections (use exactly these headings):
   **Overview:** A 2-3 sentence overview of the week's focus and goals.
   **Learning Outcomes:** 3-5 specific, measurable learning outcomes as bullet points.
   **Concepts & Topics:** List each concept/topic covered this week in sequential order. For EACH concept, include:
   - A one-sentence description explaining what the concept is and why it matters (so the professor immediately understands the scope)
   - Specific activities/resources embedded under it
   
   Format like:
   
   Concept: [Concept Name]
   [One-sentence description of what this concept covers and its real-world relevance]
   - [type] [Resource/Activity Title]: [Brief description of what students do]
   - [type] [Resource/Activity Title]: [Brief description]
   
   Concept: [Next Concept Name]
   [One-sentence description]
   - [type] [Resource/Activity Title]: [Brief description]
   
   Valid types in brackets: [Reading], [Lecture], [Exercise], [Lab], [Case Study], [Article], [Video], [Tool], [Discussion], [Coding]
   
   **Additional Tips:** 2-4 practical, specific tips for teaching, assessing, or engaging students during this week.

2. A JSON array of the resources/activities you embedded in the Concepts & Topics section, plus any additional suggestions. Each resource should include a "concept" field indicating which concept it belongs to, and a "conceptDescription" field with the one-sentence description.

CRITICAL DESIGN PRINCIPLES:
- Every concept MUST include at least one real-world, industry-aligned example, case study, or exercise. Think: how is this concept used in actual software development jobs, data science, automation, startups, etc.?
- When suggesting NEW concepts not in the original plan, always include a clear one-sentence description so the professor understands what it is and why it belongs in the curriculum.
- Be intentional and focused: suggest only concepts/topics that genuinely add value. Quality over quantity — do NOT overwhelm with dozens of additions. 2-4 new concept suggestions per week is the sweet spot.
- Reorganize concepts in a logical, sequential teaching order (prerequisites first, building complexity).
- Make exercises concrete and actionable (e.g., "Build a tip calculator using variables and input()" not "Practice using variables").

Format your response EXACTLY like this (the JSON block must be valid):

**Overview:**
[overview text]

**Learning Outcomes:**
- [outcome 1]
- [outcome 2]
...

**Concepts & Topics:**

Concept: [First Concept]
[One-sentence description of this concept's scope and real-world relevance]
- [Reading] Intro to Python Slides: Cover variables, data types, operators
- [Exercise] Build a Unit Converter: Students create a program that converts temperatures using variables and arithmetic
...

Concept: [Second Concept]
[One-sentence description]
- [Lecture] Control Flow Overview: If/else with real debugging scenarios from Stack Overflow
- [Coding] Sales Data Analyzer: Write a program that processes a list of transactions using loops
...

**Additional Tips:**
- [tip 1]
- [tip 2]
...

---RESOURCES_JSON---
[{"title":"Resource Title","action":"Description","type":"exercise","provenance":"instructor","concept":"Concept Name","conceptDescription":"One-sentence description of the concept"},...]

Valid types: textbook, lab, case-study, exercise, article, video, tool, news
Valid provenance values: instructor, web`;

    const existingResourcesSummary = existingResources?.length > 0
      ? `\nExisting resources (incorporate these into the appropriate concepts, and suggest NEW additional ones):\n${existingResources.map((r: any) => `- ${r.title}: ${r.action}`).join("\n")}`
      : "";

    const scheduleContext = sessionsPerWeek && sessionLengthMinutes
      ? `\n- Sessions per week: ${sessionsPerWeek}\n- Session length: ${sessionLengthMinutes} minutes\n- Total contact time this week: ${sessionsPerWeek * sessionLengthMinutes} minutes`
      : "";

    const userPrompt = `Course context:
- Total weeks in the course: ${totalDays}${scheduleContext}
- Course objectives: ${courseObjectives?.join(", ") || "Not specified"}

Generate a detailed lesson description AND resource suggestions for:
- Week ${dayNumber} of ${totalDays}
- Topic: ${dayTopic}
${existingDescription ? `\nExisting description (improve and SIGNIFICANTLY EXPAND upon this — don't just rephrase the same content, add genuinely new pedagogical insights, activities, and depth):\n${existingDescription}` : ""}
${existingResourcesSummary}

CRITICAL INSTRUCTIONS:
1. Do NOT simply rephrase or reword existing content. Add SUBSTANTIALLY NEW concepts, activities, and resources that are missing but important for this topic.
2. If there are concepts or sub-topics NOT currently mentioned but critical for teaching "${dayTopic}" effectively, ADD them as new concepts with a brief description explaining what they are and why they matter for real-world applications. Reorganize the chronological order accordingly.
3. For EVERY concept (existing and new), include at least one real-world, industry-aligned exercise or example. Think practical: what would a junior developer, data analyst, or automation engineer actually do with this concept? Reference real tools (GitHub, VS Code, Jupyter, pandas, etc.) and real scenarios (parsing log files, building a web scraper, automating reports).
4. List concepts in chronological teaching order and embed all activities/resources directly under their relevant concept. Focus on making the lesson flow intuitive and sequential.
5. The Additional Tips section should include practical, specific teaching strategies — not generic advice.
6. Be intentional: suggest 2-4 genuinely valuable new concepts/topics per week maximum. Do not overwhelm with too many additions — focus on what will meaningfully improve the curriculum.`;

    const response = await loggedGatewayFetch(
      FUNCTION_NAME,
      { model: "google/gemini-3-flash-preview", purpose: "suggest-lesson" },
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        signal: AbortSignal.timeout(300_000),
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
