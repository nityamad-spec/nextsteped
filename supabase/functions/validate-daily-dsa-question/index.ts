/**
 * validate-daily-dsa-question
 *
 * Purpose:
 *   AI quality review of ONE daily-practice (Daily DSA) question. Runs the
 *   six standard checks (problem statement, input spec, output spec,
 *   constraints, examples, test cases) in a single streamed gateway call.
 *   Results are ADVISORY — they never gate publishing.
 *
 * Auth / Access:
 *   Bearer token of a course teacher, collaborator, or admin.
 *
 * Inputs:  { question_id: uuid }
 *
 * Response: NDJSON stream — heartbeat frames while the call is in flight,
 * final {type:"result"|"error"}. The report is persisted on
 * daily_dsa_question_private (never student-readable).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";

const FUNCTION_NAME = "validate-daily-dsa-question";
const MODEL = "openai/gpt-6-astra";

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

function buildQuestionContext(q: any, priv: any): string {
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

  return `TITLE: ${asStr(q.title) || "(untitled)"}
LANGUAGE: ${asStr(q.language)}

PROBLEM STATEMENT:
${asStr(q.problem_statement) || "(empty)"}

INPUT SPECIFICATION:
${asStr(q.input_spec) || "(empty)"}

OUTPUT SPECIFICATION:
${asStr(q.output_spec) || "(empty)"}

CONSTRAINTS:
${asStr(q.constraints) || "(none provided)"}

WORKED EXAMPLES:
${fmtExamples(q.examples)}

STANDARD TEST CASES:
${fmtCases(q.standard_test_cases)}

HIDDEN / EDGE TEST CASES:
${fmtCases(priv?.hidden_test_cases)}

REFERENCE SOLUTION (${asStr(q.language)}):
\`\`\`
${asStr(priv?.reference_solution) || "(missing)"}
\`\`\``;
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
  const questionId = typeof body?.question_id === "string" ? body.question_id.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(questionId)) {
    return { status: 400, payload: { error: "question_id (uuid) is required" } };
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: question } = await admin
    .from("daily_dsa_questions")
    .select(
      "id, course_id, title, language, problem_statement, input_spec, output_spec, constraints, examples, standard_test_cases",
    )
    .eq("id", questionId)
    .maybeSingle();
  if (!question) return { status: 404, payload: { error: "Question not found" } };

  // ─── Authorize: course teacher, collaborator, or admin ───
  const courseId = question.course_id as string;
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
    .from("daily_dsa_question_private")
    .select("reference_solution, hidden_test_cases")
    .eq("question_id", questionId)
    .maybeSingle();

  const context = buildQuestionContext(question, priv);

  for (let i = 0; i < CHECKS.length; i++) {
    emit({ type: "progress", step: i, total: CHECKS.length, check: CHECKS[i].id, label: CHECKS[i].label });
  }

  const instructions = `You are a strict but fair reviewer of university coding exercises.
You review SIX aspects of one exercise and report a verdict for each.

Statuses:
- "pass": the aspect is complete, clear and consistent.
- "warning": usable but improvable, or a minor inconsistency.
- "fail": a student would be blocked, misled, or the content is inconsistent/incorrect.

You cannot execute code — reason about the reference solution by reading it.
Never quote reference-solution code in your notes.

Review exactly these aspects (use these exact ids):
${CHECKS.map((c) => `- ${c.id}: ${c.instruction}`).join("\n")}`;

  const resp = await loggedGatewayFetch(
    FUNCTION_NAME,
    {
      model: MODEL,
      purpose: "validate-daily-dsa-question",
      attempt: 1,
      total_attempts: 1,
      teacher_id: userId,
      course_id: courseId,
      context: { question_id: questionId },
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
        instructions,
        input: `EXERCISE UNDER REVIEW\n${context}`,
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        max_output_tokens: 4000,
        text: {
          format: {
            type: "json_schema",
            name: "validation_report",
            strict: true,
            schema: {
              type: "object",
              properties: {
                checks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", enum: CHECKS.map((c) => c.id) },
                      status: { type: "string", enum: ["pass", "warning", "fail"] },
                      note: { type: "string" },
                    },
                    required: ["id", "status", "note"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["checks"],
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
    console.error(`[validate-daily-dsa] gateway ${status}:`, errText.slice(0, 400));
    let msg = `AI gateway error (HTTP ${status}).`;
    if (status === 429) msg = "Rate limited by the AI gateway. Try again shortly.";
    else if (status === 402) msg = "AI credits exhausted. Add funds in Settings > Workspace > Usage.";
    else {
      try {
        const parsed = JSON.parse(errText);
        if (typeof parsed?.error?.message === "string" && parsed.error.message) msg = parsed.error.message;
      } catch { /* keep generic */ }
    }
    return { status: status === 429 || status === 402 ? status : 502, payload: { error: msg } };
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
        streamError = evt?.response?.error?.message ?? evt?.message ?? "validation failed";
      }
    }
  }
  if (streamError) return { status: 502, payload: { error: streamError } };
  if (!text.trim()) return { status: 502, payload: { error: "The AI returned an empty response" } };

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: 502, payload: { error: "The AI returned an unparseable verdict" } };
  }

  const rawChecks: any[] = Array.isArray(parsed?.checks) ? parsed.checks : [];
  const checks: CheckResult[] = CHECKS.map((def) => {
    const found = rawChecks.find((c) => c?.id === def.id);
    const status: CheckStatus = ["pass", "warning", "fail"].includes(found?.status)
      ? found.status
      : "warning";
    return {
      id: def.id,
      label: def.label,
      status,
      note: asStr(found?.note) || "No detail provided.",
    };
  });

  const validatedAt = new Date().toISOString();
  const report = { checks, model: MODEL, validated_at: validatedAt };

  const { error: saveErr } = await admin
    .from("daily_dsa_question_private")
    .update({ validation_report: report, validated_at: validatedAt })
    .eq("question_id", questionId);
  if (saveErr) console.error("[validate-daily-dsa] save failed:", saveErr);

  for (let i = 0; i < checks.length; i++) {
    emit({
      type: "progress",
      step: i + 1,
      total: checks.length,
      check: checks[i].id,
      label: checks[i].label,
      status: checks[i].status,
      note: checks[i].note,
    });
  }

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
        console.error("validate-daily-dsa-question error:", e);
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
