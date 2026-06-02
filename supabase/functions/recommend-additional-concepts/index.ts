// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveModel } from "../_shared/resolveModel.ts";
import { resolvePrompt } from "../_shared/resolvePrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type SyllabusUnit = {
  unit_number?: number | string;
  number?: number | string;
  title?: string;
  name?: string;
  topics?: (string | { name?: string; title?: string })[];
  subtopics?: (string | { name?: string; title?: string })[];
};

function summarizeSyllabus(syllabus: any): string {
  if (!syllabus) return "(no parsed syllabus available)";
  const raw: SyllabusUnit[] = Array.isArray(syllabus.units)
    ? syllabus.units
    : Array.isArray(syllabus.modules)
    ? syllabus.modules
    : [];
  if (raw.length === 0) return "(no structured units found)";
  return raw
    .map((u, idx) => {
      const num =
        typeof (u.unit_number ?? u.number) === "string"
          ? parseInt(String(u.unit_number ?? u.number), 10) || idx + 1
          : Number(u.unit_number ?? u.number) || idx + 1;
      const title = (u.title || u.name || `Unit ${num}`).toString().trim();
      const topicSrc = (u.topics || u.subtopics || []) as any[];
      const topics = topicSrc
        .map((t) => (typeof t === "string" ? t : t?.name || t?.title || ""))
        .map((s) => (s || "").toString().trim())
        .filter(Boolean);
      return `Unit ${num}: ${title}\n  Topics: ${
        topics.length ? topics.join("; ") : "(none listed)"
      }`;
    })
    .join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { courseId, existingConcepts = [] } = await req.json();
    if (!courseId) {
      return new Response(JSON.stringify({ error: "courseId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: course } = await admin
      .from("courses")
      .select("name, course_code, objectives, syllabus_json_path")
      .eq("id", courseId)
      .maybeSingle();

    let syllabusJson: any = null;
    const candidatePaths = [
      course?.syllabus_json_path,
      `${courseId}/syllabus/approved-syllabus.json`,
    ].filter(Boolean) as string[];

    for (const p of candidatePaths) {
      try {
        const { data: blob } = await admin.storage
          .from("course-materials")
          .download(p);
        if (blob) {
          syllabusJson = JSON.parse(await blob.text());
          break;
        }
      } catch (e) {
        console.warn("syllabus fetch failed for", p, e);
      }
    }

    const syllabusBlock = summarizeSyllabus(syllabusJson);
    const existingList = (existingConcepts as string[])
      .map((c) => `- ${c}`)
      .join("\n");

    const systemPrompt = `You are an experienced curriculum advisor who helps professors strengthen their course coverage.

Your job is to suggest ADDITIONAL concepts that are NOT in the syllabus and NOT in the existing confirmed concept list, but would meaningfully strengthen the course. Mix three flavors of suggestions:

1. "industry" — concepts widely expected by employers / industry practitioners in this subject area that the syllabus appears to skip.
2. "foundational" — prerequisite or foundational concepts the syllabus seems to assume but does not explicitly teach.
3. "gap" — general gaps in coverage where a key topic is missing or under-treated relative to the course's stated objectives.

STRICT RULES:
- Output 5–10 concepts total, with a healthy mix across the three categories where possible.
- NEVER repeat anything in the existing confirmed list (case-insensitive).
- NEVER suggest a concept that is already a topic in the syllabus units below (case-insensitive).
- Concept names: 2–6 words, concise, distinct, and teachable as a standalone lesson item.
- Each rationale: ONE sentence explaining why this concept matters (industry relevance, foundational role, or specific gap it fills).
- Be specific to this course's subject area — do not output generic advice.
- WEIGHTING: For every recommendation, include an integer "weight_pct" (1–15) representing the share of total course time it would deserve if added (small because these are supplementary). Use the lower end (1–4) for narrow add-ons, mid (5–9) for substantial topics, upper (10–15) only for major missing pillars.
- WEIGHT RATIONALE: For every recommendation, include a one-sentence "weight_rationale" explaining the suggested weight.`;

    const userPrompt = `Course: ${course?.name || "Untitled"} (${course?.course_code || "n/a"})
Stated objectives: ${(course?.objectives || []).join("; ") || "n/a"}

Existing confirmed concepts (DO NOT repeat any of these):
${existingList || "(none yet)"}

Syllabus units already covered (DO NOT repeat topics from these):

${syllabusBlock}

Suggest additional concepts to recommend.`;

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: await resolveModel("recommend-additional-concepts", null, "google/gemini-2.5-pro"),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "recommend_concepts",
                description:
                  "Return additional concept recommendations across industry, foundational, and gap categories.",
                parameters: {
                  type: "object",
                  properties: {
                    recommendations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          rationale: { type: "string" },
                          category: {
                            type: "string",
                            enum: ["industry", "foundational", "gap"],
                          },
                          weight_pct: { type: "integer", minimum: 1, maximum: 15 },
                          weight_rationale: { type: "string" },
                        },
                        required: ["name", "rationale", "category", "weight_pct", "weight_rationale"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["recommendations"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "recommend_concepts" },
          },
        }),
      },
    );

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Lovable AI credits required." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];

    type Rec = { name: string; rationale: string; category: string; weight_pct?: number; weight_rationale?: string };
    let recs: Rec[] = [];
    try {
      const args = toolCall?.function?.arguments
        ? JSON.parse(toolCall.function.arguments)
        : {};
      if (Array.isArray(args.recommendations)) recs = args.recommendations;
    } catch (e) {
      console.error("Failed to parse tool call:", e);
    }

    // Server-side dedup against existing confirmed concepts
    const existingLc = new Set(
      (existingConcepts as string[]).map((c) => c.trim().toLowerCase()),
    );
    const seen = new Set<string>();
    const cleaned = recs
      .map((r) => ({
        name: (r?.name || "").trim(),
        rationale: (r?.rationale || "").trim(),
        category: ["industry", "foundational", "gap"].includes(r?.category)
          ? r.category
          : "gap",
        weight_pct: Math.max(1, Math.min(15, Math.round(Number(r?.weight_pct) || 5))),
        weight_rationale: (r?.weight_rationale || "").trim(),
      }))
      .filter((r) => {
        if (!r.name) return false;
        const key = r.name.toLowerCase();
        if (existingLc.has(key)) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    return new Response(JSON.stringify({ recommendations: cleaned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("recommend-additional-concepts error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
