// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
  description?: string;
};

function normalizeUnits(syllabus: any): { unit_number: number; unit_title: string; topics: string[] }[] {
  if (!syllabus) return [];
  const raw: SyllabusUnit[] = Array.isArray(syllabus.units)
    ? syllabus.units
    : Array.isArray(syllabus.modules)
    ? syllabus.modules
    : [];

  return raw
    .map((u, idx) => {
      const numRaw = u.unit_number ?? u.number ?? idx + 1;
      const num = typeof numRaw === "string" ? parseInt(numRaw, 10) || idx + 1 : Number(numRaw) || idx + 1;
      const title = (u.title || u.name || `Unit ${num}`).toString().trim();
      const topicSrc = (u.topics || u.subtopics || []) as any[];
      const topics = topicSrc
        .map((t) => (typeof t === "string" ? t : t?.name || t?.title || ""))
        .map((s) => (s || "").toString().trim())
        .filter(Boolean);
      return { unit_number: num, unit_title: title, topics };
    })
    .sort((a, b) => a.unit_number - b.unit_number);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
      .select("name, course_code, objectives, syllabus_json_path, teacher_id")
      .eq("id", courseId)
      .maybeSingle();

    // Load syllabus JSON (the source of truth for unit ordering)
    let syllabusJson: any = null;
    const candidatePaths = [
      course?.syllabus_json_path,
      `${courseId}/syllabus/approved-syllabus.json`,
    ].filter(Boolean) as string[];

    for (const p of candidatePaths) {
      try {
        const { data: blob } = await admin.storage.from("course-materials").download(p);
        if (blob) {
          const txt = await blob.text();
          syllabusJson = JSON.parse(txt);
          break;
        }
      } catch (e) {
        console.warn("syllabus fetch failed for", p, e);
      }
    }

    const units = normalizeUnits(syllabusJson);

    const existingList = (existingConcepts as string[]).map((c) => `- ${c}`).join("\n");

    // Build unit context block for the model
    const unitsBlock = units
      .map(
        (u) =>
          `Unit ${u.unit_number}: ${u.unit_title}\n  Topics: ${
            u.topics.length ? u.topics.join("; ") : "(none listed)"
          }`,
      )
      .join("\n\n");

    const systemPrompt = `You are an expert curriculum designer extracting teachable concepts from a structured syllabus.

STRICT RULES:
1. Output concepts grouped by unit, in the EXACT same order as the syllabus units (Unit 1 first, then Unit 2, etc.).
2. Within each unit, order concepts in natural learning sequence — foundational prerequisites first, advanced/applied concepts last.
3. NO OVERLAP between units: each concept belongs to exactly ONE unit. If a concept logically spans multiple units, place it in the EARLIEST unit where it is introduced, and never repeat it.
4. Ground every concept in the unit's listed topics — do not invent concepts unrelated to the syllabus.
5. Concept names must be concise (2–6 words), distinct, and teachable as a standalone lesson item.
6. SKIP any concept already in the existing confirmed list (case-insensitive).
7. Aim for 3–8 concepts per unit depending on unit breadth.`;

    const userPrompt = `Course: ${course?.name || "Untitled"} (${course?.course_code || "n/a"})
Objectives: ${(course?.objectives || []).join("; ") || "n/a"}

Existing confirmed concepts (DO NOT repeat any of these):
${existingList || "(none yet)"}

Syllabus units (in learning order — preserve this order in your output):

${unitsBlock || "(no structured units found in syllabus)"}

Extract concepts unit by unit, in sequence, with no overlap.`;

    if (units.length === 0) {
      return new Response(
        JSON.stringify({
          suggestions: [],
          units: [],
          warning: "No structured units found in approved-syllabus.json. Re-upload the syllabus so it parses into units.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
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
        tools: [
          {
            type: "function",
            function: {
              name: "extract_unit_concepts",
              description:
                "Return concepts grouped by syllabus unit, in unit order, with no concept repeated across units.",
              parameters: {
                type: "object",
                properties: {
                  units: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        unit_number: { type: "integer" },
                        unit_title: { type: "string" },
                        concepts: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string" },
                              rationale: { type: "string" },
                            },
                            required: ["name", "rationale"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["unit_number", "unit_title", "concepts"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["units"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_unit_concepts" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Lovable AI credits required." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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

    type UnitOut = { unit_number: number; unit_title: string; concepts: { name: string; rationale: string }[] };
    let parsedUnits: UnitOut[] = [];
    try {
      const args = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};
      if (Array.isArray(args.units)) parsedUnits = args.units;
    } catch (e) {
      console.error("Failed to parse tool call:", e);
    }

    // Enforce no-overlap and existing-concept dedup server-side
    const existingLc = new Set((existingConcepts as string[]).map((c) => c.trim().toLowerCase()));
    const seen = new Set<string>();
    const cleanUnits: UnitOut[] = parsedUnits
      .sort((a, b) => (a.unit_number || 0) - (b.unit_number || 0))
      .map((u) => {
        const concepts = (u.concepts || []).filter((c) => {
          const key = (c?.name || "").trim().toLowerCase();
          if (!key) return false;
          if (existingLc.has(key)) return false;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return { unit_number: u.unit_number, unit_title: u.unit_title, concepts };
      })
      .filter((u) => u.concepts.length > 0);

    // Flatten for backward-compatible suggestions array (in unit order)
    const suggestions = cleanUnits.flatMap((u) =>
      u.concepts.map((c) => ({
        name: c.name,
        rationale: c.rationale,
        unit_number: u.unit_number,
        unit_title: u.unit_title,
      })),
    );

    return new Response(JSON.stringify({ suggestions, units: cleanUnits }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-concepts error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
