/**
 * generate-daily-dsa-questions
 *
 * Purpose:
 *   Bulk-generates a course-wide daily-practice ("Daily DSA") question bank.
 *   One teacher-initiated call distributes the requested total across the
 *   course's coding/lab weeks and writes DRAFT rows into
 *   daily_dsa_questions (+ daily_dsa_question_private for the reference
 *   solution and hidden tests — never student-readable). The professor
 *   reviews and publishes from the DSA Questions setup step.
 *
 * Auth / Access:
 *   Bearer token of the course teacher (owner, collaborator, or admin).
 *   Server-side guards: employment-pathway course with admin-approved coding
 *   access and at least one coding/lab week.
 *
 * Inputs:
 *   - course_id: uuid
 *   - count: integer 1..40 — total questions across the whole course
 *   - language: string — one of ALLOWED_LANGUAGES (default "python")
 *   - hint?: string — teacher's guidance (<= 500 chars)
 *
 * Response: NDJSON stream — heartbeat frames every 20s, {type:"progress"}
 * after each week, final frame {type:"result"|"error"}.
 *
 * External calls:
 *   Lovable AI Gateway (Responses API, streamed).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";

const FUNCTION_NAME = "generate-daily-dsa-questions";
const MODEL = "openai/gpt-6-astra";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_LANGUAGES = [
  "python",
  "javascript",
  "typescript",
  "java",
  "cpp",
  "c",
  "go",
  "ruby",
] as const;
type Language = (typeof ALLOWED_LANGUAGES)[number];

const MAX_TOTAL = 40;
const MAX_PER_WEEK_CALL = 12;
const MAX_WEEKS_PER_RUN = 12;
const MAX_ATTEMPTS = 2; // initial + one retry on validation failure

interface Example {
  input: string;
  output: string;
  explanation?: string;
}
interface TestCase {
  input: string;
  expected_output: string;
}
interface GeneratedQuestion {
  title: string;
  problem_statement: string;
  input_spec: string;
  output_spec: string;
  constraints: string | null;
  examples: Example[];
  starter_code: string;
  reference_solution: string;
  standard_test_cases: TestCase[];
  hidden_test_cases: TestCase[];
  bloom_level: number;
  bloom_justification: string | null;
  /** One of the week's concept codes; resolved to concepts.id on save. */
  concept_code: string | null;
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asTestCases(v: unknown): TestCase[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((t: any) => ({
      input: asStr(t?.input),
      expected_output: asStr(t?.expected_output ?? t?.output),
    }))
    .filter((t) => t.input.length > 0 && t.expected_output.length > 0);
}

function asExamples(v: unknown): Example[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e: any) => ({
      input: asStr(e?.input),
      output: asStr(e?.output),
      ...(asStr(e?.explanation) ? { explanation: asStr(e?.explanation) } : {}),
    }))
    .filter((e) => e.input.length > 0 && e.output.length > 0);
}

/** Structural validation of one model-authored question. Returns issues. */
function validateQuestion(raw: any): { ok: boolean; issues: string[]; value?: GeneratedQuestion } {
  const issues: string[] = [];
  if (!raw || typeof raw !== "object") return { ok: false, issues: ["not an object"] };

  const title = asStr(raw.title);
  const problem_statement = asStr(raw.problem_statement);
  const input_spec = asStr(raw.input_spec);
  const output_spec = asStr(raw.output_spec);
  const constraints = asStr(raw.constraints) || null;
  const starter_code = asStr(raw.starter_code);
  const reference_solution = asStr(raw.reference_solution);
  const examples = asExamples(raw.examples);
  const standard = asTestCases(raw.standard_test_cases);
  const hidden = asTestCases(raw.hidden_test_cases);
  const bloomRaw = Number(raw.bloom_level);
  const bloom_level = Number.isFinite(bloomRaw) ? Math.min(6, Math.max(1, Math.round(bloomRaw))) : 3;
  const bloom_justification = asStr(raw.bloom_justification) || null;

  if (problem_statement.length < 40) issues.push("problem_statement missing or too short");
  if (!input_spec) issues.push("input_spec missing");
  if (!output_spec) issues.push("output_spec missing");
  if (starter_code.length < 10) issues.push("starter_code missing or too short");
  if (reference_solution.length < 20) issues.push("reference_solution missing or too short");
  if (examples.length < 1) issues.push("need at least 1 worked example with input and output");
  if (standard.length < 1) issues.push("need at least 1 standard test case with expected_output");
  if (hidden.length < 1) issues.push("need at least 1 hidden/edge test case with expected_output");

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    issues,
    value: {
      title: title || "Daily practice question",
      problem_statement,
      input_spec,
      output_spec,
      constraints,
      examples,
      starter_code,
      reference_solution,
      standard_test_cases: standard,
      hidden_test_cases: hidden,
      bloom_level,
      bloom_justification,
      concept_code: asStr(raw.concept_code) || null,
    },
  };
}

