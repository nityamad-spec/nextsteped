/**
 * generate-coding-exercises
 *
 * Purpose:
 *   Generates industry-aligned coding exercises for a coding/lab week of the
 *   lesson plan. Exercises are grounded in the week's concepts and appended
 *   as DRAFTS — the professor reviews/edits them and publishes explicitly.
 *
 * Auth / Access:
 *   Bearer token of the course teacher (owner, collaborator, or admin).
 *   Server-side guards: the course must have admin-approved coding access
 *   (courses.coding_access_status = 'approved') and the target week must be
 *   a coding/lab week with at least one concept.
 *
 * Inputs:
 *   - course_id: uuid
 *   - week_number: integer
 *   - count: integer 1..5 — number of exercises to generate (appended)
 *   - language: string — one of ALLOWED_LANGUAGES (default "python")
 *   - hint?: string — teacher's guidance for the exercises
 *
 * Steps:
 *   1. Authenticate (getClaims) and authorize against the course.
 *   2. Guard coding access + coding-week + concepts.
 *   3. One gateway sub-call per exercise (parallel), tool-call schema;
 *      validate structure, retry once on failure.
 *   4. Insert drafts into coding_exercises (+ coding_exercise_private for
 *      the reference solution and hidden tests — students can never read
 *      that table).
 *   5. Return { generated, total_for_week }.
 *
 * Response: NDJSON stream — heartbeat frames every 20s (defeats the Edge
 * Runtime's 150s IDLE_TIMEOUT), final frame {type:"result"|"error"}.
 *
 * External calls:
 *   Lovable AI Gateway.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";

const FUNCTION_NAME = "generate-coding-exercises";
const MODEL = "openai/gpt-5.6-sol";

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

const MAX_PER_REQUEST = 5;
const PER_CALL_TIMEOUT_MS = 120_000;
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
interface GeneratedExercise {
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

/** Structural validation of one model-authored exercise. Returns issues. */
function validateExercise(raw: any): { ok: boolean; issues: string[]; value?: GeneratedExercise } {
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
      title: title || "Coding exercise",
      problem_statement,
      input_spec,
      output_spec,
      constraints,
      examples,
      starter_code,
      reference_solution,
      standard_test_cases: standard,
      hidden_test_cases: hidden,
    },
  };
}

function buildPrompts(opts: {
  courseName: string;
  courseObjectives: string[];
  weekNumber: number;
  weekName: string;
  overview: string;
  conceptNames: string[];
  language: Language;
  avoidTitles: string[];
  hint: string | null;
}): { system: string; user: string } {
  const system = `You author ONE industry-aligned coding exercise for a university course week.

The exercise must read like a real workplace / technical-interview task (e.g. "normalize a CSV export", "implement a rate limiter", "parse a log file"), not a toy textbook drill — while staying solvable with ONLY the week's concepts.

Required content (all via the author_exercise tool):
- title: 3–7 words.
- problem_statement: a realistic scenario + precisely stated task. At least 2 short paragraphs or a paragraph plus bullet requirements.
- input_spec: exact input format (stdin / function parameters — pick one and state it).
- output_spec: exact expected output format, including whitespace/newlines that matter.
- constraints: value ranges, size limits, edge conditions. Empty string if none.
- examples: 1–2 worked examples, each {input, output, explanation?}.
- reference_solution: complete, idiomatic, runnable ${opts.language} solution. NO placeholder comments.
- standard_test_cases: 2–4 cases covering the main paths, each {input, expected_output}.
- hidden_test_cases: 2–4 EDGE cases (empty input, boundaries, large values, tricky formatting), each {input, expected_output}.

CRITICAL correctness rule: derive every expected_output by mentally executing your own reference_solution on that input. The expected outputs MUST be exactly what your solution prints/returns.

Return ONLY via the author_exercise tool.`;

  const user = `COURSE: ${opts.courseName}
Objectives: ${opts.courseObjectives.join("; ") || "Not specified"}

WEEK ${opts.weekNumber}: ${opts.weekName}
Week overview: ${opts.overview || "(none)"}
CONCEPTS THIS EXERCISE MUST USE (only these): ${opts.conceptNames.join(", ")}
LANGUAGE: ${opts.language}
${opts.avoidTitles.length ? `\nDO NOT reuse or closely mirror these existing exercise titles/themes: ${opts.avoidTitles.join(" | ")}` : ""}
${opts.hint ? `\nPROFESSOR GUIDANCE: ${opts.hint}` : ""}`;

  return { system, user };
}

