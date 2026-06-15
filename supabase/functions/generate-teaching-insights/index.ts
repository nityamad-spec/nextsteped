import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const MODEL = "google/gemini-3-flash-preview";

type Band = "beginner" | "developing" | "proficient" | "expert";
function bandFor(score: number): Band {
  if (score < 0.25) return "beginner";
  if (score < 0.5) return "developing";
  if (score < 0.75) return "proficient";
  return "expert";
}
function levelFromAvg(avg: number): Band {
  return bandFor(avg);
}

async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `You generate concise, actionable teaching insights for a professor, grounded in real aggregate data about how their class is performing. A professor reads these to decide where to focus teaching time. Never produce generic advice that could have been written without the data.

INPUTS (all data is class-level aggregate; you do NOT have individual student records)

1. Concept mastery distribution (PER CONCEPT, COUNTS OF STUDENTS) — for each concept, the number of students at each of four mastery levels: beginner, developing, proficient, expert: {{CLASS_CONCEPT_MASTERY}}
   Read each concept by the SHAPE of its distribution: skewed to beginner/developing = weak; skewed to proficient/expert = strong; wide spread = the class is split. Concepts with few or zero counted students indicate low engagement.

2. Diagnostic result (CLASS-LEVEL, NOT per concept) — the class's initial diagnostic average and overall learned level: {{DIAGNOSTIC_PERFORMANCE}}

3. Weekly quiz performance (CLASS-LEVEL, NOT per concept) — chronological list of class quiz averages and derived levels: {{QUIZ_PERFORMANCE}}

USING EACH INPUT CORRECTLY
- Concept-specific insights (about a named concept) must come from input 1. Only this input knows which concepts are strong or weak.
- Inputs 2 and 3 are CLASS-WIDE only. Do NOT attribute a diagnostic or quiz score to a specific concept — that breakdown does not exist. Use them to judge the class's overall trajectory: compare the diagnostic level against the latest quiz level to see whether the class is improving, holding, or regressing overall, and compare quiz scores over time if more than one is given.
- Never claim a concept-level trend from the quizzes (e.g. "quiz performance on Functions dropped"); the quiz data is not concept-tagged.

HOW MANY INSIGHTS
- Generate AT MOST 4 insights. Fewer is correct when the data supports fewer.
- If there is NO usable data (inputs empty, or no students assessed and no quiz taken), return ZERO insights — an empty array. Never pad.
- Only produce an insight that rests on a real signal.

INSIGHT TYPES
- WEAK SPOT (per concept, from input 1): a concept skewed to beginner/developing — flag for a targeted session or extra time.
- STRENGTH (per concept, from input 1): a concept skewed to proficient/expert that can scaffold harder material.
- SPLIT CLASS (per concept, from input 1): a concept with a wide spread across levels — suggest differentiated or paired approaches.
- OVERALL TREND (class-wide, from inputs 2 and 3): the class improving, holding, or regressing from diagnostic to latest quiz — frame as overall momentum, not tied to one concept.

Do NOT produce "students who learned X also learned Y" correlations; you have only per-concept counts, not per-student data.

GROUNDING RULES — STRICT
- Every insight MUST cite a specific signal: a beginner-heavy distribution, a proficient/expert majority, a wide spread, or an overall diagnostic-to-quiz change. Use concept names exactly as given.
- Do NOT invent numbers, concepts, or patterns absent from the inputs.
- Lead with the highest-impact insight; a beginner-heavy concept outranks a minor observation.

TONE AND FORMAT
- Address the professor directly. One sentence per insight, two at most, naming the concept(s) where applicable and a concrete action.
- Be specific about the action ("dedicate a lab session to X", "use X to scaffold Y"), not vague.
- Factual and supportive, never alarmist.
- Translate data into a recommendation; reference signals qualitatively ("most students still at beginner level", "class average rose from developing to proficient since the diagnostic") rather than listing raw counts.

OUTPUT
Return strict JSON, one key "insights", an array of 0 to 4 objects, each with:
- "text": the insight shown to the professor (1–2 sentences).
- "concepts": array of concept name(s) it concerns, exactly as in input 1; empty array for a class-wide overall-trend insight.
- "type": one of "weak_spot", "strength", "split_class", "overall_trend".
- "basis": a brief phrase naming the signal (e.g. "32 of 48 at beginner on Functions", "class level rose developing→proficient since diagnostic"). For internal traceability.

Output only the JSON. No prose, no markdown fences.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonResp({ error: "LOVABLE_API_KEY is not configured" }, 500);

    // Authn
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return jsonResp({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonResp({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const courseId: string | undefined = body?.course_id;
    const forceRefresh: boolean = !!body?.force_refresh;
    if (!courseId || typeof courseId !== "string") {
      return jsonResp({ error: "course_id is required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Authz: course membership
    const { data: isMember, error: memErr } = await admin.rpc("is_course_member", {
      _course_id: courseId,
      _user_id: userId,
    });
    if (memErr) return jsonResp({ error: memErr.message }, 500);
    if (!isMember) return jsonResp({ error: "Forbidden" }, 403);

    // Load course
    const { data: course } = await admin
      .from("courses")
      .select("id, name, start_date, total_weeks")
      .eq("id", courseId)
      .maybeSingle();
    if (!course) return jsonResp({ error: "Course not found" }, 404);

    const totalWeeks = (course.total_weeks as number | null) ?? 16;
    const currentWeek = course.start_date
      ? Math.max(
          1,
          Math.min(
            totalWeeks,
            Math.floor(
              (Date.now() - new Date(course.start_date as string).getTime()) /
                (7 * 24 * 60 * 60 * 1000),
            ) + 1,
          ),
        )
      : 1;

    // Concepts (use concept_code as the human-facing "concept name" passed to the model)
    const { data: concepts } = await admin
      .from("concepts")
      .select("id, concept_code, weight")
      .eq("course_id", courseId);
    const conceptList = concepts ?? [];
    const conceptById = new Map(conceptList.map((c: any) => [c.id, c]));
    const validNames = new Set(conceptList.map((c: any) => c.concept_code as string));

    // Per-concept mastery distribution
    const { data: masteryRows } = await admin
      .from("student_concept_mastery")
      .select("concept_id, student_id, mastery_score")
      .eq("course_id", courseId);
    const perConcept = new Map<string, { beginner: number; developing: number; proficient: number; expert: number }>();
    const studentIds = new Set<string>();
    for (const r of masteryRows ?? []) {
      const c: any = conceptById.get((r as any).concept_id);
      if (!c) continue;
      const name = c.concept_code as string;
      const cur = perConcept.get(name) ?? { beginner: 0, developing: 0, proficient: 0, expert: 0 };
      cur[bandFor(Number((r as any).mastery_score) || 0)]++;
      perConcept.set(name, cur);
      studentIds.add((r as any).student_id);
    }
    const CLASS_CONCEPT_MASTERY = conceptList.map((c: any) => {
      const d = perConcept.get(c.concept_code) ?? { beginner: 0, developing: 0, proficient: 0, expert: 0 };
      return { concept: c.concept_code, ...d };
    });

    // Diagnostic — class average + level
    const { data: diagRows } = await admin
      .from("diagnostic_results")
      .select("score, total_questions, learner_level, mastery_score")
      .eq("course_id", courseId);
    let DIAGNOSTIC_PERFORMANCE: any = { taken_by: 0 };
    if (diagRows && diagRows.length > 0) {
      const avgPct = diagRows.reduce((s, r: any) => s + (r.total_questions ? r.score / r.total_questions : 0), 0) / diagRows.length;
      const avgMastery = diagRows.reduce((s, r: any) => s + (Number(r.mastery_score) || (r.total_questions ? r.score / r.total_questions : 0)), 0) / diagRows.length;
      const levelCounts: Record<Band, number> = { beginner: 0, developing: 0, proficient: 0, expert: 0 };
      for (const r of diagRows as any[]) {
        const lvl = (r.learner_level as Band) ?? bandFor(Number(r.mastery_score) || 0);
        if (lvl in levelCounts) levelCounts[lvl]++;
      }
      DIAGNOSTIC_PERFORMANCE = {
        taken_by: diagRows.length,
        average_score_pct: Math.round(avgPct * 100),
        class_level: levelFromAvg(avgMastery),
        level_distribution: levelCounts,
      };
    }

    // Weekly quizzes — chronological class averages
    const { data: quizRows } = await admin
      .from("assessment_results")
      .select("mode, quiz_day, score, total_questions, mastery_score, learner_level, created_at")
      .eq("course_id", courseId)
      .eq("mode", "weekly_quiz")
      .order("created_at", { ascending: true });
    const quizzesByDay = new Map<number | string, { scores: number[]; mastery: number[]; first_at: string }>();
    for (const r of quizRows ?? []) {
      const key = (r as any).quiz_day ?? new Date((r as any).created_at).toISOString().slice(0, 10);
      const cur = quizzesByDay.get(key) ?? { scores: [], mastery: [], first_at: (r as any).created_at };
      const pct = (r as any).total_questions ? (r as any).score / (r as any).total_questions : 0;
      cur.scores.push(pct);
      cur.mastery.push(Number((r as any).mastery_score) || pct);
      quizzesByDay.set(key, cur);
    }
    const QUIZ_PERFORMANCE = [...quizzesByDay.entries()]
      .sort((a, b) => new Date(a[1].first_at).getTime() - new Date(b[1].first_at).getTime())
      .map(([key, v]) => {
        const avgPct = v.scores.reduce((s, x) => s + x, 0) / v.scores.length;
        const avgMast = v.mastery.reduce((s, x) => s + x, 0) / v.mastery.length;
        return {
          quiz: typeof key === "number" ? `Week ${key}` : String(key),
          taken_by: v.scores.length,
          average_score_pct: Math.round(avgPct * 100),
          class_level: levelFromAvg(avgMast),
        };
      });

    const summary = {
      course_name: course.name,
      current_week: currentWeek,
      total_weeks: totalWeeks,
      engaged_students: studentIds.size,
      CLASS_CONCEPT_MASTERY,
      DIAGNOSTIC_PERFORMANCE,
      QUIZ_PERFORMANCE,
    };

    // Empty case: no mastery, no diagnostic, no quiz → no AI call
    const noData =
      CLASS_CONCEPT_MASTERY.every((c) => c.beginner + c.developing + c.proficient + c.expert === 0) &&
      (DIAGNOSTIC_PERFORMANCE?.taken_by ?? 0) === 0 &&
      QUIZ_PERFORMANCE.length === 0;
    if (noData) {
      return jsonResp({ insights: [], cached: false, generated_at: null, empty: true });
    }

    const inputsHash = await sha256Hex(JSON.stringify(summary) + "|" + MODEL);

    // Cache lookup
    const { data: cached } = await admin
      .from("course_teaching_insights")
      .select("insights, inputs_hash, generated_at, model")
      .eq("course_id", courseId)
      .maybeSingle();

    if (
      !forceRefresh &&
      cached &&
      cached.inputs_hash === inputsHash &&
      Date.now() - new Date(cached.generated_at as string).getTime() < CACHE_TTL_MS
    ) {
      return jsonResp({
        insights: cached.insights,
        cached: true,
        generated_at: cached.generated_at,
      });
    }

    // Inject placeholders
    const systemPrompt = SYSTEM_PROMPT
      .replace("{{CLASS_CONCEPT_MASTERY}}", JSON.stringify(CLASS_CONCEPT_MASTERY))
      .replace("{{DIAGNOSTIC_PERFORMANCE}}", JSON.stringify(DIAGNOSTIC_PERFORMANCE))
      .replace("{{QUIZ_PERFORMANCE}}", JSON.stringify(QUIZ_PERFORMANCE));

    const userPrompt = `Course: ${course.name}. Current week: ${currentWeek} of ${totalWeeks}. Engaged students: ${studentIds.size}. Generate the insights now.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(300_000),
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return jsonResp({ error: "Rate limit exceeded. Please try again in a moment.", cached_fallback: cached?.insights ?? null }, 429);
      }
      if (aiRes.status === 402) {
        return jsonResp({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage.", cached_fallback: cached?.insights ?? null }, 402);
      }
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      return jsonResp({ error: `AI gateway error: ${aiRes.status}`, cached_fallback: cached?.insights ?? null }, 500);
    }

    const aiJson = await aiRes.json();
    const content: string = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : content);
    } catch (e) {
      console.error("JSON parse failed:", e, content);
      return jsonResp({ error: "Model returned invalid JSON", cached_fallback: cached?.insights ?? null }, 502);
    }

    const allowedTypes = new Set(["weak_spot", "strength", "split_class", "overall_trend"]);
    const rawInsights: any[] = Array.isArray(parsed?.insights) ? parsed.insights : [];
    const insights = rawInsights
      .slice(0, 4)
      .map((it) => ({
        text: typeof it?.text === "string" ? it.text.trim() : "",
        concepts: Array.isArray(it?.concepts)
          ? it.concepts.map((x: any) => String(x)).filter((n: string) => validNames.has(n))
          : [],
        type: allowedTypes.has(it?.type) ? it.type : "weak_spot",
        basis: typeof it?.basis === "string" ? it.basis.trim() : "",
      }))
      .filter((it) => it.text.length > 0);

    const nowIso = new Date().toISOString();
    const { error: upsertErr } = await admin
      .from("course_teaching_insights")
      .upsert({
        course_id: courseId,
        insights,
        inputs_hash: inputsHash,
        model: MODEL,
        generated_at: nowIso,
        generated_by: userId,
      });
    if (upsertErr) console.error("Insights upsert failed:", upsertErr);

    return jsonResp({ insights, cached: false, generated_at: nowIso });
  } catch (e) {
    console.error("generate-teaching-insights error:", e);
    return jsonResp({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
