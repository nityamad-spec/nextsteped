/**
 * validate-coding-exercise
 *
 * Purpose:
 *   AI quality review of ONE coding exercise. Runs six checks (problem
 *   statement, input spec, output spec, constraints, examples, test cases)
 *   as separate gateway calls so the client can show real per-check progress.
 *   Results are ADVISORY — they never gate publishing.
 *
 * Auth / Access:
 *   Bearer token of a course teacher, collaborator, or admin.
 *
 * Inputs:  { exercise_id: uuid }
 *
 * Response: NDJSON stream — {type:"progress"} per finished check, heartbeat
 * frames while a call is in flight, final {type:"result"|"error"}.
 * The report is persisted on coding_exercise_private (never student-readable).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";

const FUNCTION_NAME = "validate-coding-exercise";
const MODEL = "openai/gpt-5.6-sol";
const PER_CALL_TIMEOUT_MS = 90_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Keep in sync with CODING_VALIDATION_CHECKS in src/lib/codingExercises.ts */
const CHECKS = [
  {
    id: "problem_statement",
    label: "Problem statement",
    instruction:
      "Judge the problem statement only: is it self-contained and unambiguous, does it state the task without relying on the title, and could a student start coding from it alone?",
  },
  {
    id: "input_spec",
    label: "Input specification",
    instruction:
      "Judge the input specification only: is every value the program reads described, with order, types and delimiters clear enough to parse without guessing?",
  },
  {
    id: "output_spec",
    label: "Output specification",
    instruction:
      "Judge the output specification only: is the exact expected format (text, ordering, whitespace/newlines) described, and is it consistent with the worked examples?",
  },
  {
    id: "constraints",
    label: "Constraints",
    instruction:
      "Judge the constraints only: are value ranges/size limits stated and consistent with the examples and test cases? If constraints are genuinely not applicable to this task, return 'warning', not 'fail'.",
  },
  {
    id: "examples",
    label: "Examples",
    instruction:
      "Judge the worked examples only: does each example's output follow from its input under the stated specs, constraints and the reference solution's behaviour?",
  },
  {
    id: "test_cases",
    label: "Test cases",
    instruction:
      "Judge the standard and hidden test cases only: do the inputs conform to the input specification, do the expected outputs match what the reference solution would produce, and do the hidden cases cover meaningful edge cases?",
  },
] as const;

const REPORT_TOOL = {
  type: "function",
  function: {
    name: "report_check",
    description: "Report the outcome of one validation check.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pass", "warning", "fail"] },
        note: {
          type: "string",
          description:
            "One sentence justifying the status. Describe issues without quoting reference-solution code.",
        },
      },
      required: ["status", "note"],
      additionalProperties: false,
    },
  },
};

type CheckStatus = "pass" | "warning" | "fail";
interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  note: string;
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildExerciseContext(ex: any, priv: any): string {
  const fmtCases = (arr: unknown) =>
    Array.isArray(arr) && arr.length
      ? arr
          .map(
            (t: any, i: number) =>
              `  ${i + 1}. input: ${JSON.stringify(t?.input ?? "")}\n     expected_output: ${JSON.stringify(t?.expected_output ?? "")}`,
          )
          .join("\n")
      : "  (none)";
  const fmtExamples = (arr: unknown) =>
    Array.isArray(arr) && arr.length
      ? arr
          .map(
            (e: any, i: number) =>
              `  ${i + 1}. input: ${JSON.stringify(e?.input ?? "")}\n     output: ${JSON.stringify(e?.output ?? "")}${e?.explanation ? `\n     explanation: ${e.explanation}` : ""}`,
          )
          .join("\n")
      : "  (none)";

  return `TITLE: ${asStr(ex.title) || "(untitled)"}
LANGUAGE: ${asStr(ex.language)}

PROBLEM STATEMENT:
${asStr(ex.problem_statement) || "(empty)"}

INPUT SPECIFICATION:
${asStr(ex.input_spec) || "(empty)"}

OUTPUT SPECIFICATION:
${asStr(ex.output_spec) || "(empty)"}

CONSTRAINTS:
${asStr(ex.constraints) || "(none provided)"}

WORKED EXAMPLES:
${fmtExamples(ex.examples)}

STANDARD TEST CASES:
${fmtCases(ex.standard_test_cases)}

HIDDEN / EDGE TEST CASES:
${fmtCases(priv?.hidden_test_cases)}

REFERENCE SOLUTION (${asStr(ex.language)}):
\`\`\`
${asStr(priv?.reference_solution) || "(missing)"}
\`\`\``;
}