const EXERCISE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    problem_statement: { type: "string" },
    input_spec: { type: "string" },
    output_spec: { type: "string" },
    constraints: { type: "string", description: "Empty string when not applicable." },
    examples: {
      type: "array",
      items: {
        type: "object",
        properties: {
          input: { type: "string" },
          output: { type: "string" },
          explanation: { type: "string", description: "Empty string when not needed." },
        },
        required: ["input", "output", "explanation"],
        additionalProperties: false,
      },
    },
    starter_code: { type: "string" },
    reference_solution: { type: "string" },
    standard_test_cases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          input: { type: "string" },
          expected_output: { type: "string" },
        },
        required: ["input", "expected_output"],
        additionalProperties: false,
      },
    },
    hidden_test_cases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          input: { type: "string" },
          expected_output: { type: "string" },
        },
        required: ["input", "expected_output"],
        additionalProperties: false,
      },
    },
    bloom_level: { type: "integer" },
    bloom_justification: { type: "string" },
    concept_code: {
      type: "string",
      description: "The single concept from the provided concept list this question most directly tests, copied exactly.",
    },
  },
  required: [
    "title",
    "problem_statement",
    "input_spec",
    "output_spec",
    "constraints",
    "examples",
    "starter_code",
    "reference_solution",
    "standard_test_cases",
    "hidden_test_cases",
    "bloom_level",
    "bloom_justification",
    "concept_code",
  ],
  additionalProperties: false,
} as const;

function buildPrompts(opts: {
  courseName: string;
  courseObjectives: string[];
  weekNumber: number;
  weekName: string;
  overview: string;
  conceptNames: string[];
  language: Language;
  count: number;
  avoidTitles: string[];
  hint: string | null;
}): { instructions: string; input: string } {
  const instructions = `You author ${opts.count} industry-aligned daily-practice coding questions for a university course week.

Each question must read like a real workplace / technical-interview task (e.g. "normalize a CSV export", "implement a rate limiter", "parse a log file"), not a toy textbook drill — while staying solvable with ONLY the week's concepts. The ${opts.count} questions must be clearly distinct from each other in scenario and technique.

Required content per question:
- title: 3–7 words.
- problem_statement: a realistic scenario + precisely stated task. At least 2 short paragraphs or a paragraph plus bullet requirements.
- input_spec: exact input format (stdin / function parameters — pick one and state it).
- output_spec: exact expected output format, including whitespace/newlines that matter.
- constraints: value ranges, size limits, edge conditions. Empty string if none.
- examples: 1–2 worked examples, each {input, output, explanation} (explanation may be an empty string).
- starter_code: a runnable ${opts.language} SKELETON the student starts from — the entry point (main/function signatures) that matches your input_spec/output_spec, with TODO comments marking where logic goes. It must compile/run as-is and must NOT contain any solution logic.
- reference_solution: complete, idiomatic, runnable ${opts.language} solution. NO placeholder comments.
- standard_test_cases: 2–4 cases covering the main paths, each {input, expected_output}.
- hidden_test_cases: 2–4 EDGE cases (empty input, boundaries, large values, tricky formatting), each {input, expected_output}.
- bloom_level: integer 1-6 for the cognitive demand of the TASK (1=Remember, 2=Understand, 3=Apply, 4=Analyze, 5=Evaluate, 6=Create). Most coding exercises are 3-4; only assign 5-6 when the student must design, evaluate trade-offs, or create a non-obvious solution.
- bloom_justification: one sentence (<= 200 chars) explaining the level you chose.
- concept_code: the ONE concept from the provided concept list this question most directly tests. Copy it exactly as listed.

CRITICAL correctness rule: derive every expected_output by mentally executing your own reference_solution on that input. The expected outputs MUST be exactly what your solution prints/returns.`;

  const input = `COURSE: ${opts.courseName}
Objectives: ${opts.courseObjectives.join("; ") || "Not specified"}

WEEK ${opts.weekNumber}: ${opts.weekName}
Week overview: ${opts.overview || "(none)"}
CONCEPTS THESE QUESTIONS MUST USE (only these): ${opts.conceptNames.join(", ")}
LANGUAGE: ${opts.language}
NUMBER OF QUESTIONS: ${opts.count}
${opts.avoidTitles.length ? `\nDO NOT reuse or closely mirror these existing question titles/themes: ${opts.avoidTitles.join(" | ")}` : ""}
${opts.hint ? `\nPROFESSOR GUIDANCE: ${opts.hint}` : ""}`;

  return { instructions, input };
}

