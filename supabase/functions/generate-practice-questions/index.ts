import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clamp01 = (n: unknown): number => {
  const x = typeof n === "number" ? n : parseFloat(String(n));
  if (!isFinite(x)) return 0.5;
  return Math.min(1, Math.max(0, x));
};
const clampBloom = (n: unknown): number => {
  const x = typeof n === "number" ? n : parseFloat(String(n));
  if (!isFinite(x)) return 3;
  return Math.min(6, Math.max(1, Math.round(x)));
};
const clampCount = (n: unknown): number => {
  const x = typeof n === "number" ? n : parseFloat(String(n));
  if (!isFinite(x)) return 5;
  return Math.min(10, Math.max(1, Math.round(x)));
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_TYPES = ["mcq", "true_false"] as const;
type QType = (typeof ALLOWED_TYPES)[number];
const ALLOWED_DIFFICULTY = ["easy", "medium", "hard", "mixed"] as const;
type Difficulty = (typeof ALLOWED_DIFFICULTY)[number];
const ALLOWED_GOALS = ["review", "challenge", "exam_prep", "general_practice"] as const;
type Goal = (typeof ALLOWED_GOALS)[number];

interface Intent {
  count: number;
  types: QType[];
  difficulty: Difficulty;
  bloom_focus: number[];
  concepts: string[];
  weak_areas_requested: boolean;
  goal: Goal;
  notes: string;
}

const DEFAULT_INTENT: Intent = {
  count: 5,
  types: ["mcq", "true_false"],
  difficulty: "mixed",
  bloom_focus: [2, 3, 4],
  concepts: [],
  weak_areas_requested: false,
  goal: "general_practice",
  notes: "",
};

const SYSTEM_PROMPT_INTENT = `You are an intent parser for a student practice-question request. Read the student's message and return a JSON object describing what they want.

Output JSON schema (no prose, no markdown):
{
  "count": integer 1..10,
  "types": array, subset of ["mcq","true_false"], non-empty,
  "difficulty": "easy" | "medium" | "hard" | "mixed",
  "bloom_focus": array of integers in 1..6 (Bloom levels to emphasize),
  "concepts": array of concept codes from the provided list (may be empty),
  "weak_areas_requested": boolean (true if student asks to focus on weak/struggling/unclear topics),
  "goal": "review" | "challenge" | "exam_prep" | "general_practice",
  "notes": short free-text restating the request in <=140 chars
}

Fallback rules when the student is silent or vague:
- count: default 5
- types: default ["mcq","true_false"]
- difficulty: default "mixed"
- bloom_focus: default [2,3,4]
- concepts: []  (Stage 2 will pick from mastery)
- weak_areas_requested: false unless clearly implied
- goal: "general_practice"

Never invent concept codes that are not in the provided list. Never include "short_answer" or any other question type. Clamp count to 1..10.`;

const SYSTEM_PROMPT_GENERATE = `You are a practice-question generator for a university course. You will be given (a) a parsed INTENT describing what the student asked for and (b) a MASTERY SNAPSHOT for the student across course concepts. Generate practice questions that match the intent and target the student's current level.

Rules:
- Generate exactly INTENT.count questions.
- Only use question types in INTENT.types (subset of {"mcq","true_false"}). Never produce short_answer, fill-in-the-blank, or code questions.
- Distribute questions across INTENT.concepts (or the provided MASTERY SNAPSHOT concepts if INTENT.concepts is empty), favoring concepts with lower mastery_score when INTENT.weak_areas_requested or INTENT.goal == "exam_prep".
- Calibrate difficulty_estimate (0..1):
  * INTENT.difficulty == "easy"   -> target 0.15..0.35
  * INTENT.difficulty == "medium" -> target 0.40..0.60
  * INTENT.difficulty == "hard"   -> target 0.65..0.90
  * INTENT.difficulty == "mixed"  -> spread across the range, anchored to the student's course mastery_score (lower mastery -> easier center).
- bloom_level (1..6) should bias toward INTENT.bloom_focus, with most items at 2..4 unless INTENT.goal == "challenge".
- For each MCQ: 4 plausible options, exactly one correct, answer must match one option string exactly.
- For each True/False: answer must be "True" or "False".
- Explanations must be 1-3 sentences and reference the concept.
- Set "topic" to the matching concept code from the snapshot.

Return ONLY JSON of the form {"questions":[...]} where each item has: question, type, options?, answer, explanation, topic, difficulty_estimate, bloom_level.`;

async function callGateway(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
): Promise<{ ok: true; content: string } | { ok: false; status: number; error: string }> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages,
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("AI gateway error:", resp.status, txt.slice(0, 300));
    if (resp.status === 429) return { ok: false, status: 429, error: "Rate limit exceeded. Please try again in a moment." };
    if (resp.status === 402) return { ok: false, status: 402, error: "AI usage limit reached. Please add credits to continue." };
    return { ok: false, status: 502, error: "AI service unavailable. Please try again." };
  }
  const j = await resp.json();
  return { ok: true, content: j?.choices?.[0]?.message?.content ?? "" };
}

