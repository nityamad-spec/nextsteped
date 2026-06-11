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

    const systemPrompt = `You are a document parser for academic syllabi. Call the extract_syllabus tool with structured data. Extract only what the document explicitly states. Do not invent or infer. Preserve the document's exact wording.

Every field must be present. If a section is absent, return an empty array.
Objectives (goals) and outcomes (measurable skills) are different. Never merge them.
If books are listed without distinguishing primary from supplementary, put them all in textbooks and leave referencebooks empty.

SEPARATING READINGS FROM COURSE CONTENT
Reading references must end up in textbooks or referencebooks, never inside a unit's topics. Recognize a reading by its FORM:
- Author surname + year (e.g. "Mishkin (2019)").
- Chapter/section/page pointer (e.g. "Chapter 12", "pp. 45-60").
- Book/article title presented as a source, often with edition or publisher.
- Full citation, URL, DOI, or journal reference.
A topic names an IDEA to be taught; a reading names a SOURCE. If unsure, only treat as a reading when at least one sign above is clearly present.

UNITS ARE THE COURSE BODY. ORDER MATTERS.
- unit_number: integer starting at 1, assigned strictly in document order. Do not reorder by label or alphabetically.
- title: the heading the document gives this segment, copied verbatim ("Unit 2", "Week 5", "Module III"). If absent, use a short descriptive title.
- topics: array of teachable topics/subtopics in this segment, verbatim, with reading references removed.

Capture the body however it is organized:
- Grouped by units/weeks/modules/chapters: one unit per group, in document order.
- Flat list: keep each topic or small cluster as its own unit, preserving order.
- Prose: split into distinct topics as separate units in the order presented.

Only return units as an empty array if the document contains no subject-matter content at all.`;

    // Build messages based on whether we have base64 (binary file) or text content
    const userMessages: any[] = [];
    const IMAGE_MIMES = new Set([
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/bmp",
      "image/webp",
    ]);

    if (fileBase64) {
      // Binary file — route by MIME type. The Lovable AI Gateway is a passthrough
      // to OpenAI-compatible providers: `image_url` is only valid for images,
      // PDFs must use the `file` content block, and other office formats
      // (DOCX/PPTX) are not accepted as binary on chat-completions.
      const mimeType = getMimeType(fileName);
      const userText = `Parse the following syllabus document (file: "${fileName}") into a structured format. Extract ONLY information that is explicitly present in the document. Do NOT invent any content.`;

      if (mimeType === "application/pdf") {
        userMessages.push({
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "file",
              file: {
                filename: fileName,
                file_data: `data:application/pdf;base64,${fileBase64}`,
              },
            },
          ],
        });
      } else if (IMAGE_MIMES.has(mimeType)) {
        userMessages.push({
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
          ],
        });
      } else {
        // DOCX, PPTX, TXT, CSV, etc. The model cannot read these as binary —
        // the caller must extract text first and resend as `fileContent`.
        return new Response(
          JSON.stringify({
            error:
              "Unsupported file type for direct AI parsing. Please upload a PDF, or convert this file to PDF and re-upload.",
            mimeType,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
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
      signal: AbortSignal.timeout(300_000),
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
                        unit_number: { type: "number", description: "Unit/module number, starting at 1 in document order" },
                        title: { type: "string", description: "Unit title/heading copied verbatim from the document" },
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
                      "Syllabus body organized by unit/module/week, in document order.",
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
      return new Response(
        JSON.stringify({
          error: `AI gateway error ${response.status}. ${errorText.slice(0, 300)}`,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