/**
 * Calls the gateway Responses API with streaming and returns the final
 * output text. Streaming is required — reasoning runs of minutes are normal
 * and a buffered call would be killed by the platform request timeout.
 */
async function callGateway(
  lovableKey: string,
  prompts: { instructions: string; input: string },
  logMeta: { teacher_id: string; course_id: string; week: number; attempt: number },
): Promise<string> {
  const resp = await loggedGatewayFetch(
    FUNCTION_NAME,
    {
      model: MODEL,
      purpose: "daily-dsa-question",
      attempt: logMeta.attempt,
      total_attempts: MAX_ATTEMPTS,
      teacher_id: logMeta.teacher_id,
      course_id: logMeta.course_id,
      context: { week: logMeta.week },
    },
    "https://ai.gateway.lovable.dev/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        instructions: prompts.instructions,
        input: prompts.input,
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        max_output_tokens: 16000,
        text: {
          format: {
            type: "json_schema",
            name: "daily_dsa_questions",
            strict: true,
            schema: {
              type: "object",
              properties: { questions: { type: "array", items: EXERCISE_SCHEMA } },
              required: ["questions"],
              additionalProperties: false,
            },
          },
        },
      }),
    },
  );

  if (!resp.ok) {
    const status = resp.status;
    const errText = await resp.text().catch(() => "");
    console.error(`[gen-daily-dsa] gateway ${status}:`, errText.slice(0, 500));
    if (status === 429 || status === 402) {
      throw Object.assign(
        new Error(
          status === 429
            ? "Rate limit exceeded. Try again shortly."
            : "AI credits exhausted. Add funds in Settings > Workspace > Usage.",
        ),
        { httpStatus: status },
      );
    }
    if (status === 400 || status === 401 || status === 403) {
      let msg = `AI gateway rejected the request (HTTP ${status}).`;
      try {
        const parsed = JSON.parse(errText);
        if (typeof parsed?.error?.message === "string" && parsed.error.message) {
          msg = parsed.error.message;
        }
      } catch { /* keep generic message */ }
      throw Object.assign(new Error(msg), { httpStatus: status });
    }
    throw new Error(`AI gateway error (HTTP ${status}).`);
  }

  // Read the SSE stream; accumulate output_text deltas.
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let streamError: string | null = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let evt: any;
      try {
        evt = JSON.parse(data);
      } catch {
        continue;
      }
      if (evt?.type === "response.output_text.delta" && typeof evt.delta === "string") {
        text += evt.delta;
      } else if (evt?.type === "response.completed" && !text) {
        text = evt?.response?.output_text ?? "";
      } else if (evt?.type === "response.failed" || evt?.type === "error") {
        streamError = evt?.response?.error?.message ?? evt?.message ?? "generation failed";
      }
    }
  }
  if (streamError) throw new Error(streamError);
  if (!text.trim()) throw new Error("The AI returned an empty response");
  return text;
}

/** Generate one week's batch; up to MAX_ATTEMPTS attempts. Returns [] on failure. */
async function generateWeekBatch(
  lovableKey: string,
  prompts: { instructions: string; input: string },
  expectedCount: number,
  logMeta: { teacher_id: string; course_id: string; week: number },
): Promise<GeneratedQuestion[]> {
  let lastIssues = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const input = lastIssues
        ? `${prompts.input}\n\nPREVIOUS ATTEMPT WAS REJECTED — fix these issues: ${lastIssues}`
        : prompts.input;
      const raw = await callGateway(lovableKey, { instructions: prompts.instructions, input }, {
        ...logMeta,
        attempt,
      });
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        lastIssues = "unparseable JSON response";
        continue;
      }
      const arr = Array.isArray(parsed?.questions) ? parsed.questions : [];
      const valid: GeneratedQuestion[] = [];
      const issueSummary: string[] = [];
      for (const item of arr) {
        const v = validateQuestion(item);
        if (v.ok && v.value) valid.push(v.value);
        else issueSummary.push(v.issues.join("; "));
      }
      if (valid.length > 0) return valid.slice(0, expectedCount);
      lastIssues = issueSummary.join(" | ") || "no questions returned";
      console.log(`[gen-daily-dsa] week ${logMeta.week} validation failed (attempt ${attempt}):`, lastIssues);
    } catch (e: any) {
      if (e?.httpStatus) throw e; // quota/config errors propagate verbatim
      console.error(`[gen-daily-dsa] week ${logMeta.week} attempt ${attempt} error:`, e?.message ?? e);
      lastIssues = e?.message ?? "unknown error";
    }
  }
  return [];
}