function parseJsonLoose(content: string): any {
  try {
    return JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function sanitizeIntent(raw: any, knownConcepts: Set<string>): Intent {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_INTENT };
  const types = Array.isArray(raw.types)
    ? (raw.types.filter((t: any) => ALLOWED_TYPES.includes(t)) as QType[])
    : [];
  const difficulty: Difficulty = ALLOWED_DIFFICULTY.includes(raw.difficulty)
    ? raw.difficulty
    : "mixed";
  const goal: Goal = ALLOWED_GOALS.includes(raw.goal) ? raw.goal : "general_practice";
  const bloomFocus = Array.isArray(raw.bloom_focus)
    ? Array.from(
        new Set(
          raw.bloom_focus
            .map((b: any) => clampBloom(b))
            .filter((b: number) => Number.isInteger(b)),
        ),
      )
    : [];
  const concepts = Array.isArray(raw.concepts)
    ? Array.from(new Set(raw.concepts.map((c: any) => String(c)).filter((c: string) => knownConcepts.has(c))))
    : [];
  return {
    count: clampCount(raw.count),
    types: types.length > 0 ? types : ["mcq", "true_false"],
    difficulty,
    bloom_focus: bloomFocus.length > 0 ? bloomFocus : [2, 3, 4],
    concepts,
    weak_areas_requested: Boolean(raw.weak_areas_requested),
    goal,
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 140) : "",
  };
}

type ConceptRow = { concept_code: string; weight: number | null };
type MasteryRow = {
  concept_code: string | null;
  mastery_score: number | null;
  mastery_level: string | null;
  sample_count: number | null;
};

interface SnapshotConcept {
  code: string;
  weight: number;
  mastery_score: number | null;
  mastery_level: string | null;
  sample_count: number;
}

