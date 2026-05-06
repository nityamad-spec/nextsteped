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
  week?: number | string;
  chapter?: number | string;
  title?: string;
  name?: string;
  topics?: (string | { name?: string; title?: string })[];
  subtopics?: (string | { name?: string; title?: string })[];
  items?: (string | { name?: string; title?: string })[];
  description?: string;
};

function pickUnitArray(syllabus: any): SyllabusUnit[] {
  if (!syllabus) return [];
  // Top-level array
  if (Array.isArray(syllabus)) return syllabus as SyllabusUnit[];
  // Common keys
  for (const k of ["units", "modules", "chapters", "sections", "weeks", "topics"]) {
    if (Array.isArray(syllabus[k])) return syllabus[k] as SyllabusUnit[];
  }
  // Nested under syllabus.*
  if (syllabus.syllabus && typeof syllabus.syllabus === "object") {
    for (const k of ["units", "modules", "chapters", "sections", "weeks", "topics"]) {
      if (Array.isArray(syllabus.syllabus[k])) return syllabus.syllabus[k] as SyllabusUnit[];
    }
  }
  return [];
}

function normalizeUnits(syllabus: any): { unit_number: number; unit_title: string; topics: string[] }[] {
  const raw = pickUnitArray(syllabus);
  return raw
    .map((u, idx) => {
      const numRaw = u.unit_number ?? u.number ?? u.week ?? u.chapter ?? idx + 1;
      const num = typeof numRaw === "string" ? parseInt(numRaw, 10) || idx + 1 : Number(numRaw) || idx + 1;
      const title = (u.title || u.name || `Unit ${num}`).toString().trim();
      const topicSrc = (u.topics || u.subtopics || u.items || []) as any[];
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

    // Build candidate paths: explicit pointer + hardcoded fallback + scan storage
    const candidatePaths: string[] = [];
    if (course?.syllabus_json_path) candidatePaths.push(course.syllabus_json_path);
    candidatePaths.push(`${courseId}/syllabus/approved-syllabus.json`);

    // Also discover any .json files in the course's syllabus folder
    try {
      const { data: listed } = await admin.storage
        .from("course-materials")
        .list(`${courseId}/syllabus`, { limit: 100, sortBy: { column: "updated_at", order: "desc" } });
      if (Array.isArray(listed)) {
        for (const f of listed) {
          if (f?.name && f.name.toLowerCase().endsWith(".json")) {
            const p = `${courseId}/syllabus/${f.name}`;
            if (!candidatePaths.includes(p)) candidatePaths.push(p);
          }
        }
      }
    } catch (e) {
      console.warn("storage list failed", e);
    }

    console.log("suggest-concepts: courseId=", courseId, "candidatePaths=", candidatePaths);

    let syllabusJson: any = null;
    let matchedPath: string | null = null;
    for (const p of candidatePaths) {
      try {
        const { data: blob } = await admin.storage.from("course-materials").download(p);
        if (blob) {
          const txt = await blob.text();
          syllabusJson = JSON.parse(txt);
          matchedPath = p;
          break;
        }
      } catch (e) {
        // file likely missing — continue
      }
    }

    console.log("suggest-concepts: matchedPath=", matchedPath);

    if (!syllabusJson) {
      return new Response(
        JSON.stringify({
          suggestions: [],
          units: [],
          reason: "no_syllabus_file",
          warning:
            "No parsed syllabus JSON was found in storage. Re-upload your syllabus on the Syllabus Review step so it can be parsed.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const units = normalizeUnits(syllabusJson);
    console.log("suggest-concepts: unitsFound=", units.length);

    if (units.length === 0) {
      return new Response(
        JSON.stringify({
          suggestions: [],
          units: [],
          reason: "unrecognized_shape",
          warning:
            "Found a syllabus file but could not detect any units in it. Re-upload the syllabus so it parses into structured units.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const existingList = (existingConcepts as string[]).map((c) => `- ${c}`).join("\n");

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
7. COVERAGE (CRITICAL): EVERY topic listed under a unit MUST be represented by at least one concept in that same unit. Multiple closely-related topics MAY be merged under a single concept, but no listed topic may be silently dropped. Aim for 3–10 concepts per unit depending on unit breadth — err on the side of MORE concepts rather than dropping topics.
8. TOPIC MAPPING: For every concept, include "covers_topics" — an array of the verbatim topic strings (copied exactly from this unit's listed topics) that this concept teaches. Every topic in the unit must appear in at least one concept's covers_topics array.
9. WEIGHTING: For every concept, include an integer "weight_pct" (1–100) representing its share of total course teaching emphasis (breadth × depth × foundational importance × time-on-task). The sum of weight_pct across ALL concepts in ALL units MUST be approximately 100. Per-unit totals should roughly track unit breadth.
10. WEIGHT RATIONALE: For every concept, include a one-sentence "weight_rationale" explaining why it deserves that share (e.g. "foundational prerequisite reused throughout the course", "narrow applied topic", "broad multi-week treatment").`;

    const userPrompt = `Course: ${course?.name || "Untitled"} (${course?.course_code || "n/a"})
Objectives: ${(course?.objectives || []).join("; ") || "n/a"}

Existing confirmed concepts (DO NOT repeat any of these):
${existingList || "(none yet)"}

Syllabus units (in learning order — preserve this order in your output):

${unitsBlock}

Extract concepts unit by unit, in sequence, with no overlap.`;

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
                              weight_pct: { type: "integer", minimum: 1, maximum: 100 },
                              weight_rationale: { type: "string" },
                            },
                            required: ["name", "rationale", "weight_pct", "weight_rationale"],
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

    type UnitOut = { unit_number: number; unit_title: string; concepts: { name: string; rationale: string; weight_pct?: number; weight_rationale?: string }[] };
    let parsedUnits: UnitOut[] = [];
    try {
      const args = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};
      if (Array.isArray(args.units)) parsedUnits = args.units;
    } catch (e) {
      console.error("Failed to parse tool call:", e);
    }

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

    // Flatten with weights, then normalize so weight_pct sums to ~100 (largest-remainder)
    const flat = cleanUnits.flatMap((u) =>
      u.concepts.map((c) => ({
        name: c.name,
        rationale: c.rationale,
        weight_pct: Math.max(1, Math.min(100, Math.round(Number(c.weight_pct) || 0))),
        weight_rationale: (c.weight_rationale || "").trim(),
        unit_number: u.unit_number,
        unit_title: u.unit_title,
      })),
    );
    const totalW = flat.reduce((s, x) => s + x.weight_pct, 0);
    if (flat.length > 0) {
      if (totalW === 0) {
        // Fallback: even split
        const base = Math.floor(100 / flat.length);
        let rem = 100 - base * flat.length;
        flat.forEach((x, i) => (x.weight_pct = base + (i < rem ? 1 : 0)));
      } else if (Math.abs(totalW - 100) > 5) {
        // Largest-remainder rescale to 100
        const scaled = flat.map((x) => (x.weight_pct * 100) / totalW);
        const floors = scaled.map((v) => Math.max(1, Math.floor(v)));
        let assigned = floors.reduce((s, v) => s + v, 0);
        const remainders = scaled
          .map((v, i) => ({ i, frac: v - Math.floor(v) }))
          .sort((a, b) => b.frac - a.frac);
        let k = 0;
        while (assigned < 100 && k < remainders.length) {
          floors[remainders[k].i] += 1;
          assigned += 1;
          k += 1;
        }
        flat.forEach((x, i) => (x.weight_pct = floors[i]));
      }
    }
    const suggestions = flat;

    const totalRaw = parsedUnits.reduce((n, u) => n + (u.concepts?.length || 0), 0);
    const responseBody: any = { suggestions, units: cleanUnits, reason: "ok" };
    if (suggestions.length === 0 && totalRaw > 0) {
      responseBody.reason = "all_dedup";
      responseBody.warning =
        "All extracted concepts were already in your confirmed list — nothing new to add.";
    } else if (suggestions.length === 0) {
      responseBody.reason = "empty_ai_output";
      responseBody.warning =
        "The AI did not return any concepts for this syllabus. Try re-running, or check that your syllabus has detailed topics per unit.";
    }

    return new Response(JSON.stringify(responseBody), {
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
