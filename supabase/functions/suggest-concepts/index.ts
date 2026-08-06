/**
 * suggest-concepts
 *
 * Purpose:
 *   Initial concept-list generation from the approved syllabus, producing a
 *   ranked set of concept codes + weights the teacher can accept or edit.
 *
 * Auth / Access:
 *   Bearer token of the course teacher.
 *
 * Inputs:
 *   - courseId: uuid
 *
 * Steps:
 *   1. Authenticate teacher and load approved syllabus JSON from storage.
 *   2. Prompt the AI to produce concept_code + weight (0–100) items covering the syllabus.
 *   3. Normalize weights and dedupe.
 *   4. Return the suggestions (teacher decides which to persist).
 *
 * External calls:
 *   Lovable AI Gateway.
 */

// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";
const FUNCTION_NAME = "suggest-concepts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const systemPrompt = `You are an expert curriculum designer extracting teachable items from course materials.
INPUT: Parsed syllabus units in order, each with a sequence number and verbatim topic strings. You may also receive SECONDARY materials (teaching notes, a lesson plan, transcripts): use them to enrich items the syllabus defines, but the syllabus alone defines which units exist, their order, and the topic list. Never create a unit or an item from secondary materials alone; fold their detail into the matching syllabus item.
GOAL: An ordered, hierarchical set of distinct teachable items, grounded in the syllabus, ready to be sequenced into lesson plans.
CONCEPT LIMIT PER UNIT: Extract AT MOST 3 core concepts per unit: the most important, foundational teaching points. No limit on units. The cap counts TOP-LEVEL concepts only; supporting subtopics, case studies, definitions, and skills nested beneath them do not count against the 3. Choose by importance; absorb minor topics into a core concept rather than promoting them. A unit with fewer than 3 real concepts returns fewer; never pad to reach 3.
WHAT IS NOT A TEACHABLE ITEM: Recognize these by FORM, not by heading, and never emit them as concepts:
A) READINGS / SOURCE REFERENCES — an author+year ("Mishkin 2019"), a chapter/page pointer ("Ch. 12", "pp. 45-60"), a book or article title given as a source, a citation, URL, or DOI. A teachable item names an IDEA; a reading names a SOURCE. If a reading maps to a concept you do extract, record it in that item's "sources" array instead of emitting it.
B) ADMINISTRATIVE / FRAMING ENTRIES with no subject matter — "Introduction", "Course Overview", "Recap", "Conclusion". If such an entry introduces real content, emit that content under its real name.
C) ASSESSMENTS / CLASS ACTIVITIES — things students DO, not ideas they learn: "Final Exam", "Quiz", "Final Presentation", "Final Exercise", "Project Submission", "Assignment 3", "Viva", "Term Paper", and format entries like "Guest Lecture", "Field Visit", "Tutorial", "Review Session". Signs: exam, test, quiz, presentation, exercise, project, assignment, submission, viva, paper, lab, or a deadline. Skip these. Exception: if paired with subject matter ("Presentation on Exchange Rate Regimes"), extract the subject and drop the activity wrapper.
If unsure, skip an entry only when a clear sign above is present; never drop a real concept because it shares a word with a title.
TYPE
One of:
- "concept": an abstract theoretical idea.
- "model": a named framework or accounting identity.
- "case_study": a concrete, real instance illustrating an idea.
- "skill": a measurable competency the student performs.
- "definition": a term whose teaching point is the definition itself.
CONCEPT vs CASE STUDY — these are ALWAYS separate items; never type an application as a concept. Classify as case_study when an entry either names a real dated event ("1991 BoP Crisis"), or describes applying/illustrating an idea in a concrete setting even with no date — signalled by "application of", "case of", "example", "in practice", "applied to", or a named company, country, or industry ("Inflation Targeting in India"). Emit the abstract idea as its own concept (if the syllabus teaches it) and link the case to it via related_ids. If only the application is listed, still emit it as a case_study linked to the nearest concept; do not relabel it. Test: the IDEA is a concept; an INSTANCE of it is a case_study.
HIERARCHY: At most three levels. "depth" MUST match real tree position:
- "topic": has at least one child; parent_id null.
- "subtopic": has a parent AND a child.
- "leaf": no children. Most items are leaves.
An item may be "topic" or "subtopic" ONLY if it actually has children in your output. No children means "leaf", however broad the name sounds; significance is carried by weight_pct, not depth. When in doubt, leaf. case_study and definition items are essentially always leaves. Never nest deeper than topic > subtopic > leaf.
DEDUPLICATE BY MEANING: Merge two items only if a teacher would deliver them as ONE lesson. Same teaching point, different words → merge (keep one "name", others in "aliases", all units in "source_units"). Do NOT merge: contrast pairs (Nominal vs Real Exchange Rates, Fixed vs Floating); near-homographs with distinct technical meaning (Systemic vs Systematic Risk, Devaluation vs Depreciation); or a concept and the case/definition illustrating it (link via related_ids). Wording similarity is not evidence to merge; wording difference is not evidence against it. Items sharing no covers_topics are very likely distinct.
LINK: For a case_study or skill applying another item, set "related_ids" to the concept(s) or model(s) it draws on.
COVER: Every teachable topic in a unit must be accounted for despite the 3-concept cap: fold related topics into the core concept they belong under, listing each verbatim topic string in that concept's "covers_topics". Nothing teachable is silently lost; readings, admin entries, and assessments are the only things dropped.