const AUTHOR_TOOL = {
  type: "function",
  function: {
    name: "author_exercise",
    description: "Author one complete coding exercise with solution and tests.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        problem_statement: { type: "string" },
        input_spec: { type: "string" },
        output_spec: { type: "string" },
        constraints: { type: "string" },
        examples: {
          type: "array",
          items: {
            type: "object",
            properties: {
              input: { type: "string" },
              output: { type: "string" },
              explanation: { type: "string" },
            },
            required: ["input", "output"],
            additionalProperties: false,
          },
        },
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
      },
      required: [
        "title",
        "problem_statement",
        "input_spec",
        "output_spec",
        "examples",
        "reference_solution",
        "standard_test_cases",
        "hidden_test_cases",
      ],
      additionalProperties: false,
    },
  },
};

/** Generate ONE exercise; up to MAX_ATTEMPTS attempts. Returns null on failure. */
async function generateOne(
  lovableKey: string,
  prompts: { system: string; user: string },
  logMeta: { teacher_id: string | null; course_id: string | null; week: number },
): Promise<GeneratedExercise | null> {
  let lastIssues = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const user = lastIssues
        ? `${prompts.user}\n\nPREVIOUS ATTEMPT WAS REJECTED — fix these issues: ${lastIssues}`
        : prompts.user;
      const resp = await loggedGatewayFetch(
        FUNCTION_NAME,
        {
          model: MODEL,
          purpose: "coding-exercise",
          attempt,
          total_attempts: MAX_ATTEMPTS,
          teacher_id: logMeta.teacher_id,
          course_id: logMeta.course_id,
          context: { week: logMeta.week },
        },
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          signal: AbortSignal.timeout(PER_CALL_TIMEOUT_MS),
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: prompts.system },
              { role: "user", content: user },
            ],
            tools: [AUTHOR_TOOL],
            tool_choice: { type: "function", function: { name: "author_exercise" } },
          }),
        },
      );

      if (!resp.ok) {
        const status = resp.status;
        console.error(`[gen-coding] gateway ${status} (attempt ${attempt})`);
        if (status === 429 || status === 402) {
          // Surface quota errors immediately rather than burning the retry.
          throw Object.assign(new Error(
            status === 429
              ? "Rate limit exceeded. Try again shortly."
              : "AI credits exhausted. Add funds in Settings > Workspace > Usage.",
          ), { httpStatus: status });
        }
        lastIssues = `gateway error ${status}`;
        continue;
      }

      const data = await resp.json();
      const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
      if (!tc?.function?.arguments) {
        lastIssues = "no tool call returned";
        continue;
      }
      let parsed: any;
      try {
        parsed = JSON.parse(tc.function.arguments);
      } catch {
        lastIssues = "unparseable tool arguments";
        continue;
      }
      const v = validateExercise(parsed);
      if (v.ok && v.value) return v.value;
      lastIssues = v.issues.join("; ");
      console.log(`[gen-coding] validation failed (attempt ${attempt}):`, lastIssues);
    } catch (e: any) {
      if (e?.httpStatus) throw e; // 429/402 propagate to the caller verbatim
      console.error(`[gen-coding] attempt ${attempt} error:`, e?.message ?? e);
      lastIssues = e?.message ?? "unknown error";
    }
  }
  return null;
}

