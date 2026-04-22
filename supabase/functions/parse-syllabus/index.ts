import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    webp: "image/webp",
  };
  return map[ext] || "application/octet-stream";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName, fileBase64 } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a document parser specializing in academic syllabi.
Given the content of a syllabus document, extract the information into a STRICT JSON structure with EXACTLY these top-level sections:
  - objectives        (array of strings: course/learning OBJECTIVES — goals)
  - units             (array of unit objects: the syllabus body, organized by unit/module)
  - outcomes          (array of strings: course OUTCOMES — measurable competencies)
  - textbooks         (array of strings: required/primary textbooks)
  - referencebooks    (array of strings: reference books and supplementary reading)

CRITICAL RULES:
- Output ONLY the five sections above. No other top-level keys.
- Do NOT invent or fabricate information. Only extract what is EXPLICITLY stated in the document.
- CAREFULLY distinguish "objectives" (goals) from "outcomes" (measurable skills). They are DIFFERENT sections — never merge them.
- If the document only has one of objectives/outcomes, populate that array and leave the other empty ([]).
- Distinguish "textbooks" (primary/required) from "referencebooks" (supplementary). If the document does not distinguish them, treat all listed books as textbooks and leave referencebooks empty.
- For "units": each unit must have a unit_number (integer, starting at 1), a title (string), and topics (array of strings — the topics/subtopics covered in that unit). If the syllabus is organized by week instead of unit, map each week to a unit. If no structure is given, leave units as [].
- Preserve the EXACT wording from the document. Do not paraphrase or rewrite.
- If a section is not present in the document, return an empty array [].`;

    // Build messages based on whether we have base64 (binary file) or text content
    const userMessages: any[] = [];
    
    if (fileBase64) {
      // Binary file (PDF, DOCX, images) — send as inline_data for Gemini multimodal
      const mimeType = getMimeType(fileName);
      userMessages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Parse the following syllabus document (file: "${fileName}") into a structured format. Extract ONLY information that is explicitly present in the document. Do NOT invent any content.`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${fileBase64}`,
            },
          },
        ],
      });
    } else {
      // Plain text content
      userMessages.push({
        role: "user",
        content: `Parse the following syllabus document (file: "${fileName}") into a structured format. Extract ONLY information that is explicitly present in the document. Do NOT invent any content.

Document content:
---
${fileContent}
---`,
      });
    }

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
            ...userMessages,
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_syllabus",
                description: "Extract structured syllabus data from a document. Only include information explicitly present in the document.",
                parameters: {
                  type: "object",
                  properties: {
                    courseTitle: { type: "string", description: "Full course title" },
                    courseCode: { type: "string", description: "Course code (e.g. CS101)" },
                    instructor: { type: "string", description: "Instructor name(s)" },
                    term: { type: "string", description: "Academic term (e.g. Fall 2025)" },
                    description: { type: "string", description: "Course description paragraph" },
                    learningObjectives: {
                      type: "array",
                      items: { type: "string" },
                      description: "List of learning OBJECTIVES only (goals students should achieve). Do NOT mix with outcomes.",
                    },
                    learningOutcomes: {
                      type: "array",
                      items: { type: "string" },
                      description: "List of learning OUTCOMES only (measurable skills/competencies). Do NOT mix with objectives. Leave empty if document does not distinguish outcomes from objectives.",
                    },
                    schedule: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          week: { type: "number", description: "Week number" },
                          topic: { type: "string", description: "Topic or module title" },
                          description: { type: "string", description: "Description of what is covered" },
                          readings: { type: "string", description: "Required readings or materials" },
                        },
                        required: ["week", "topic", "description", "readings"],
                        additionalProperties: false,
                      },
                      description: "Weekly or session-by-session schedule",
                    },
                    gradingPolicy: {
                      type: "object",
                      properties: {
                        components: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string", description: "Component name (e.g. Midterm, Homework)" },
                              weight: { type: "string", description: "Weight or percentage (e.g. 30%)" },
                              description: { type: "string", description: "Additional details" },
                            },
                            required: ["name", "weight", "description"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["components"],
                      additionalProperties: false,
                      description: "Grading breakdown. Leave components empty if not mentioned in the document.",
                    },
                    policies: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string", description: "Policy title (e.g. Attendance, Academic Integrity)" },
                          content: { type: "string", description: "Full policy text" },
                        },
                        required: ["title", "content"],
                        additionalProperties: false,
                      },
                      description: "Course policies and rules",
                    },
                    resources: {
                      type: "array",
                      items: { type: "string" },
                      description: "Textbooks, websites, and other resources",
                    },
                  },
                  required: [
                    "courseTitle", "courseCode", "instructor", "term", "description",
                    "learningObjectives", "learningOutcomes", "schedule", "gradingPolicy", "policies", "resources",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "extract_syllabus" } },
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
        JSON.stringify({ error: "Failed to parse syllabus. The AI did not return structured data." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const syllabusJson = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ syllabus: syllabusJson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-syllabus error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