WEIGHT: Leaves only. Each leaf gets an integer "weight_pct" 1-100 for teaching emphasis (breadth, depth, foundational importance, time on task). Non-leaf items get weight_pct null and are excluded from any total. All leaf weights across all units must sum to EXACTLY 100 — total them before output and adjust the largest leaves until they do. Add a one-sentence "weight_rationale" to every item.
ID: "u{firstSourceUnit}-{slug}", slug = name lowercased with non-alphanumerics as hyphens (e.g. "u2-fixed-exchange-rates"). Unique. parent_id and related_ids must reference emitted ids.
OUTPUT: Strict JSON, one key "items", an array of objects with: id, name, type, depth, parent_id (or null), aliases, related_ids, source_units, position (integer, top-to-bottom across all units from 1, following syllabus order), covers_topics, sources, weight_pct (integer for leaves, null for parents), weight_rationale. Output only the JSON. No prose, no markdown fences`;

    type ConceptOut = {
      name: string;
      rationale: string;
      weight_pct?: number;
      weight_rationale?: string;
      covers_topics?: string[];
    };
    type UnitOut = { unit_number: number; unit_title: string; concepts: ConceptOut[] };

    async function callAi(
      unitsForCall: { unit_number: number; unit_title: string; topics: string[] }[],
      retryNote = "",
    ): Promise<{ parsedUnits: UnitOut[]; finishReason: string | undefined; rawLen: number }> {
      const block = unitsForCall
        .map(
          (u) =>
            `Unit ${u.unit_number}: ${u.unit_title}\n  Topics: ${u.topics.length ? u.topics.join("; ") : "(none listed)"}`,
        )
        .join("\n\n");
      const prompt = `Course: ${course?.name || "Untitled"} (${course?.course_code || "n/a"})
Objectives: ${(course?.objectives || []).join("; ") || "n/a"}

Existing confirmed concepts (DO NOT repeat any of these):
${existingList || "(none yet)"}

Syllabus units (in learning order — preserve this order in your output):

${block}

