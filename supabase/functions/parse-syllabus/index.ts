import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { resolveModel } from "../_shared/resolveModel.ts";

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

    const systemPrompt = `You are a document parser for academic syllabi. Extract the content into STRICT JSON with exactly these keys and no others. Output only raw JSON, no markdown fences, no commentary.

  - objectives     (array of strings: course goals and aims)
  - outcomes       (array of strings: measurable competencies students will gain)
  - units          (array of unit objects: the course body in order, defined below)
  - textbooks      (array of strings: required or primary reading)
  - referencebooks (array of strings: supplementary reading)

RULES
- Extract only what the document explicitly states. Do not invent or infer.
- Preserve the document's exact wording. Do not paraphrase.
- Every key must be present. If a section is absent, return an empty array.
- Objectives (goals) and outcomes (measurable skills) are different. Never merge them. If only one is present, populate it and leave the other empty.
- If books are listed without distinguishing primary from supplementary, put them all in textbooks and leave referencebooks empty.

SEPARATING READINGS FROM COURSE CONTENT
Reading references must end up in textbooks or referencebooks, never inside a unit's content, even when the document does not label them as readings and lists them inline among the topics. Recognize a reading by its FORM, not by any heading. Treat an entry as a reading if it shows any of these signs:
- An author surname paired with a year, e.g. "Mishkin (2019)", "Krugman & Obstfeld, 2018".
- A chapter, section, or page pointer, e.g. "Chapter 12", "Ch. 3-4", "pp. 45-60", "Reading 2".
- A book or article title presented as a source, often in title case or quotation marks, often with an edition or publisher, e.g. "International Economics, 11th ed.".
- An "Author, Title, Publisher, Year" citation in any order, or a URL, DOI, or journal reference.
The distinction: a topic names an IDEA to be taught ("Interest Rate Parity"); a reading names a SOURCE where it can be read ("Krugman ch.12"). When an entry inside a unit is a reading by these signs, remove it from that unit's content and place it in textbooks (or referencebooks if the document marks it as supplementary, further, or recommended). Do not leave it in the course body.
If you are unsure, only treat an entry as a reading when at least one sign above is clearly present; otherwise keep it as a topic. Do not discard a real topic merely because it shares a word with a book title.

THE "units" ARRAY IS THE COURSE BODY. IT MUST NEVER BE DROPPED, AND ITS ORDER MATTERS, because the sequence determines how lesson plan content is later sequenced.
Each unit object has three fields:
  - sequence (integer starting at 1, assigned strictly in the order the content appears in the document. This is the chronological position and must reflect the document's own ordering. Always present.)
  - label    (string: the heading the document gives this segment, copied verbatim, such as "Unit 2", "Week 5", "Module III", or "Chapter 1". Use null if the document gives no heading.)
  - content  (array of strings: the teachable topics and subtopics in this segment, in the document's exact wording, with reading references removed as described above.)

Build the units in the exact order they appear in the document, top to bottom, and number them with sequence accordingly. Do not reorder them by label number or alphabetically. The document's physical order is the source of truth, since that is the order the course is taught in.

Capture the body however it is organized:
- Grouped by units, weeks, modules, chapters, or sections: one unit object per group, in document order.
- A flat list with no grouping: keep each topic or small cluster as its own unit object in the order listed, so the progression is preserved rather than collapsed into a single block.
- Written as prose: split it into the distinct topics it covers, as separate unit objects, in the order they are presented.

Only return units as an empty array if the document contains no subject-matter content at all`;

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: await resolveModel("parse-syllabus", null, "google/gemini-2.5-pro"),
        messages: [{ role: "system", content: systemPrompt }, ...userMessages],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_syllabus",
              description:
                "Extract structured syllabus data from a document. Only include information explicitly present in the document.",
              parameters: {
                type: "object",
                properties: {
                  objectives: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "Course/learning OBJECTIVES — high-level goals the course aims to achieve. Do NOT include outcomes here.",
                  },
                  units: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        unit_number: { type: "number", description: "Unit/module number, starting at 1" },
                        title: { type: "string", description: "Unit title or heading" },
                        topics: {
                          type: "array",
                          items: { type: "string" },
                          description: "Topics/subtopics covered in this unit, preserved verbatim from the document.",
                        },
                      },
                      required: ["unit_number", "title", "topics"],
                      additionalProperties: false,
                    },
                    description:
                      "Syllabus body organized by unit/module. If the syllabus is week-based, map each week to a unit.",
                  },
                  outcomes: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "Course OUTCOMES — measurable skills/competencies students will demonstrate. Distinct from objectives.",
                  },
                  textbooks: {
                    type: "array",
                    items: { type: "string" },
                    description: "Required/primary textbooks (full citations as written in the document).",
                  },
                  referencebooks: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "Reference books and supplementary reading. Empty if document does not distinguish them from textbooks.",
                  },
                },
                required: ["objectives", "units", "outcomes", "textbooks", "referencebooks"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_syllabus" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI service unavailable. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Failed to parse syllabus. The AI did not return structured data." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const syllabusJson = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ syllabus: syllabusJson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-syllabus error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
