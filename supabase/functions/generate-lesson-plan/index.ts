import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_DOC_CHARS_PER_FILE = 8000;
const MAX_TOTAL_DOC_CHARS = 30000;

function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  } catch {
    return "";
  }
}

function isProbablyTextual(name: string): boolean {
  return /\.(txt|md|csv|json|html?|xml|rtf)$/i.test(name);
}

async function downloadFileAsText(
  supabaseAdmin: any,
  storagePath: string,
  fileName: string,
): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from("course-materials")
      .download(storagePath);
    if (error || !data) return "";
    const buffer = await data.arrayBuffer();
    if (isProbablyTextual(fileName)) {
      return decodeText(buffer).slice(0, MAX_DOC_CHARS_PER_FILE);
    }
    const text = decodeText(buffer);
    const printable = text.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
    if (printable.length < 200) return "";
    return printable.slice(0, MAX_DOC_CHARS_PER_FILE);
  } catch {
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let courseId: string | undefined;
  try {
    const body = await req.json();
    courseId = body?.courseId;
  } catch {
    /* handled below */
  }

  const sseHeaders = {
    ...corsHeaders,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    Connection: "keep-alive",
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* controller closed */
        }
      };
      const heartbeat = setInterval(() => emit({ type: "heartbeat", ts: Date.now() }), 15000);
      const finish = () => {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      };

      try {
        if (!courseId) {
          emit({ type: "error", message: "courseId is required", code: "BAD_REQUEST" });
          return finish();
        }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase env not configured");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    emit({ type: "phase", step: "load", message: "Loading course & concepts…" });

    // 1. Fetch course metadata (incl exam weeks)
    const { data: course, error: courseError } = await supabaseAdmin
      .from("courses")
      .select("name, course_code, term, total_weeks, sessions_per_week, session_length_minutes, objectives, teacher_id, syllabus_json_path, midterm_week, final_week")
      .eq("id", courseId)
      .single();

    if (courseError || !course) {
      emit({ type: "error", message: "Course not found", code: "NOT_FOUND" });
      return finish();
    }

    const totalWeeks = course.total_weeks || 16;
    const midtermWeek = course.midterm_week || null;
    const finalWeek = course.final_week || null;

    // 2. Load CONFIRMED concepts from Concept Review (source of truth)
    const { data: conceptRows, error: conceptError } = await supabaseAdmin
      .from("concepts")
      .select("id, concept_code, weight, created_at")
      .eq("course_id", courseId)
      .order("created_at", { ascending: true });

    if (conceptError) {
      throw new Error(`Failed to load concepts: ${conceptError.message}`);
    }

    if (!conceptRows || conceptRows.length === 0) {
      emit({ type: "error", message: "No confirmed concepts. Complete Concept Review first.", code: "NO_CONCEPTS" });
      return finish();
    }
    emit({ type: "log", message: `Loaded ${conceptRows.length} approved concepts.` });

    const orderedConceptNames: string[] = conceptRows.map((c: any) => String(c.concept_code).trim());
    const teacherWeights: number[] = conceptRows.map((c: any) => {
      const w = Number(c.weight);
      return Number.isFinite(w) && w > 0 ? w : 0;
    });
    // Lookup map for case-insensitive name resolution
    const conceptNameLookup = new Map<string, string>();
    for (const name of orderedConceptNames) {
      conceptNameLookup.set(name.toLowerCase(), name);
    }

    // 3. Fetch uploaded files (for context only)
    const { data: files } = await supabaseAdmin
      .from("course_material_files")
      .select("file_name, storage_path, folder_type")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false });

    const syllabusFiles = (files || []).filter((f) => f.folder_type === "syllabus");
    const lessonPlanFiles = (files || []).filter((f) => f.folder_type === "lesson-plans");
    const materialFiles = (files || []).filter((f) => f.folder_type === "materials");

    // 3a. Syllabus context
    let syllabusContext = "";
    let syllabusChars = 0;
    for (const f of syllabusFiles) {
      if (syllabusChars >= 12000) break;
      const text = await downloadFileAsText(supabaseAdmin, f.storage_path, f.file_name);
      if (text) {
        const slice = text.slice(0, 12000 - syllabusChars);
        syllabusContext += `--- ${f.file_name} ---\n${slice}\n\n`;
        syllabusChars += slice.length;
      }
    }
    if (!syllabusContext && course.syllabus_json_path) {
      try {
        const { data: syllabusData } = await supabaseAdmin.storage
          .from("course-materials")
          .download(course.syllabus_json_path);
        if (syllabusData) {
          const text = await syllabusData.text();
          syllabusContext = text.slice(0, 12000);
        }
      } catch (e) {
        console.error("legacy syllabus fetch failed:", e);
      }
    }

    // 3b. Lesson plan docs (context for pacing)
    let totalChars = 0;
    const lessonPlanExcerpts: string[] = [];
    for (const f of lessonPlanFiles) {
      if (totalChars >= MAX_TOTAL_DOC_CHARS) break;
      const text = await downloadFileAsText(supabaseAdmin, f.storage_path, f.file_name);
      if (text) {
        const slice = text.slice(0, MAX_TOTAL_DOC_CHARS - totalChars);
        lessonPlanExcerpts.push(`--- ${f.file_name} ---\n${slice}`);
        totalChars += slice.length;
      }
    }

    const materialFileNames = materialFiles.map((f) => f.file_name);

    // ─── Setup: weeks, exam weeks, sessions ───
    const examWeeks = new Set<number>();
    if (midtermWeek) examWeeks.add(midtermWeek);
    if (finalWeek) examWeeks.add(finalWeek);
    const teachingWeeksCount = totalWeeks - examWeeks.size;
    const sessionsPerWeek = Math.max(1, Number(course.sessions_per_week) || 2);
    const totalSessions = Math.max(1, teachingWeeksCount * sessionsPerWeek);

    const examWeeksDescription = [
      midtermWeek ? `- Week ${midtermWeek}: MIDTERM EXAM (no new concepts)` : null,
      finalWeek ? `- Week ${finalWeek}: FINAL EXAM (no new concepts)` : null,
    ].filter(Boolean).join("\n");

    const warnings: string[] = [];

    emit({ type: "phase", step: "verify", message: "Verifying concept order against syllabus…" });
    // ─── STEP 0: LLM call — verify concept order against the syllabus ───
    const originalOrderForVerification = [...orderedConceptNames];
    let orderVerification: any = {
      changed: false,
      accepted: false,
      notes: "",
      originalOrder: originalOrderForVerification,
      newOrder: originalOrderForVerification,
    };

    if (!syllabusContext) {
      orderVerification.notes = "No syllabus text available; kept teacher-approved order.";
      warnings.push("No syllabus text available for order verification; kept teacher-approved order.");
    } else {
      const verifySystem = `You verify and re-order a set of approved course concepts to match the pedagogical sequence implied by the SYLLABUS.

STRICT RULES:
- Return EXACTLY the same set of concept names as input — no additions, no deletions, no renames, preserve case and spelling.
- Order primarily by the syllabus sequence; use lesson-plan docs as a secondary signal; the input order is only a tiebreaker.
- Honor explicit prerequisites stated in the syllabus.
- If the syllabus is silent or the current order already matches it, return the original order with changed=false.
- Provide a short rationale (≤15 words) per concept and a 1–3 sentence overall notes summary.
Return ONLY via the provided tool.`;

      const verifyUser = `COURSE: ${course.name} (${course.term})
Objectives: ${(course.objectives || []).join("; ") || "Not specified"}

APPROVED CONCEPTS (current order):
${orderedConceptNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}

SYLLABUS CONTEXT (primary signal):
${syllabusContext.slice(0, 10000)}

LESSON PLAN DOCS (secondary signal):
${lessonPlanExcerpts.length > 0 ? lessonPlanExcerpts.join("\n\n").slice(0, 6000) : "(none)"}`;

      const callOrderLLM = async () => {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            temperature: 0.1,
            top_p: 0.9,
            max_tokens: 4096,
            seed: 42,
            reasoning: { effort: "low" },
            messages: [
              { role: "system", content: verifySystem },
              { role: "user", content: verifyUser },
            ],
            tools: [{
              type: "function",
              function: {
                name: "verify_concept_order",
                description: "Return the approved concepts re-ordered to match the syllabus.",
                parameters: {
                  type: "object",
                  properties: {
                    ordered_concepts: {
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
                    changed: { type: "boolean" },
                    notes: { type: "string" },
                  },
                  required: ["ordered_concepts", "changed", "notes"],
                  additionalProperties: false,
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "verify_concept_order" } },
          }),
        });
        if (!r.ok) {
          if (r.status === 429 || r.status === 402) throw new Error(`AI_${r.status}`);
          throw new Error(`AI gateway error ${r.status}`);
        }
        const j = await r.json();
        console.log("[order LLM] usage:", JSON.stringify(j.usage || {}), "finish_reason:", j.choices?.[0]?.finish_reason);
        const tc = j.choices?.[0]?.message?.tool_calls?.[0];
        if (!tc?.function?.arguments) throw new Error("No order tool call");
        return JSON.parse(tc.function.arguments) as {
          ordered_concepts: { name: string; rationale: string }[];
          changed: boolean;
          notes: string;
        };
      };

      const inputSet = new Set(originalOrderForVerification.map((n) => n.toLowerCase()));
      let accepted = false;
      for (let attempt = 0; attempt < 2 && !accepted; attempt++) {
        try {
          const result = await callOrderLLM();
          const returned = Array.isArray(result?.ordered_concepts) ? result.ordered_concepts : [];
          if (returned.length !== originalOrderForVerification.length) {
            console.warn("[order LLM] length mismatch", returned.length, "vs", originalOrderForVerification.length);
            continue;
          }
          const remapped: string[] = [];
          const seen = new Set<string>();
          let ok = true;
          for (const item of returned) {
            const key = String(item?.name || "").trim().toLowerCase();
            if (!key || !inputSet.has(key) || seen.has(key)) { ok = false; break; }
            seen.add(key);
            const canonical = conceptNameLookup.get(key);
            if (!canonical) { ok = false; break; }
            remapped.push(canonical);
          }
          if (!ok || remapped.length !== originalOrderForVerification.length) {
            console.warn("[order LLM] shape mismatch — set differs from input");
            continue;
          }
          // Reorder concepts and weights in lockstep
          const weightByName = new Map<string, number>();
          orderedConceptNames.forEach((n, i) => weightByName.set(n, teacherWeights[i]));
          orderedConceptNames.length = 0;
          orderedConceptNames.push(...remapped);
          teacherWeights.length = 0;
          for (const n of remapped) teacherWeights.push(weightByName.get(n) ?? 0);

          orderVerification = {
            changed: !!result.changed,
            accepted: true,
            notes: typeof result.notes === "string" ? result.notes : "",
            originalOrder: originalOrderForVerification,
            newOrder: [...remapped],
          };
          accepted = true;
        } catch (e: any) {
          if (String(e?.message).startsWith("AI_")) {
            console.warn("[order LLM] AI error, falling back:", e.message);
            warnings.push("Order verification skipped (AI rate/credit error); kept teacher-approved order.");
            break;
          }
          console.error("[order LLM] attempt failed:", e);
        }
      }
      if (!accepted && !orderVerification.notes) {
        orderVerification.notes = "Order verification rejected (shape mismatch); kept original order.";
        warnings.push("Order verification rejected (shape mismatch); kept original order.");
      }
    }

    emit({ type: "phase", step: "estimate", message: "Estimating per-concept complexity…" });
    // ─── STEP 1: LLM call A — estimate per-concept mastery effort ───
    const conceptListBlock = orderedConceptNames
      .map((n, i) => `${i + 1}. ${n} (teacher_weight=${teacherWeights[i].toFixed(3)})`)
      .join("\n");

    const effortSystem = `You are a curriculum pacing expert. For each concept in the supplied ORDERED list, estimate how much teaching/learning effort an average undergraduate student needs to reach proficiency.

RULES:
- Return EXACTLY one entry per input concept.
- Use the concept "name" spelled EXACTLY as given.
- Maintain the same order (echo "index" 1..N).
- complexity: integer 1 (trivial) to 5 (very hard).
- estimated_sessions: number from 0.5 to 3.0 in steps of 0.5 (sessions of ${course.session_length_minutes || 60} min each).
- Do not add or drop concepts. Do not invent new ones.
- Calibrate estimated_sessions to an AVERAGE undergraduate student (not a top-quartile learner). Account for prerequisite chaining, cognitive load, and common misconceptions.
- Be conservative — under-estimating mastery time is the most common failure of generated plans. When in doubt, round up.
- Provide a brief, factual rationale grounded in the syllabus/lesson-plan signals; do not speculate beyond them.
Return ONLY via the provided tool.`;

    const effortUser = `COURSE: ${course.name} (${course.term})
Objectives: ${(course.objectives || []).join("; ") || "Not specified"}
Sessions/week: ${sessionsPerWeek}, Session length: ${course.session_length_minutes || 60} min.

CONCEPTS (ordered, with teacher-assigned weights 0–1):
${conceptListBlock}

SYLLABUS CONTEXT (pacing signals only):
${syllabusContext.slice(0, 6000) || "(none)"}

LESSON PLAN DOCS (pacing signals only):
${lessonPlanExcerpts.length > 0 ? lessonPlanExcerpts.join("\n\n").slice(0, 8000) : "(none)"}`;

    async function callEffortLLM() {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: 8192,
          seed: 42,
          reasoning: { effort: "low" },
          messages: [
            { role: "system", content: effortSystem },
            { role: "user", content: effortUser },
          ],
          tools: [{
            type: "function",
            function: {
              name: "estimate_concept_effort",
              description: "Per-concept complexity and estimated sessions to reach proficiency.",
              parameters: {
                type: "object",
                properties: {
                  concepts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "integer" },
                        name: { type: "string" },
                        complexity: { type: "integer", minimum: 1, maximum: 5 },
                        estimated_sessions: { type: "number" },
                        rationale: { type: "string" },
                      },
                      required: ["index", "name", "complexity", "estimated_sessions", "rationale"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["concepts"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "estimate_concept_effort" } },
        }),
      });
      if (!r.ok) {
        if (r.status === 429 || r.status === 402) throw new Error(`AI_${r.status}`);
        throw new Error(`AI gateway error ${r.status}`);
      }
      const j = await r.json();
      console.log("[effort LLM] usage:", JSON.stringify(j.usage || {}), "finish_reason:", j.choices?.[0]?.finish_reason);
      const tc = j.choices?.[0]?.message?.tool_calls?.[0];
      if (!tc?.function?.arguments) throw new Error("No effort tool call");
      return JSON.parse(tc.function.arguments).concepts as any[];
    }

    // Try once, retry on shape mismatch, then fall back to defaults for missing
    let effortByName = new Map<string, { complexity: number; estimated_sessions: number }>();
    // (warnings array declared earlier near step 0)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const arr = await callEffortLLM();
        effortByName = new Map();
        for (const e of arr || []) {
          const canonical = conceptNameLookup.get(String(e?.name || "").trim().toLowerCase());
          if (!canonical) continue;
          const cx = Math.max(1, Math.min(5, Math.round(Number(e.complexity) || 3)));
          let es = Number(e.estimated_sessions);
          if (!Number.isFinite(es)) es = 1;
          es = Math.max(0.5, Math.min(3, Math.round(es * 2) / 2));
          effortByName.set(canonical, { complexity: cx, estimated_sessions: es });
        }
        if (effortByName.size >= orderedConceptNames.length) break;
      } catch (e: any) {
        if (String(e?.message).startsWith("AI_")) {
          const code = e.message.split("_")[1];
          return new Response(
            JSON.stringify({
              error: code === "429"
                ? "Rate limit exceeded. Try again shortly."
                : "AI credits exhausted. Add funds in Settings > Workspace > Usage.",
            }),
            { status: Number(code), headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        console.error("effort LLM attempt failed:", e);
      }
    }
    // Fill defaults for any missing
    for (const name of orderedConceptNames) {
      if (!effortByName.has(name)) {
        effortByName.set(name, { complexity: 3, estimated_sessions: 1 });
        warnings.push(`Used default effort for: ${name}`);
      }
    }
    const estimatedSessions = orderedConceptNames.map((n) => effortByName.get(n)!.estimated_sessions);
    const complexityArr = orderedConceptNames.map((n) => effortByName.get(n)!.complexity);

    // ─── STEP 2: Deterministic allocator ───
    // Blend teacher_weight + estimated_sessions into a demand vector, allocate session slots.
    const ALPHA = 0.6;
    const sumWeights = teacherWeights.reduce((a, b) => a + b, 0);
    const sumSessions = estimatedSessions.reduce((a, b) => a + b, 0);
    const normWeights = teacherWeights.map((w) =>
      sumWeights > 0 ? w / sumWeights : 1 / orderedConceptNames.length,
    );
    const normSessions = estimatedSessions.map((s) =>
      sumSessions > 0 ? s / sumSessions : 1 / orderedConceptNames.length,
    );
    const demand = orderedConceptNames.map((_, i) =>
      ALPHA * normWeights[i] + (1 - ALPHA) * normSessions[i],
    );

    // Largest-remainder rounding ensuring slots_i >= 1 when capacity allows
    const N = orderedConceptNames.length;
    let slots: number[];
    if (N >= totalSessions) {
      slots = new Array(N).fill(1);
      warnings.push(
        `More concepts (${N}) than session slots (${totalSessions}); each concept gets 1 slot and weeks may pack multiple concepts per session.`,
      );
    } else {
      // Reserve 1 slot per concept, distribute the remainder by demand
      const remaining = totalSessions - N;
      const raw = demand.map((d) => d * remaining);
      const base = raw.map((r) => Math.floor(r));
      let allocated = base.reduce((a, b) => a + b, 0);
      const remainders = raw.map((r, i) => ({ i, frac: r - Math.floor(r) }))
        .sort((a, b) => b.frac - a.frac);
      let k = 0;
      while (allocated < remaining) {
        base[remainders[k % remainders.length].i] += 1;
        allocated += 1;
        k += 1;
      }
      slots = base.map((b) => b + 1);
    }

    // Pour concepts into teaching weeks left-to-right in approved order.
    type WeekAssign = { week: number; concept_names: string[]; slots_used: number; is_exam: boolean; exam_type: string | null };
    const weekAssign: WeekAssign[] = [];
    for (let w = 1; w <= totalWeeks; w++) {
      const isExam = examWeeks.has(w);
      const examType = w === midtermWeek ? "midterm" : w === finalWeek ? "final" : null;
      weekAssign.push({ week: w, concept_names: [], slots_used: 0, is_exam: isExam, exam_type: examType });
    }
    const teachingWeekIdxs = weekAssign
      .map((w, i) => (w.is_exam ? -1 : i))
      .filter((i) => i >= 0);

    const keyOf = (s: string) => s.trim().toLowerCase();
    const globalAssigned = new Set<string>(); // lowercased keys across all weeks
    const weekHas = (wIdx: number, name: string) =>
      weekAssign[wIdx].concept_names.some((n) => keyOf(n) === keyOf(name));

    let twPtr = 0; // index into teachingWeekIdxs
    let weekRemaining = sessionsPerWeek;
    for (let ci = 0; ci < N; ci++) {
      let need = slots[ci];
      const name = orderedConceptNames[ci];
      const k = keyOf(name);
      while (need > 0 && twPtr < teachingWeekIdxs.length) {
        const wIdx = teachingWeekIdxs[twPtr];
        if (weekRemaining <= 0) {
          twPtr += 1;
          weekRemaining = sessionsPerWeek;
          continue;
        }
        const take = Math.min(need, weekRemaining);
        // Add concept name only if not already present anywhere (cross-week dedup)
        if (!globalAssigned.has(k) && !weekHas(wIdx, name)) {
          weekAssign[wIdx].concept_names.push(name);
          globalAssigned.add(k);
        }
        weekAssign[wIdx].slots_used += take;
        weekRemaining -= take;
        need -= take;
        if (weekRemaining <= 0) {
          twPtr += 1;
          weekRemaining = sessionsPerWeek;
        }
      }
      // Overflow: if concept still hasn't been placed anywhere, pick the
      // teaching week with the lowest slots_used that doesn't already contain it.
      if (need > 0 && !globalAssigned.has(k) && teachingWeekIdxs.length > 0) {
        const candidates = teachingWeekIdxs
          .filter((i) => !weekHas(i, name))
          .sort((a, b) => weekAssign[a].slots_used - weekAssign[b].slots_used);
        if (candidates.length > 0) {
          const target = candidates[0];
          weekAssign[target].concept_names.push(name);
          weekAssign[target].slots_used += need;
          globalAssigned.add(k);
          warnings.push(`Overflow: ${name} placed in Week ${weekAssign[target].week} (lightest load).`);
        } else {
          warnings.push(`Overflow: could not place ${name} (no eligible week).`);
        }
      }
    }

    // ─── STEP 3: LLM call B — author week metadata for the locked assignment ───
    const assignmentBlock = weekAssign.map((w) => {
      if (w.is_exam) return `Week ${w.week}: ${w.exam_type === "midterm" ? "MIDTERM" : "FINAL"} EXAM (no concepts)`;
      return `Week ${w.week}: ${w.concept_names.length > 0 ? w.concept_names.join(", ") : "(no concepts assigned)"}`;
    }).join("\n");

    const authorSystem = `You author readable week-level metadata for a fixed lesson-plan distribution.

You will be given EXACTLY ${totalWeeks} weeks with their assigned concepts already locked. Your job is ONLY to write:
- week_name (3–6 word title) for each non-exam week
- overview (3–5 sentences) for each non-exam week, grounded strictly in the assigned concepts. Cover: (1) what the average student will be able to do by the end of the week, (2) how it builds on prior weeks, (3) the most common misconception or stumbling block to watch for.
- 1 coding-exercise + 1–2 article resources per non-exam week, tied to those concepts. Articles must be REAL, well-known, freely accessible (e.g. official Python docs, Real Python, MDN, official framework docs) with working https URLs. If you are not certain a URL exists, OMIT the url field rather than inventing one.
- one short paragraph (3–5 sentences) of overall course learning outcomes, calibrated to an average undergraduate.

Tone: factual, pedagogical, realistic. Do not over-promise mastery. Avoid repetitive phrasing across weeks.

For exam weeks: week_name="" and overview="Exam week — review prior content." and resources=[].
You CANNOT change which concepts go in which week. Output exactly ${totalWeeks} week entries with the same week numbers.
Each concept name appears in exactly one week. Do not echo or rehash concept names from other weeks inside this week's overview text.

Return ONLY via the provided tool.`;

    const authorUser = `COURSE: ${course.name} (${course.term})
Objectives: ${(course.objectives || []).join("; ") || "Not specified"}

LOCKED WEEK ASSIGNMENT:
${assignmentBlock}`;

    const authorResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        temperature: 0.5,
        top_p: 0.9,
        max_tokens: 16384,
        seed: 42,
        frequency_penalty: 0.2,
        presence_penalty: 0.1,
        reasoning: { effort: "low" },
        messages: [
          { role: "system", content: authorSystem },
          { role: "user", content: authorUser },
        ],
        tools: [{
          type: "function",
          function: {
            name: "author_weeks",
            description: "Author week titles, overviews, and resources for the locked lesson-plan assignment.",
            parameters: {
              type: "object",
              properties: {
                weeks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      week: { type: "integer" },
                      week_name: { type: "string" },
                      overview: { type: "string" },
                      resources: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            type: { type: "string", enum: ["coding-exercise", "article"] },
                            title: { type: "string" },
                            description: { type: "string" },
                            url: { type: "string" },
                            ai_suggested: { type: "boolean" },
                          },
                          required: ["type", "title", "description", "ai_suggested"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["week", "week_name", "overview", "resources"],
                    additionalProperties: false,
                  },
                },
                overall_course_learning_outcomes: { type: "string" },
              },
              required: ["weeks", "overall_course_learning_outcomes"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "author_weeks" } },
      }),
    });

    if (!authorResp.ok) {
      if (authorResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (authorResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await authorResp.text();
      console.error("author AI error:", authorResp.status, errText);
      throw new Error(`AI gateway error ${authorResp.status}`);
    }

    const authorData = await authorResp.json();
    console.log("[author LLM] usage:", JSON.stringify(authorData.usage || {}), "finish_reason:", authorData.choices?.[0]?.finish_reason);
    const authorTC = authorData.choices?.[0]?.message?.tool_calls?.[0];
    if (!authorTC?.function?.arguments) throw new Error("AI did not return week authoring");
    const authored = JSON.parse(authorTC.function.arguments);
    const overallOutcomes: string = typeof authored.overall_course_learning_outcomes === "string"
      ? authored.overall_course_learning_outcomes.trim() : "";
    const authoredByWeek = new Map<number, any>();
    for (const w of (authored.weeks || [])) {
      const n = Number(w?.week);
      if (Number.isFinite(n)) authoredByWeek.set(n, w);
    }

    const capResources = (resources: any[]) => {
      if (!Array.isArray(resources)) return [];
      const exercises = resources.filter((r) => r?.type === "coding-exercise").slice(0, 1);
      const articles = resources.filter((r) => r?.type === "article").slice(0, 2);
      return [...exercises, ...articles];
    };

    // ─── STEP 4: Merge locked assignment + authored metadata, validate, persist ───
    const normalized: any[] = [];
    for (const wa of weekAssign) {
      const a = authoredByWeek.get(wa.week) || {};
      if (wa.is_exam) {
        normalized.push({
          week: wa.week,
          week_name: wa.exam_type === "midterm" ? "Midterm Exam" : wa.exam_type === "final" ? "Final Exam" : "Exam Week",
          overview: "Exam week — review prior content.",
          is_exam_week: true,
          exam_type: wa.exam_type,
          concepts: [],
          resources: [],
        });
        continue;
      }
      normalized.push({
        week: wa.week,
        week_name: typeof a.week_name === "string" && a.week_name.trim() ? a.week_name.trim() : `Week ${wa.week}`,
        overview: typeof a.overview === "string" ? a.overview : "",
        is_exam_week: false,
        exam_type: null,
        concepts: wa.concept_names.map((name) => ({ name, brief_description: "", ai_suggested: false })),
        resources: capResources(a.resources),
      });
    }

    // ─── Validator: enforce uniqueness + full coverage ───
    const keyOf2 = (s: string) => s.trim().toLowerCase();
    const canonicalByKey = new Map<string, string>();
    for (const n of orderedConceptNames) canonicalByKey.set(keyOf2(n), n);

    const duplicateConceptsRemoved: string[] = [];
    const seenGlobal = new Map<string, number>(); // key -> first week number
    for (const w of normalized) {
      if (w.is_exam_week) continue;
      const seenInWeek = new Set<string>();
      const kept: any[] = [];
      for (const c of w.concepts) {
        const k = keyOf2(c.name);
        if (!k) continue;
        if (seenInWeek.has(k)) {
          duplicateConceptsRemoved.push(`${c.name} (Week ${w.week} intra-week dup)`);
          continue;
        }
        if (seenGlobal.has(k)) {
          duplicateConceptsRemoved.push(`${c.name} (Week ${w.week}; already in Week ${seenGlobal.get(k)})`);
          continue;
        }
        // canonicalize spelling
        const canonical = canonicalByKey.get(k) || c.name;
        kept.push({ ...c, name: canonical });
        seenInWeek.add(k);
        seenGlobal.set(k, w.week);
      }
      w.concepts = kept;
    }

    const repairedMissingConcepts: string[] = [];
    const missing = orderedConceptNames.filter((n) => !seenGlobal.has(keyOf2(n)));
    for (const name of missing) {
      // pick teaching week with fewest concepts; ties → earliest
      const candidates = normalized
        .map((w, i) => ({ w, i }))
        .filter(({ w }) => !w.is_exam_week);
      if (candidates.length === 0) break;
      candidates.sort((a, b) => a.w.concepts.length - b.w.concepts.length || a.w.week - b.w.week);
      const target = candidates[0].w;
      target.concepts.push({ name, brief_description: "", ai_suggested: false });
      seenGlobal.set(keyOf2(name), target.week);
      repairedMissingConcepts.push(`${name} → Week ${target.week}`);
    }

    const finalSet = new Set<string>();
    let dupAfter = false;
    for (const w of normalized) {
      for (const c of w.concepts) {
        const k = keyOf2(c.name);
        if (finalSet.has(k)) dupAfter = true;
        finalSet.add(k);
      }
    }
    const allCovered = orderedConceptNames.every((n) => finalSet.has(keyOf2(n)));
    const invariantsHeld = !dupAfter && allCovered;
    if (!invariantsHeld) {
      warnings.push(`Invariant check failed (covered=${allCovered}, no_dups=${!dupAfter}).`);
    }
    if (duplicateConceptsRemoved.length) {
      warnings.push(`Removed ${duplicateConceptsRemoved.length} duplicate concept(s).`);
    }
    if (repairedMissingConcepts.length) {
      warnings.push(`Repaired ${repairedMissingConcepts.length} missing concept(s).`);
    }

    const unassigned = orderedConceptNames.filter((n) => !finalSet.has(keyOf2(n)));

    // NOTE: We intentionally do NOT modify the concepts table here.
    // The Concept Review step is the sole source of truth for concepts.

    return new Response(
      JSON.stringify({
        weeks: normalized,
        overall_course_learning_outcomes: overallOutcomes,
        meta: {
          totalWeeks,
          midtermWeek,
          finalWeek,
          teachingWeeksCount,
          sessionsPerWeek,
          totalSessions,
          approvedConceptsCount: orderedConceptNames.length,
          unassignedConcepts: unassigned,
          duplicateConceptsRemoved,
          repairedMissingConcepts,
          invariantsHeld,
          warnings,
          orderVerification,
          allocation: orderedConceptNames.map((name, i) => ({
            name,
            teacher_weight: teacherWeights[i],
            complexity: complexityArr[i],
            estimated_sessions: estimatedSessions[i],
            allocated_slots: slots[i],
          })),
          syllabusFilesUsed: syllabusFiles.length,
          lessonPlanFilesUsed: lessonPlanFiles.length,
          materialFilesAvailable: materialFiles.length,
          syllabusContextLoaded: !!syllabusContext,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("generate-lesson-plan error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