${retryNote || "Extract concepts unit by unit, in sequence, with no overlap. Every listed topic must be covered."}`;

      const aiResp = await loggedGatewayFetch(FUNCTION_NAME, { model: "google/gemini-2.5-pro", purpose: "suggest-concepts", course_id: courseId ?? null }, "https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(300_000),
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          temperature: 0.2,
          max_tokens: 8000,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_unit_concepts",
                description:
                  "Return concepts grouped by syllabus unit, in unit order, with no concept repeated across units. Every topic listed in a unit must be covered by at least one concept's covers_topics.",
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
                                covers_topics: {
                                  type: "array",
                                  items: { type: "string" },
                                  description: "Verbatim topic strings from this unit that this concept teaches.",
                                },
                              },
                              required: ["name", "rationale", "weight_pct", "weight_rationale", "covers_topics"],
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
        const t = await aiResp.text();
        const err: any = new Error(`AI gateway error ${aiResp.status}: ${t}`);
        err.status = aiResp.status;
        throw err;
      }
      const aiData = await aiResp.json();
      const choice = aiData?.choices?.[0];
      const finishReason = choice?.finish_reason;
      const toolCall = choice?.message?.tool_calls?.[0];
      const rawArgs = toolCall?.function?.arguments || "";
      let parsedUnits: UnitOut[] = [];
      try {
        const args = rawArgs ? JSON.parse(rawArgs) : {};
        if (Array.isArray(args.units)) parsedUnits = args.units;
      } catch (e) {
        console.error("Failed to parse tool call. finish_reason=", finishReason, "rawLen=", rawArgs.length, "err=", e);
      }
      return { parsedUnits, finishReason, rawLen: rawArgs.length };
    }

    // Helpers for coverage check
    const norm = (s: string) =>
      (s || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    function topicCoveredBy(topic: string, covered: string[]): boolean {
      const t = norm(topic);
      if (!t) return true;
      for (const c of covered) {
        const cn = norm(c);
        if (!cn) continue;
        if (cn === t || cn.includes(t) || t.includes(cn)) return true;
      }
      return false;
    }

    // ---- Initial call: batch units in parallel to avoid 150s edge timeout ----
    const BATCH_SIZE = 3;
    const batches: { unit_number: number; unit_title: string; topics: string[] }[][] = [];
    for (let i = 0; i < units.length; i += BATCH_SIZE) {
      batches.push(units.slice(i, i + BATCH_SIZE));
    }
    console.log("suggest-concepts: dispatching", batches.length, "batches of up to", BATCH_SIZE, "units");

    let parsedUnits: UnitOut[] = [];
    let anyFinishLength = false;
    let fatalStatus: number | null = null;
    const results = await Promise.all(
      batches.map((b) =>
        callAi(b).catch((e: any) => {
          if (e?.status === 429 || e?.status === 402) fatalStatus = e.status;
          console.warn("suggest-concepts: batch failed", e?.status, e?.message);
          return { parsedUnits: [] as UnitOut[], finishReason: undefined, rawLen: 0 };
        }),
      ),
    );
    if (fatalStatus === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (fatalStatus === 402) {
      return new Response(JSON.stringify({ error: "Lovable AI credits required." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    for (const r of results) {
      if (r.finishReason === "length") anyFinishLength = true;
      parsedUnits.push(...r.parsedUnits);
    }
    const firstResult = { parsedUnits, finishReason: anyFinishLength ? "length" : "stop", rawLen: 0 };
    console.log("suggest-concepts: batched units returned=", parsedUnits.length);

    // ---- Coverage check + targeted retry ----
    const byUnitNum = new Map<number, UnitOut>();
    for (const u of parsedUnits) byUnitNum.set(u.unit_number, u);

    const underCovered: { unit_number: number; unit_title: string; topics: string[] }[] = [];
    for (const u of units) {
      const got = byUnitNum.get(u.unit_number);
      const covered: string[] = [];
      if (got) for (const c of got.concepts || []) covered.push(...(c.covers_topics || []), c.name || "");
      const missing = u.topics.filter((t) => !topicCoveredBy(t, covered));
      const ratio = u.topics.length === 0 ? 1 : (u.topics.length - missing.length) / u.topics.length;
      if (u.topics.length > 0 && (ratio < 0.85 || !got || (got.concepts?.length || 0) === 0)) {
        underCovered.push({
          unit_number: u.unit_number,
          unit_title: u.unit_title,
          topics: missing.length ? missing : u.topics,
        });
      }
    }

    const shouldRetry = underCovered.length > 0 || firstResult.finishReason === "length";
    if (shouldRetry) {
      console.log(
        "suggest-concepts: retrying for under-covered units:",
        underCovered.map((u) => `U${u.unit_number}(${u.topics.length})`).join(","),
      );
      try {
        const retryNote =
          "These units are under-covered — produce concepts that cover EVERY listed topic below. Do not repeat concept names already produced.";
        const retryUnits = underCovered.length > 0 ? underCovered : units;
        const retry = await callAi(retryUnits, retryNote);
        // Merge: prefer retry concepts for those units; otherwise keep existing
        const retryByUnit = new Map<number, UnitOut>();
        for (const u of retry.parsedUnits) retryByUnit.set(u.unit_number, u);
        const merged: UnitOut[] = [];
        const allUnitNums = new Set<number>([...byUnitNum.keys(), ...retryByUnit.keys()]);
        for (const n of allUnitNums) {
          const a = byUnitNum.get(n);
          const b = retryByUnit.get(n);
          if (a && b) {
            const seen = new Set((a.concepts || []).map((c) => (c.name || "").toLowerCase()));
            const extra = (b.concepts || []).filter((c) => !seen.has((c.name || "").toLowerCase()));
            merged.push({
              unit_number: n,
              unit_title: a.unit_title || b.unit_title,
              concepts: [...(a.concepts || []), ...extra],
            });
          } else {
            merged.push((a || b)!);
          }
        }
        parsedUnits = merged;
      } catch (e) {
        console.warn("suggest-concepts: retry failed (non-fatal)", e);
      }
    }

    const existingLc = new Set((existingConcepts as string[]).map((c) => c.trim().toLowerCase()));
    const seen = new Set<string>();
    const cleanUnits: UnitOut[] = parsedUnits
      .sort((a, b) => {
        const an = a.unit_number || 0;
        const bn = b.unit_number || 0;
        if (an !== bn) return an - bn;
        return norm(a.unit_title || "").localeCompare(norm(b.unit_title || ""));
      })
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

    // Reorder concepts within each unit to match syllabus topic order — fully deterministic.
    // Sort key per concept: (firstIdx, coverageSignature, -matchCount, normalizedName).
    // Unmatched concepts go to the end, sorted by normalized name only.
    const unitTopicsByNum = new Map<number, string[]>();
    for (const u of units) unitTopicsByNum.set(u.unit_number, u.topics);
    for (const u of cleanUnits) {
      const topics = unitTopicsByNum.get(u.unit_number) || [];
      if (topics.length === 0 || u.concepts.length <= 1) continue;
      const indexed = u.concepts.map((c) => {
        const covers = (c.covers_topics || []).concat(c.name ? [c.name] : []);
        const matched: number[] = [];
        // Iterate topics in order, independent of covers_topics ordering.
        for (let i = 0; i < topics.length; i++) {
          if (topicCoveredBy(topics[i], covers)) matched.push(i);
        }
        const firstIdx = matched.length ? matched[0] : Number.MAX_SAFE_INTEGER;
        return { c, firstIdx, matched, nameKey: norm(c.name || "") };
      });
      indexed.sort((a, b) => {
        if (a.firstIdx !== b.firstIdx) return a.firstIdx - b.firstIdx;
        // Lexicographic compare on full coverage signature.
        const len = Math.min(a.matched.length, b.matched.length);
        for (let i = 0; i < len; i++) {
          if (a.matched[i] !== b.matched[i]) return a.matched[i] - b.matched[i];
        }
        if (a.matched.length !== b.matched.length) {
          // More-specific (more matches) first at same prefix.
          return b.matched.length - a.matched.length;
        }
        return a.nameKey.localeCompare(b.nameKey);
      });
      u.concepts = indexed.map((x) => x.c);
    }

    // Build per-unit coverage summary using verbatim syllabus topics
    const coverageByUnit = new Map<number, { covered: number; total: number; missing: string[] }>();
    for (const u of units) {
      const got = cleanUnits.find((x) => x.unit_number === u.unit_number);
      const coveredArr: string[] = [];
      if (got) for (const c of got.concepts) coveredArr.push(...(c.covers_topics || []), c.name);
      const missing = u.topics.filter((t) => !topicCoveredBy(t, coveredArr));
      coverageByUnit.set(u.unit_number, { covered: u.topics.length - missing.length, total: u.topics.length, missing });
    }

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
        const base = Math.floor(100 / flat.length);
        let rem = 100 - base * flat.length;
        flat.forEach((x, i) => (x.weight_pct = base + (i < rem ? 1 : 0)));
      } else if (Math.abs(totalW - 100) > 5) {
        const scaled = flat.map((x) => (x.weight_pct * 100) / totalW);
        const floors = scaled.map((v) => Math.max(1, Math.floor(v)));
        let assigned = floors.reduce((s, v) => s + v, 0);
        const remainders = scaled.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
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

    const unitsWithCoverage = cleanUnits.map((u) => ({
      ...u,
      coverage: coverageByUnit.get(u.unit_number) || { covered: 0, total: 0, missing: [] },
    }));

    const totalRaw = parsedUnits.reduce((n, u) => n + (u.concepts?.length || 0), 0);
    const responseBody: any = { suggestions, units: unitsWithCoverage, reason: "ok" };
    if (suggestions.length === 0 && totalRaw > 0) {
      responseBody.reason = "all_dedup";
      responseBody.warning = "All extracted concepts were already in your confirmed list — nothing new to add.";
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