function selectConcepts(
  intent: Intent,
  concepts: ConceptRow[],
  masteryByCode: Map<string, MasteryRow>,
): SnapshotConcept[] {
  const all: SnapshotConcept[] = concepts.map((c) => {
    const m = masteryByCode.get(c.concept_code);
    return {
      code: c.concept_code,
      weight: Number(c.weight ?? 0),
      mastery_score: m?.mastery_score != null ? Number(m.mastery_score) : null,
      mastery_level: m?.mastery_level ?? null,
      sample_count: m?.sample_count ?? 0,
    };
  });

  if (intent.concepts.length > 0) {
    const set = new Set(intent.concepts);
    const picked = all.filter((c) => set.has(c.code));
    return picked.length > 0 ? picked : all.slice(0, Math.max(3, intent.count));
  }

  const targetSize = Math.max(3, intent.count);
  if (intent.weak_areas_requested || intent.goal === "exam_prep") {
    return [...all]
      .sort((a, b) => {
        const ams = a.mastery_score ?? 1.01; // unassessed -> deprioritized
        const bms = b.mastery_score ?? 1.01;
        if (ams !== bms) return ams - bms;
        return (b.weight ?? 0) - (a.weight ?? 0);
      })
      .slice(0, targetSize);
  }

  // Default: weight-first, with mild bias toward lower mastery
  return [...all]
    .sort((a, b) => {
      const aScore = (a.weight ?? 0) - (a.mastery_score ?? 0.5) * 0.5;
      const bScore = (b.weight ?? 0) - (b.mastery_score ?? 0.5) * 0.5;
      return bScore - aScore;
    })
    .slice(0, targetSize);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
      return json({ error: "Server misconfigured" }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const studentId = userData.user.id;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Invalid body" }, 400);
    const rawPrompt = String((body as any).prompt ?? "").replace(/[\x00-\x1F\x7F]/g, "").trim();
    const courseId = String((body as any).courseId ?? "").trim();
    if (!rawPrompt || rawPrompt.length > 1000) return json({ error: "Prompt must be 1..1000 chars" }, 400);
    if (!UUID_RE.test(courseId)) return json({ error: "Invalid courseId" }, 400);

    // Enrollment check
    const { data: enrollment, error: enrollErr } = await admin
      .from("enrollments")
      .select("id")
      .eq("student_id", studentId)
      .eq("course_id", courseId)
      .maybeSingle();
    if (enrollErr || !enrollment) return json({ error: "Not enrolled in course" }, 403);

    // Parallel fetches
    const [conceptsRes, conceptMasteryRes, courseMasteryRes, recentRes] = await Promise.all([
      admin
        .from("concepts")
        .select("concept_code, weight")
        .eq("course_id", courseId)
        .order("weight", { ascending: false })
        .limit(50),
      admin
        .from("student_concept_mastery")
        .select("concept_code, mastery_score, mastery_level, sample_count")
        .eq("student_id", studentId)
        .eq("course_id", courseId),
      admin
        .from("student_course_mastery")
        .select("mastery_score, learner_level")
        .eq("student_id", studentId)
        .eq("course_id", courseId)
        .maybeSingle(),
      admin
        .from("assessment_results")
        .select("mode, score, total_questions, correct_answers")
        .eq("student_id", studentId)
        .eq("course_id", courseId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const concepts: ConceptRow[] = (conceptsRes.data ?? []) as any;
    const masteryByCode = new Map<string, MasteryRow>();
    for (const m of (conceptMasteryRes.data ?? []) as MasteryRow[]) {
      if (m.concept_code) masteryByCode.set(m.concept_code, m);
    }
    const courseMastery = (courseMasteryRes.data ?? null) as {
      mastery_score: number | null;
      learner_level: string | null;
    } | null;
    const recentLine = ((recentRes.data ?? []) as any[])
      .map((r) => `${r.mode}:${r.correct_answers}/${r.total_questions}(${r.score}%)`)
      .join(", ");

    const knownConceptCodes = new Set(concepts.map((c) => c.concept_code));
    const availableLine = concepts.map((c) => c.concept_code).join(", ");

    // ---- Stage 1: Intent extraction ----
    const intentMessages = [
      { role: "system", content: SYSTEM_PROMPT_INTENT },
      {
        role: "user",
        content:
          `AVAILABLE_CONCEPTS: ${availableLine || "(none)"}\n\nSTUDENT_REQUEST:\n"""${rawPrompt}"""`,
      },
    ];
    const intentResp = await callGateway(LOVABLE_API_KEY, intentMessages);
    let intent: Intent;
    if (!intentResp.ok) {
      // For 429/402 surface immediately; on 502 fall back to defaults so user still gets questions
      if (intentResp.status === 429 || intentResp.status === 402) {
        return json({ error: intentResp.error }, intentResp.status);
      }
      console.warn("Stage 1 failed, using default intent");
      intent = { ...DEFAULT_INTENT };
    } else {
      const parsed = parseJsonLoose(intentResp.content);
      intent = sanitizeIntent(parsed, knownConceptCodes);
    }
    console.log("practice intent:", JSON.stringify({ ...intent, notes: undefined }));

    // ---- Build mastery snapshot ----
    const snapshotConcepts = selectConcepts(intent, concepts, masteryByCode);

    const snapshotJson = {
      course: {
        mastery_score: courseMastery?.mastery_score ?? null,
        learner_level: courseMastery?.learner_level ?? null,
      },
      concepts: snapshotConcepts,
    };

    // ---- Stage 2: Generation ----
    const genUser =
      `INTENT: ${JSON.stringify(intent)}\n` +
      `MASTERY SNAPSHOT: ${JSON.stringify(snapshotJson)}\n` +
      `RECENT ASSESSMENTS: ${recentLine || "(none)"}\n` +
      `ORIGINAL REQUEST: "${rawPrompt}"`;

    const genResp = await callGateway(LOVABLE_API_KEY, [
      { role: "system", content: SYSTEM_PROMPT_GENERATE },
      { role: "user", content: genUser },
    ]);
    if (!genResp.ok) return json({ error: genResp.error }, genResp.status);

    const parsedObj = parseJsonLoose(genResp.content);
    if (!parsedObj) {
      console.error("Failed to parse Stage 2 JSON:", genResp.content.slice(0, 500));
      return json({ error: "Failed to generate questions" }, 502);
    }
    const arr = Array.isArray(parsedObj) ? parsedObj : parsedObj?.questions;
    if (!Array.isArray(arr)) return json({ error: "Failed to generate questions" }, 502);

    const allowedTypeSet = new Set<QType>(intent.types);

    const sanitized = arr
      .filter((q: any) => q && (q.type === "mcq" || q.type === "true_false") && allowedTypeSet.has(q.type))
      .map((q: any, i: number) => {
        const type = q.type as QType;
        let options: string[] | undefined;
        let answer = String(q.answer ?? "");
        if (type === "mcq") {
          options = Array.isArray(q.options) ? q.options.map(String) : [];
          if (!options.includes(answer) && options.length > 0) answer = options[0];
        } else {
          answer = /^t/i.test(answer) ? "True" : "False";
        }
        return {
          id: `pq-${Date.now()}-${i}`,
          question: String(q.question ?? ""),
          type,
          options,
          answer,
          explanation: String(q.explanation ?? ""),
          topic: String(q.topic ?? ""),
          difficulty_estimate: clamp01(q.difficulty_estimate),
          bloom_level: clampBloom(q.bloom_level),
        };
      })
      .filter(
        (q: any) =>
          q.question && q.answer && (q.type === "true_false" || (q.options && q.options.length >= 2)),
      );

    if (sanitized.length === 0) return json({ error: "No valid questions generated" }, 502);

    return json({ questions: sanitized });
  } catch (e) {
    console.error("generate-practice-questions error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
