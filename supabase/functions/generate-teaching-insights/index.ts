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

    // Concepts
    const { data: concepts } = await admin
      .from("concepts")
      .select("id, concept_code, weight")
      .eq("course_id", courseId);
    const conceptList = concepts ?? [];
    const conceptById = new Map(conceptList.map((c: any) => [c.id, c]));
    const validCodes = new Set(conceptList.map((c: any) => c.concept_code));

    // Lesson plan -> visible-by-date concept codes
    const { data: weeks } = await admin
      .from("lesson_plan_weeks")
      .select("week_number, concepts")
      .eq("course_id", courseId)
      .order("week_number", { ascending: true });
    const visibleCodes = new Set<string>();
    for (const w of weeks ?? []) {
      if ((w.week_number as number) > currentWeek) continue;
      const list = Array.isArray((w as any).concepts) ? (w as any).concepts : [];
      for (const c of list) {
        const name = typeof c?.name === "string" ? c.name.trim() : "";
        if (name) visibleCodes.add(name);
      }
    }

    // Mastery rows
    const { data: masteryRows } = await admin
      .from("student_concept_mastery")
      .select("concept_id, student_id, mastery_score")
      .eq("course_id", courseId);

    // Enrollment
    const { count: enrolledCount } = await admin
      .from("enrollments")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);

    // Aggregate per concept
    const perConcept = new Map<
      string,
      { code: string; n: number; sum: number; beginner: number; developing: number; proficient: number; expert: number }
    >();
    const studentIds = new Set<string>();
    for (const r of masteryRows ?? []) {
      const c: any = conceptById.get((r as any).concept_id);
      if (!c) continue;
      const code = c.concept_code as string;
      const score = Number((r as any).mastery_score) || 0;
      const cur = perConcept.get(code) ?? {
        code, n: 0, sum: 0, beginner: 0, developing: 0, proficient: 0, expert: 0,
      };
      cur.n++;
      cur.sum += score;
      cur[bandFor(score)]++;
      perConcept.set(code, cur);
      studentIds.add((r as any).student_id);
    }

    const conceptStats = conceptList.map((c: any) => {
      const agg = perConcept.get(c.concept_code);
      return {
        concept_code: c.concept_code,
        weight: Number(c.weight) || 0,
        in_scope: visibleCodes.has(c.concept_code),
        n_students: agg?.n ?? 0,
        avg_score: agg && agg.n ? Number((agg.sum / agg.n).toFixed(3)) : null,
        beginner: agg?.beginner ?? 0,
        developing: agg?.developing ?? 0,
        proficient: agg?.proficient ?? 0,
        expert: agg?.expert ?? 0,
      };
    });

    const summary = {
      course_name: course.name,
      current_week: currentWeek,
      total_weeks: totalWeeks,
      enrolled_students: enrolledCount ?? 0,
      engaged_students: studentIds.size,
      concepts: conceptStats,
    };

    // Empty case: don't burn AI credits
    if (studentIds.size === 0) {
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

    // Call AI gateway
    const systemPrompt = `You are a pedagogy coach for a 16-week university Intro to Python course. Produce 3 to 5 short, actionable teaching insights grounded ONLY in the supplied stats. Reference concepts by their concept_code exactly as given. Never invent numbers, never name individual students. Each insight must be one or two sentences, plain prose (no markdown), and recommend a concrete teaching action when severity is "warn" or "action".

Return ONLY valid JSON of the form:
{"insights":[{"concept_code": string|null, "severity":"info"|"warn"|"action", "text": string}, ...]}
No prose outside the JSON. 3 to 5 items.`;

    const userPrompt = `Course stats (anonymized, aggregated):\n${JSON.stringify(summary)}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
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
        return jsonResp(
          { error: "Rate limit exceeded. Please try again in a moment.", cached_fallback: cached?.insights ?? null },
          429,
        );
      }
      if (aiRes.status === 402) {
        return jsonResp(
          { error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage.", cached_fallback: cached?.insights ?? null },
          402,
        );
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

    const rawInsights: any[] = Array.isArray(parsed?.insights) ? parsed.insights : [];
    const insights = rawInsights
      .slice(0, 5)
      .map((it) => ({
        concept_code:
          it?.concept_code && validCodes.has(String(it.concept_code)) ? String(it.concept_code) : null,
        severity: ["info", "warn", "action"].includes(it?.severity) ? it.severity : "info",
        text: typeof it?.text === "string" ? it.text.trim() : "",
      }))
      .filter((it) => it.text.length > 0);

    if (insights.length === 0) {
      return jsonResp({ error: "Model returned no usable insights", cached_fallback: cached?.insights ?? null }, 502);
    }

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