async function run(
  req: Request,
  emit: (obj: unknown) => void,
): Promise<{ status: number; payload: unknown }> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ─── Auth ───
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { status: 401, payload: { error: "Not authenticated" } };
  }
  const token = authHeader.slice("Bearer ".length);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return { status: 401, payload: { error: "Not authenticated" } };
  }
  const userId = claimsData.claims.sub as string;

  // ─── Input validation ───
  const body = await req.json().catch(() => null);
  const courseId = typeof body?.course_id === "string" ? body.course_id : null;
  const count = Number(body?.count ?? 20);
  const languageRaw = asStr(body?.language).toLowerCase() || "python";
  const hint = asStr(body?.hint) || null;

  if (!courseId) return { status: 400, payload: { error: "course_id is required" } };
  if (!Number.isInteger(count) || count < 1 || count > MAX_TOTAL) {
    return { status: 400, payload: { error: `count must be an integer between 1 and ${MAX_TOTAL}` } };
  }
  if (!(ALLOWED_LANGUAGES as readonly string[]).includes(languageRaw)) {
    return {
      status: 400,
      payload: { error: `language must be one of: ${ALLOWED_LANGUAGES.join(", ")}` },
    };
  }
  const language = languageRaw as Language;
  if (hint && hint.length > 500) {
    return { status: 400, payload: { error: "hint must be 500 characters or fewer" } };
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // ─── Authorize: course teacher, collaborator, or admin ───
  const { data: course } = await admin
    .from("courses")
    .select("id, name, teacher_id, objectives, coding_access_status, course_type")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return { status: 404, payload: { error: "Course not found" } };

  let allowed = course.teacher_id === userId;
  if (!allowed) {
    const { data: ct } = await admin
      .from("course_teachers")
      .select("teacher_id")
      .eq("course_id", courseId)
      .eq("teacher_id", userId)
      .maybeSingle();
    allowed = !!ct;
  }
  if (!allowed) {
    const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    allowed = prof?.role === "admin";
  }
  if (!allowed) return { status: 403, payload: { error: "Forbidden" } };

  // ─── Guards: coding access + at least one coding week ───
  if ((course as any).coding_access_status !== "approved") {
    return {
      status: 400,
      payload: { error: "Daily practice questions require admin-approved coding access for this course." },
    };
  }

  const { data: weeks } = await admin
    .from("lesson_plan_weeks")
    .select("week_number, week_name, overview, concepts, is_coding_week")
    .eq("course_id", courseId)
    .order("week_number", { ascending: true });
  const codingWeeks = (weeks ?? []).filter((w: any) => w.is_coding_week);
  if (codingWeeks.length === 0) {
    return { status: 400, payload: { error: "This course has no coding/lab weeks in its lesson plan." } };
  }

  // ─── Distribute the total across coding weeks (earliest weeks first) ───
  const targetWeeks = codingWeeks.slice(0, MAX_WEEKS_PER_RUN);
  const base = Math.floor(count / targetWeeks.length);
  const remainder = count % targetWeeks.length;
  const plan = targetWeeks.map((w: any, i: number) => ({
    week: w,
    count: Math.min(MAX_PER_WEEK_CALL, base + (i < remainder ? 1 : 0)),
  })).filter((p) => p.count > 0);

  // Existing titles go into the avoid list so re-runs don't duplicate.
  const { data: existing } = await admin
    .from("daily_dsa_questions")
    .select("title")
    .eq("course_id", courseId);
  const avoidTitles = (existing ?? []).map((r: any) => asStr(r.title)).filter(Boolean);

  // ─── Generate week by week so progress is meaningful ───
  const allPublicRows: any[] = [];
  const allPrivateDrafts: GeneratedQuestion[] = [];
  let generated = 0;
  let weeksDone = 0;

  // Next position per week (append after existing rows).
  const { data: posRows } = await admin
    .from("daily_dsa_questions")
    .select("week_number, position")
    .eq("course_id", courseId);
  const nextPos = new Map<number, number>();
  for (const r of posRows ?? []) {
    const w = Number((r as any).week_number);
    nextPos.set(w, Math.max(nextPos.get(w) ?? -1, Number((r as any).position ?? 0)));
  }

  for (const { week, count: weekCount } of plan) {
    const conceptNames: string[] = Array.isArray(week.concepts)
      ? (week.concepts as any[]).map((c) => asStr(c?.name)).filter(Boolean)
      : [];
    const prompts = buildPrompts({
      courseName: String(course.name ?? ""),
      courseObjectives: Array.isArray(course.objectives) ? (course.objectives as string[]) : [],
      weekNumber: Number(week.week_number),
      weekName: String(week.week_name ?? `Week ${week.week_number}`),
      overview: asStr(week.overview),
      conceptNames: conceptNames.length ? conceptNames : ["general programming practice"],
      language,
      count: weekCount,
      avoidTitles,
      hint,
    });
    const batch = await generateWeekBatch(lovableKey, prompts, weekCount, {
      teacher_id: userId,
      course_id: courseId,
      week: Number(week.week_number),
    });
    const startPos = (nextPos.get(Number(week.week_number)) ?? -1) + 1;
    batch.forEach((q, i) => {
      allPublicRows.push({
        course_id: courseId,
        week_number: Number(week.week_number),
        position: startPos + i,
        title: q.title,
        problem_statement: q.problem_statement,
        language,
        input_spec: q.input_spec,
        output_spec: q.output_spec,
        constraints: q.constraints,
        examples: q.examples,
        starter_code: q.starter_code,
        primary_language: language,
        standard_test_cases: q.standard_test_cases,
        bloom_level: q.bloom_level,
        bloom_justification: q.bloom_justification,
        published: false,
        teacher_id: userId,
      });
      allPrivateDrafts.push(q);
      avoidTitles.push(q.title);
    });
    nextPos.set(Number(week.week_number), startPos + batch.length - 1);
    generated += batch.length;
    weeksDone += 1;
    emit({
      type: "progress",
      stage: "week",
      week: Number(week.week_number),
      generated,
      weeksDone,
      totalWeeks: plan.length,
    });
  }

  if (allPublicRows.length === 0) {
    return {
      status: 502,
      payload: { error: "The AI could not produce valid questions. Try again, or reduce the quantity." },
    };
  }

  // ─── Persist drafts ───
  const { data: inserted, error: insErr } = await admin
    .from("daily_dsa_questions")
    .insert(allPublicRows)
    .select("id");
  if (insErr || !inserted) {
    console.error("[gen-daily-dsa] insert failed:", insErr);
    return { status: 500, payload: { error: "Failed to save generated questions" } };
  }

  const privateRows = inserted.map((row: any, i: number) => ({
    question_id: row.id,
    reference_solution: allPrivateDrafts[i].reference_solution,
    hidden_test_cases: allPrivateDrafts[i].hidden_test_cases,
  }));
  const { error: privErr } = await admin.from("daily_dsa_question_private").insert(privateRows);
  if (privErr) {
    console.error("[gen-daily-dsa] private insert failed:", privErr);
    // Roll back the public rows so no question exists without its solution/tests.
    await admin.from("daily_dsa_questions").delete().in("id", inserted.map((r: any) => r.id));
    return { status: 500, payload: { error: "Failed to save generated questions" } };
  }

  return {
    status: 200,
    payload: {
      generated,
      requested: count,
      total_in_bank: (existing ?? []).length + generated,
      language,
      weeks: plan.map((p) => Number(p.week.week_number)),
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const encoder = new TextEncoder();

  // NDJSON stream: heartbeat every 20s so the connection is never idle long
  // enough to hit the Edge Runtime's idle timeout. Final frame is
  // {type:"result", status, payload} or {type:"error", status, message}.
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const write = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          // peer closed; ignore
        }
      };

      write({ type: "heartbeat", t: 0, stage: "start" });
      const hb = setInterval(() => {
        write({ type: "heartbeat", t: Date.now() - startedAt });
      }, 20_000);

      try {
        const { status, payload } = await run(req, write);
        write({ type: "result", status, payload });
      } catch (e: any) {
        console.error("generate-daily-dsa-questions error:", e);
        write({ type: "error", status: 500, message: e?.message ?? String(e) });
      } finally {
        clearInterval(hb);
        closed = true;
        try {
          controller.close();
        } catch {
          // ignore
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
});