/** Runs one check. Retries once on 429/5xx. Never throws — returns a fail note. */
async function runCheck(
  lovableKey: string,
  check: (typeof CHECKS)[number],
  context: string,
  logMeta: { teacher_id: string; course_id: string; exercise_id: string },
): Promise<CheckResult> {
  const system = `You are a strict but fair reviewer of university coding exercises.
You review ONE aspect of an exercise at a time and report via the report_check tool.

Statuses:
- "pass": the aspect is complete, clear and consistent.
- "warning": usable but improvable, or a minor inconsistency.
- "fail": a student would be blocked, misled, or the content is inconsistent/incorrect.

You cannot execute code — reason about the reference solution by reading it.
Never quote reference-solution code in your note.`;

  const user = `${check.instruction}

Ignore every other aspect of the exercise; other checks cover them.

EXERCISE UNDER REVIEW
${context}`;

  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await loggedGatewayFetch(
        FUNCTION_NAME,
        {
          model: MODEL,
          purpose: `validate-${check.id}`,
          attempt,
          total_attempts: 2,
          teacher_id: logMeta.teacher_id,
          course_id: logMeta.course_id,
          context: { exercise_id: logMeta.exercise_id, check: check.id },
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
            // gpt-5.6-sol rejects function tools on /v1/chat/completions
            // unless reasoning is disabled.
            reasoning_effort: "none",
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            tools: [REPORT_TOOL],
            tool_choice: { type: "function", function: { name: "report_check" } },
          }),
        },
      );

      if (!resp.ok) {
        const status = resp.status;
        const errText = await resp.text().catch(() => "");
        console.error(`[validate-coding] ${check.id} gateway ${status}:`, errText.slice(0, 400));
        if (status === 429 || status >= 500) {
          lastError =
            status === 429 ? "Rate limited by the AI gateway." : `AI gateway error (HTTP ${status}).`;
          if (attempt === 1) {
            await sleep(2_000);
            continue;
          }
        } else {
          let msg = `AI gateway rejected the request (HTTP ${status}).`;
          try {
            const parsed = JSON.parse(errText);
            if (typeof parsed?.error?.message === "string" && parsed.error.message) {
              msg = parsed.error.message;
            }
          } catch { /* keep generic */ }
          lastError = msg;
        }
        break;
      }

      const data = await resp.json();
      const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) {
        lastError = "The AI returned no verdict for this check.";
        if (attempt === 1) continue;
        break;
      }
      const parsed = JSON.parse(args);
      const status = ["pass", "warning", "fail"].includes(parsed?.status)
        ? (parsed.status as CheckStatus)
        : "warning";
      return {
        id: check.id,
        label: check.label,
        status,
        note: asStr(parsed?.note) || "No detail provided.",
      };
    } catch (e: any) {
      lastError = e?.message ?? String(e);
      console.error(`[validate-coding] ${check.id} attempt ${attempt} error:`, lastError);
      if (attempt === 1) await sleep(1_000);
    }
  }

  return {
    id: check.id,
    label: check.label,
    status: "warning",
    note: `Check could not be completed: ${lastError || "unknown error"}`,
  };
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

  // ─── Input ───
  const body = await req.json().catch(() => null);
  const exerciseId = typeof body?.exercise_id === "string" ? body.exercise_id.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(exerciseId)) {
    return { status: 400, payload: { error: "exercise_id (uuid) is required" } };
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: exercise } = await admin
    .from("coding_exercises")
    .select(
      "id, course_id, title, language, problem_statement, input_spec, output_spec, constraints, examples, standard_test_cases",
    )
    .eq("id", exerciseId)
    .maybeSingle();
  if (!exercise) return { status: 404, payload: { error: "Exercise not found" } };

  // ─── Authorize: course teacher, collaborator, or admin ───
  const courseId = exercise.course_id as string;
  const { data: course } = await admin
    .from("courses")
    .select("teacher_id")
    .eq("id", courseId)
    .maybeSingle();
  let allowed = course?.teacher_id === userId;
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

  const { data: priv } = await admin
    .from("coding_exercise_private")
    .select("reference_solution, hidden_test_cases")
    .eq("exercise_id", exerciseId)
    .maybeSingle();

  const context = buildExerciseContext(exercise, priv);

  // ─── Run the checks sequentially so progress is meaningful ───
  const checks: CheckResult[] = [];
  for (let i = 0; i < CHECKS.length; i++) {
    const def = CHECKS[i];
    emit({ type: "progress", step: i, total: CHECKS.length, check: def.id, label: def.label });
    const result = await runCheck(lovableKey, def, context, {
      teacher_id: userId,
      course_id: courseId,
      exercise_id: exerciseId,
    });
    checks.push(result);
    emit({
      type: "progress",
      step: i + 1,
      total: CHECKS.length,
      check: def.id,
      label: def.label,
      status: result.status,
      note: result.note,
    });
  }

  const validatedAt = new Date().toISOString();
  const report = { checks, model: MODEL, validated_at: validatedAt };

  const { error: saveErr } = await admin
    .from("coding_exercise_private")
    .update({ validation_report: report, validated_at: validatedAt })
    .eq("exercise_id", exerciseId);
  if (saveErr) console.error("[validate-coding] save failed:", saveErr);

  return { status: 200, payload: { report } };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const write = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch { /* peer closed */ }
      };

      write({ type: "heartbeat", t: 0, stage: "start" });
      const hb = setInterval(() => write({ type: "heartbeat", t: Date.now() - startedAt }), 20_000);

      try {
        const { status, payload } = await run(req, write);
        write({ type: "result", status, payload });
      } catch (e: any) {
        console.error("validate-coding-exercise error:", e);
        write({ type: "error", status: 500, message: e?.message ?? String(e) });
      } finally {
        clearInterval(hb);
        closed = true;
        try {
          controller.close();
        } catch { /* ignore */ }
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
