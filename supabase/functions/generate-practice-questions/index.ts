/**
 * generate-practice-questions
 *
 * Purpose:
 *   Generates on-demand practice questions for a student, targeted at chosen
 *   concepts + difficulty + Bloom level. Used by the practice widget.
 *
 * Auth / Access:
 *   Bearer token of a student.
 *
 * Inputs:
 *   - courseId: uuid
 *   - conceptCodes?: string[]
 *   - count?: number (1–10)
 *   - difficulty?: number 0–1
 *   - bloom?: number 1–6
 *
 * Steps:
 *   1. Validate uuids and clamp numeric inputs.
 *   2. Load concept metadata for the requested codes.
 *   3. Prompt the AI to generate the questions with per-item metadata.
 *   4. Validate each item (structural, option parity, concept, Bloom, difficulty,
 *      explanation); drop failing items.
 *   5. Return the accepted items (not persisted — ephemeral practice).
 *
 * External calls:
 *   Lovable AI Gateway.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  normalizeAnswer,
  validateStructural,
  validateOptionParity,
  validateConcept,
  validateBloom,
  validateDifficulty,
  validateExplanation,
  dedupWithin,
  auditBatchQuotas,
  summarizeRejections,
} from "../_shared/question-validation.ts";

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
  strong_areas_requested: boolean;
  off_syllabus_terms: string[];
  goal: Goal;
  language: string;
  notes: string;
}

const DEFAULT_INTENT: Intent = {
  count: 5,
  types: ["mcq", "true_false"],
  difficulty: "mixed",
  bloom_focus: [],
  concepts: [],
  weak_areas_requested: false,
  strong_areas_requested: false,
  off_syllabus_terms: [],
  goal: "general_practice",
  language: "en",
  notes: "",
};

// ---- Helpers ----
function humanizeConceptCode(code: string): string {
  return code
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  const rendered = tpl.replace(/\{(\w+)\}/g, (_m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : `\u0000{${k}}\u0000`,
  );
  const missing = rendered.match(/\u0000\{(\w+)\}\u0000/g);
  if (missing) {
    throw new Error(
      `Unsubstituted placeholders: ${missing.map((s) => s.replace(/\u0000/g, "")).join(", ")}`,
    );
  }
  return rendered;
}

// ---- Prompt templates ----
const SYSTEM_PROMPT_INTENT_TEMPLATE = `You are an intent parser for a student practice-question request in the course "{course_name}" (code: {course_code}). Today is {today_iso}. You are given the student's message and the CONCEPT LIST below. Return a single JSON object describing what they want.

CONCEPT LIST (authoritative — only these concept_codes exist):
{concept_list_json}

STUDENT MESSAGE:
"""{student_request}"""

Output JSON only (no prose, no markdown, no code fences):
{
  "count": integer 1..10,
  "types": array, non-empty subset of ["mcq","true_false"],
  "difficulty": "easy" | "medium" | "hard" | "mixed",
  "bloom_focus": array of integers in 1..6 (leave EMPTY unless the student explicitly signals a cognitive level),
  "concepts": array of concept_codes drawn ONLY from CONCEPT LIST (may be empty),
  "weak_areas_requested": boolean,
  "strong_areas_requested": boolean,
  "off_syllabus_terms": array of strings the student named that do NOT map to any concept_code,
  "goal": "review" | "challenge" | "exam_prep" | "general_practice",
  "language": BCP-47 code of the language the student wrote in; default "en",
  "notes": short restatement of the request, <=140 chars
}

Concept matching:
- Map a topic the student names to a concept_code only when it clearly corresponds to one in CONCEPT LIST (paraphrase and synonyms OK, never guesses).
- If a named topic does not correspond to any concept, do NOT put it in "concepts" — record the student's wording in "off_syllabus_terms".
- Never invent, abbreviate, or alter concept_codes.

Weak-area detection — set "weak_areas_requested": true when the message implies focusing on weak, struggling, low, unclear, shaky, or not-yet-mastered material (e.g. "weakest", "struggling with", "where I'm weak", "needs work", "focus on my gaps").

Strong-area detection — set "strong_areas_requested": true when the student wants to drill what they are already good at (e.g. "reinforce my strengths"). Uncommon; default false.

When weak or strong areas are requested without naming specific in-list concepts, leave "concepts" empty so the generator selects from mastery data.

Bloom focus — leave "bloom_focus" empty in almost all cases. Only populate it when the student explicitly signals a cognitive level (e.g. "just test definitions" -> [1,2], "make me apply and analyse" -> [3,4]). Do NOT infer Bloom from difficulty.

Fallback defaults when the student is silent or vague:
- count: 5
- types: ["mcq","true_false"]
- difficulty: "mixed"
- bloom_focus: []
- concepts: []
- weak_areas_requested: false unless implied
- strong_areas_requested: false unless implied
- off_syllabus_terms: []
- goal: "general_practice"
- language: "en"

Hard rules: clamp count to 1..10; never include any question type other than "mcq" or "true_false"; output valid JSON and nothing else.`;

const SYSTEM_PROMPT_GENERATE_TEMPLATE = `You are a practice-question generator for the university course "{course_name}" (code: {course_code}). Write every question, option, answer, and explanation in language "{target_language}". Keep concept_codes and the "topic" field unchanged regardless of language.

You are given:
(a) parsed INTENT
(b) MASTERY SNAPSHOT — the allowed concepts with mastery data
(c) COURSE-LEVEL MASTERY for this student
(d) RECENT STEMS — questions already served to this student (do not repeat)
(e) RECENT ASSESSMENTS — recent performance summary

INTENT:
{intent_json}

MASTERY SNAPSHOT (each item: {concept_code, concept_name, mastery_score (0..1 or null), mastery_level, sample_count, exam_weight (0..1)}):
{mastery_snapshot_json}

ALLOWED CONCEPT CODES (the ONLY valid values for "topic"):
{allowed_concept_codes}

COURSE-LEVEL MASTERY:
- mastery_score: {course_mastery_score}
- learner_level: {course_learner_level}

RECENT STEMS (avoid duplicating or closely paraphrasing any of these):
{recent_stems_json}

RECENT ASSESSMENTS:
{recent_assessments_line}

Rules:

ALLOWED CONCEPTS:
- Every question's "topic" MUST be a concept_code from ALLOWED CONCEPT CODES. This is absolute.
- If ALLOWED CONCEPT CODES is empty, return {"questions":[],"skipped_reason":"no in-scope concepts available"} and nothing else.

Out-of-scope handling:
- Ignore INTENT.off_syllabus_terms and any subject in INTENT.notes that is not in the allowed set. Never generate a question on a topic outside the allowed set, even if the student explicitly asked for it. The course syllabus always wins over the request.

Interpreting mastery:
- weak = mastery_score < 0.50 (null mastery also counts as a gap, high priority alongside the weakest scored concepts).
- strong = mastery_score >= 0.50, with >= 0.75 considered fully strong.
- To act on weakness or strength, sort allowed concepts by mastery_score ascending (treat null as the lowest).

Concept selection and distribution:
- If INTENT.weak_areas_requested OR INTENT.goal == "exam_prep": concentrate on the weakest concepts first, more items to weaker concepts.
- If INTENT.goal == "exam_prep" AND exam_weight is present: blend weakness with weight — heavily weighted weak concepts get the most items.
- If INTENT.strong_areas_requested: concentrate on concepts with mastery_score >= 0.50, strongest first.
- Otherwise distribute roughly evenly across allowed concepts.
- If questions outnumber concepts, reuse concepts while varying angle and difficulty. If concepts outnumber questions, cover the highest-priority concepts first.

Difficulty calibration (difficulty_estimate, 0..1):
- "easy"   -> 0.15..0.35
- "medium" -> 0.40..0.60
- "hard"   -> 0.65..0.90
- "mixed"  -> spread across the range, centred on COURSE-LEVEL MASTERY.mastery_score (lower mastery -> easier centre). If null, centre on 0.50.

Bloom level (1..6) — derive from each question's difficulty_estimate UNLESS INTENT.bloom_focus is non-empty (then bias toward those levels):
- 0.15..0.34 -> Bloom 1..2 (remember, understand)
- 0.35..0.54 -> Bloom 2..3 (understand, apply)
- 0.55..0.74 -> Bloom 3..4 (apply, analyse)
- 0.75..0.90 -> Bloom 4..5 (analyse, evaluate)
Format caps: MCQ <= Bloom 5; true_false <= Bloom 4. Bloom 6 (create) is never used. For INTENT.goal == "challenge", lean to the upper bound of each band.

Type selection (stem must match type):
- Use "mcq" for any stem that asks the student to choose among candidates or identify the best option — including any stem starting with "Which", "What", "Select", "Choose", "Identify", "Pick", "Name", or containing "of the following". MCQ requires exactly 4 options.
- Use "true_false" ONLY when the stem is a single declarative statement that is unambiguously True or False as written. Never use "true_false" for interrogative or "choose one" stems. If unsure, use "mcq".

Item quality:
- MCQ: exactly 4 distinct, plausible, non-empty options; exactly one correct; "answer" MUST be the full option string verbatim (never a letter like "A" or "B", never "Option B"). Distractors must represent realistic misconceptions, not throwaways. Vary the position of the correct option across the set.
- LENGTH PARITY: all 4 MCQ options must be within ±20% character length of each other (max/min ≤ 1.6). The correct option must NOT be the longest or the most hedged/qualified — match syntactic shape, specificity, and hedging level across all 4 options.
- True/False: options are exactly ["True","False"]; "answer" is "True" or "False"; stem is a declarative statement, never a question that asks the student to pick among candidates.
- No question may duplicate or trivially reword another in this set, and none may restate or closely paraphrase any entry in RECENT STEMS.
- Explanations are 1-3 sentences and reference the concept by its concept_name (fall back to concept_code if name unavailable).

Output: return ONLY valid JSON, no markdown or code fences, of the form {"questions":[...]} where each item has: question, type, options (omit for true_false or set to ["True","False"]), answer, explanation, topic, difficulty_estimate, bloom_level. Generate exactly INTENT.count questions unless ALLOWED CONCEPT CODES is empty.`;

async function callGateway(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
): Promise<{ ok: true; content: string } | { ok: false; status: number; error: string }> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(300_000),
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
    if (resp.status === 429)
      return { ok: false, status: 429, error: "Rate limit exceeded. Please try again in a moment." };
    if (resp.status === 402)
      return { ok: false, status: 402, error: "AI usage limit reached. Please add credits to continue." };
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
  const types = Array.isArray(raw.types) ? (raw.types.filter((t: any) => ALLOWED_TYPES.includes(t)) as QType[]) : [];
  const difficulty: Difficulty = ALLOWED_DIFFICULTY.includes(raw.difficulty) ? raw.difficulty : "mixed";
  const goal: Goal = ALLOWED_GOALS.includes(raw.goal) ? raw.goal : "general_practice";
  const bloomFocus = Array.isArray(raw.bloom_focus)
    ? Array.from(new Set(raw.bloom_focus.map((b: any) => clampBloom(b)).filter((b: number) => Number.isInteger(b))))
    : [];
  const concepts = Array.isArray(raw.concepts)
    ? Array.from(new Set(raw.concepts.map((c: any) => String(c)).filter((c: string) => knownConcepts.has(c))))
    : [];
  const offSyllabus = Array.isArray(raw.off_syllabus_terms)
    ? Array.from(
        new Set(
          raw.off_syllabus_terms
            .map((s: any) => String(s).trim())
            .filter((s: string) => s.length > 0 && s.length <= 80),
        ),
      ).slice(0, 10)
    : [];
  const language = typeof raw.language === "string" && /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/.test(raw.language)
    ? raw.language
    : "en";
  return {
    count: clampCount(raw.count),
    types: types.length > 0 ? types : ["mcq", "true_false"],
    difficulty,
    bloom_focus: bloomFocus,
    concepts,
    weak_areas_requested: Boolean(raw.weak_areas_requested),
    strong_areas_requested: Boolean(raw.strong_areas_requested),
    off_syllabus_terms: offSyllabus,
    goal,
    language,
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
  concept_code: string;
  concept_name: string;
  exam_weight: number;
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
      concept_code: c.concept_code,
      concept_name: humanizeConceptCode(c.concept_code),
      exam_weight: Number(c.weight ?? 0),
      mastery_score: m?.mastery_score != null ? Number(m.mastery_score) : null,
      mastery_level: m?.mastery_level ?? null,
      sample_count: m?.sample_count ?? 0,
    };
  });

  if (intent.concepts.length > 0) {
    const set = new Set(intent.concepts);
    const picked = all.filter((c) => set.has(c.concept_code));
    return picked.length > 0 ? picked : all.slice(0, Math.max(3, intent.count));
  }

  const targetSize = Math.max(3, intent.count);
  if (intent.weak_areas_requested || intent.goal === "exam_prep") {
    return [...all]
      .sort((a, b) => {
        const ams = a.mastery_score ?? 1.01;
        const bms = b.mastery_score ?? 1.01;
        if (ams !== bms) return ams - bms;
        return (b.exam_weight ?? 0) - (a.exam_weight ?? 0);
      })
      .slice(0, targetSize);
  }

  if (intent.strong_areas_requested) {
    return [...all]
      .sort((a, b) => (b.mastery_score ?? -1) - (a.mastery_score ?? -1))
      .slice(0, targetSize);
  }

  return [...all]
    .sort((a, b) => {
      const aScore = (a.exam_weight ?? 0) - (a.mastery_score ?? 0.5) * 0.5;
      const bScore = (b.exam_weight ?? 0) - (b.mastery_score ?? 0.5) * 0.5;
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
    const rawPrompt = String((body as any).prompt ?? "")
      .replace(/[\x00-\x1F\x7F]/g, "")
      .trim();
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
    const [courseRes, conceptsRes, conceptMasteryRes, courseMasteryRes, recentRes] = await Promise.all([
      admin.from("courses").select("name, code").eq("id", courseId).maybeSingle(),
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

    const course = (courseRes.data ?? null) as { name: string | null; code: string | null } | null;
    const courseName = course?.name?.trim() || "this course";
    const courseCode = course?.code?.trim() || "n/a";

    const concepts: ConceptRow[] = (conceptsRes.data ?? []) as any;
    const masteryByCode = new Map<string, MasteryRow>();
    for (const m of (conceptMasteryRes.data ?? []) as MasteryRow[]) {
      if (m.concept_code) masteryByCode.set(m.concept_code, m);
    }
    const courseMastery = (courseMasteryRes.data ?? null) as {
      mastery_score: number | null;
      learner_level: string | null;
    } | null;
    const recentLine =
      ((recentRes.data ?? []) as any[])
        .map((r) => `${r.mode}:${r.correct_answers}/${r.total_questions}(${r.score}%)`)
        .join(", ") || "(none)";

    const knownConceptCodes = new Set(concepts.map((c) => c.concept_code));
    const conceptList = concepts.map((c) => ({
      concept_code: c.concept_code,
      concept_name: humanizeConceptCode(c.concept_code),
    }));
    const todayIso = new Date().toISOString().slice(0, 10);

    // ---- Stage 1: Intent extraction ----
    const intentSystem = renderTemplate(SYSTEM_PROMPT_INTENT_TEMPLATE, {
      course_name: courseName,
      course_code: courseCode,
      today_iso: todayIso,
      concept_list_json: JSON.stringify(conceptList),
      student_request: rawPrompt,
    });

    const intentResp = await callGateway(LOVABLE_API_KEY, [
      { role: "system", content: intentSystem },
      { role: "user", content: rawPrompt },
    ]);
    let intent: Intent;
    if (!intentResp.ok) {
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
    const allowedCodes =
      intent.concepts.length > 0
        ? intent.concepts
        : snapshotConcepts.map((c) => c.concept_code);

    // ---- Stage 2: Generation ----
    const genSystem = renderTemplate(SYSTEM_PROMPT_GENERATE_TEMPLATE, {
      course_name: courseName,
      course_code: courseCode,
      target_language: intent.language,
      intent_json: JSON.stringify(intent),
      mastery_snapshot_json: JSON.stringify(snapshotConcepts),
      allowed_concept_codes: allowedCodes.join(", ") || "(none)",
      course_mastery_score:
        courseMastery?.mastery_score != null ? String(courseMastery.mastery_score) : "null",
      course_learner_level: courseMastery?.learner_level || "unknown",
      recent_stems_json: "[]",
      recent_assessments_line: recentLine,
    });

    const genResp = await callGateway(LOVABLE_API_KEY, [
      { role: "system", content: genSystem },
      { role: "user", content: "Generate the questions now." },
    ]);
    if (!genResp.ok) return json({ error: genResp.error }, genResp.status);

    const parsedObj = parseJsonLoose(genResp.content);
    if (!parsedObj) {
      console.error("Failed to parse Stage 2 JSON:", genResp.content.slice(0, 500));
      return json({ error: "Failed to generate questions" }, 502);
    }
    const arr = Array.isArray(parsedObj) ? parsedObj : parsedObj?.questions;
    if (!Array.isArray(arr)) return json({ error: "Failed to generate questions" }, 502);

    const normalizeOptions = (o: any): string[] => {
      if (Array.isArray(o)) return o.map((x) => String(x));
      if (o && typeof o === "object") return Object.values(o).map((x) => String(x));
      return [];
    };

    // Build set of concept codes the model was *actually allowed* to use.
    const allowedTopicSet: Record<string, true> = {};
    for (const code of allowedCodes) allowedTopicSet[code] = true;

    const rejections: string[] = [];
    const sanitized = arr
      .map((q: any, i: number) => {
        // 1) Structural (format, stem, options, length parity, T/F stem shape).
        const raw = { ...q, options: q?.type === "mcq" ? normalizeOptions(q?.options).map((s) => s.trim()).filter(Boolean) : undefined };
        const structural = validateStructural(raw, {
          allowedFormats: ["mcq", "true_false"],
          requireFourOptions: false, // practice allows ≥2 options
        });
        if (!structural.ok) { rejections.push(structural.reason); return null; }
        const { format, content_text, options } = structural.value;

        // 2) Concept ∈ allowed set (was previously trusted from the prompt only).
        const conceptCheck = validateConcept(q.topic, allowedTopicSet);
        if (!conceptCheck.ok) { rejections.push(conceptCheck.reason); return null; }
        const topic = conceptCheck.value;

        // 3) Answer normalisation.
        let answer: string;
        if (format === "true_false") {
          const raw = String(q.answer ?? "").trim();
          answer = /^t/i.test(raw) ? "True" : /^f/i.test(raw) ? "False" : "";
          if (!answer) { rejections.push("t/f answer neither True nor False"); return null; }
        } else {
          const ans = normalizeAnswer(q.answer, options);
          if (!ans.ok) { rejections.push(ans.reason); return null; }
          answer = ans.value;
          const parity = validateOptionParity(options, answer);
          if (!parity.ok) { rejections.push(parity.reason); return null; }
        }

        // 4) Difficulty (no silent clamp — reject non-numeric).
        const diff = validateDifficulty(q.difficulty_estimate, { fallback: 0.5 });
        if (!diff.ok) { rejections.push(diff.reason); return null; }

        // 5) Bloom — must be integer 1..6, plus difficulty consistency.
        const bloom = validateBloom(q.bloom_level, {
          min: 1, max: 6,
          enforceDifficultyConsistency: true,
          difficulty: diff.value,
        });
        if (!bloom.ok) { rejections.push(bloom.reason); return null; }

        // 6) Explanation semantic check.
        const explanation = String(q.explanation ?? "").trim();
        const explCheck = validateExplanation({
          format, options: format === "true_false" ? ["True", "False"] : options,
          answer, explanation,
        });
        if (!explCheck.ok) { rejections.push(explCheck.reason); return null; }

        return {
          id: `pq-${Date.now()}-${i}`,
          question: content_text,
          type: format as QType,
          options: format === "mcq" ? options : undefined,
          answer,
          explanation: explCheck.value,
          topic,
          difficulty_estimate: diff.value,
          bloom_level: bloom.value,
        };
      })
      .filter((q): q is NonNullable<typeof q> => q !== null);

    if (rejections.length > 0) {
      console.log(`practice: rejected ${rejections.length}/${arr.length} — ${rejections.slice(0, 8).join(" | ")}`);
    }



    if (sanitized.length === 0) {
      console.error("No valid questions after sanitize. Raw Stage 2 content:", genResp.content.slice(0, 1500));
      return json({ error: "No valid questions generated" }, 502);
    }

    return json({ questions: sanitized });
  } catch (e) {
    console.error("generate-practice-questions error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