async function run(req: Request): Promise<{ status: number; payload: unknown }> {
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
  const weekNumber = Number(body?.week_number);
  const count = Number(body?.count ?? 1);
  const languageRaw = asStr(body?.language).toLowerCase() || "python";
  const hint = asStr(body?.hint) || null;

  if (!courseId || !Number.isInteger(weekNumber) || weekNumber < 1) {
    return { status: 400, payload: { error: "course_id and week_number (>= 1) are required" } };
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_PER_REQUEST) {
    return { status: 400, payload: { error: `count must be an integer between 1 and ${MAX_PER_REQUEST}` } };
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
    .select("id, name, teacher_id, objectives, coding_access_status")
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

  // ─── Guards: coding access + coding week + concepts ───
  if ((course as any).coding_access_status !== "approved") {
    return {
      status: 400,
      payload: { error: "Coding exercises require admin-approved coding access for this course." },
    };
  }

  const { data: weekRow } = await admin
    .from("lesson_plan_weeks")
    .select("week_name, overview, concepts, is_coding_week")
    .eq("course_id", courseId)
    .eq("week_number", weekNumber)
    .maybeSingle();
  if (!weekRow) {
    return { status: 400, payload: { error: `No lesson-plan week ${weekNumber} for this course` } };
  }
  if (!(weekRow as any).is_coding_week) {
    return { status: 400, payload: { error: "Coding exercises can only be generated for coding/lab weeks" } };
  }
  const conceptNames: string[] = Array.isArray(weekRow.concepts)
    ? (weekRow.concepts as any[]).map((c) => asStr(c?.name)).filter(Boolean)
    : [];
  if (conceptNames.length === 0) {
    return { status: 400, payload: { error: "This week has no concepts. Add concepts first." } };
  }

  // Existing titles/themes go into the avoid list so appends don't duplicate.
  const { data: existing } = await admin
    .from("coding_exercises")
    .select("title, position")
    .eq("course_id", courseId)
    .eq("week_number", weekNumber)
    .order("position", { ascending: true });
  const avoidTitles = (existing ?? []).map((r: any) => asStr(r.title)).filter(Boolean);
  const nextPosition =
    (existing ?? []).reduce((m: number, r: any) => Math.max(m, Number(r.position ?? 0)), -1) + 1;

  // ─── Generate (one exercise per sub-call, parallel) ───
  const prompts = buildPrompts({
    courseName: String(course.name ?? ""),
    courseObjectives: Array.isArray(course.objectives) ? (course.objectives as string[]) : [],
    weekNumber,
    weekName: String((weekRow as any).week_name ?? `Week ${weekNumber}`),
    overview: asStr((weekRow as any).overview),
    conceptNames,
    language,
    avoidTitles,
    hint,
  });

  const results = await Promise.allSettled(
    Array.from({ length: count }, () =>
      generateOne(lovableKey, prompts, { teacher_id: userId, course_id: courseId, week: weekNumber })),
  );

  const quotaError = results.find(
    (r) => r.status === "rejected" && (r.reason as any)?.httpStatus,
  ) as PromiseRejectedResult | undefined;
  const exercises: GeneratedExercise[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) exercises.push(r.value);
  }

  if (exercises.length === 0) {
    if (quotaError) {
      const e = quotaError.reason as any;
      return { status: e.httpStatus, payload: { error: e.message } };
    }
    return {
      status: 502,
      payload: { error: "The AI could not produce a valid exercise. Try again, or reduce the quantity." },
    };
  }

  // ─── Persist drafts (append after existing positions) ───
  const publicRows = exercises.map((ex, i) => ({
    course_id: courseId,
    week_number: weekNumber,
    position: nextPosition + i,
    title: ex.title,
    problem_statement: ex.problem_statement,
    language,
    input_spec: ex.input_spec,
    output_spec: ex.output_spec,
    constraints: ex.constraints,
    examples: ex.examples,
    standard_test_cases: ex.standard_test_cases,
    published: false,
    teacher_id: userId,
  }));

  const { data: inserted, error: insErr } = await admin
    .from("coding_exercises")
    .insert(publicRows)
    .select("id");
  if (insErr || !inserted) {
    console.error("[gen-coding] insert failed:", insErr);
    return { status: 500, payload: { error: "Failed to save generated exercises" } };
  }

  const privateRows = inserted.map((row: any, i: number) => ({
    exercise_id: row.id,
    reference_solution: exercises[i].reference_solution,
    hidden_test_cases: exercises[i].hidden_test_cases,
  }));
  const { error: privErr } = await admin.from("coding_exercise_private").insert(privateRows);
  if (privErr) {
    console.error("[gen-coding] private insert failed:", privErr);
    // Roll back the public rows so no exercise exists without its solution/tests.
    await admin.from("coding_exercises").delete().in("id", inserted.map((r: any) => r.id));
    return { status: 500, payload: { error: "Failed to save generated exercises" } };
  }

  return {
    status: 200,
    payload: {
      generated: exercises.length,
      requested: count,
      total_for_week: avoidTitles.length + exercises.length,
      week_number: weekNumber,
      language,
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
  // enough to hit the Edge Runtime's 150s IDLE_TIMEOUT. Final frame is
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
        const { status, payload } = await run(req);
        write({ type: "result", status, payload });
      } catch (e: any) {
        console.error("generate-coding-exercises error:", e);
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
