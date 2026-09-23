/**
 * regenerate-reference-solution
 *
 * Writes a brand-new reference solution for ONE coding exercise from its
 * specs, executes it on Judge0 against every example + standard + hidden test
 * case, retries once with failing-case feedback, then runs an AI review of
 * input/output format and constraints adherence. Nothing is persisted — the
 * professor accepts the result in the dialog and saves normally.
 *
 * Auth: Bearer token of the course owner, a collaborator, or an admin.
 * Input: { course_id: uuid, week_number?: number, draft: ExerciseDraft }
 * Response: NDJSON — progress / heartbeat / result / error frames.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";
import { judgePassed, Judge0Error, RUNTIME_VERSIONS, runOnJudge0 } from "../_shared/judge0.ts";

const FUNCTION_NAME = "regenerate-reference-solution";
const MODEL = "openai/gpt-6-astra";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const Case = z.object({ input: z.string().max(10_000), expected_output: z.string().max(10_000) });
const Example = z.object({
  input: z.string().max(10_000),
  output: z.string().max(10_000),
  explanation: z.string().max(5_000).nullable().optional(),
});
const BodySchema = z.object({
  course_id: z.string().uuid(),
  week_number: z.number().int().min(0).max(100).nullable().optional(),
  draft: z.object({
    title: z.string().max(500),
    problem_statement: z.string().min(1).max(20_000),
    language: z.enum(["python", "cpp", "java", "javascript"]),
    input_spec: z.string().min(1).max(10_000),
    output_spec: z.string().min(1).max(10_000),
    constraints: z.string().max(10_000).nullable(),
    examples: z.array(Example).max(20),
    starter_code: z.string().max(50_000).nullable().optional(),
    standard_test_cases: z.array(Case).max(30),
    hidden_test_cases: z.array(Case).max(30),
    reference_solution: z.string().max(50_000).optional(),
  }),
});
type Draft = z.infer<typeof BodySchema>["draft"];

/** Keep in sync with SOLUTION_CHECKS in src/lib/codingExercises.ts */
const SOLUTION_CHECKS = [
  { id: "reads_input", label: "Reads input exactly as specified" },
  { id: "prints_output", label: "Prints output exactly as specified" },
  { id: "constraints", label: "Respects the constraints" },
  { id: "no_extra_io", label: "No extra prompts or prints" },
  { id: "course_level", label: "Uses only what the course has taught" },
] as const;

interface CaseResult {
  kind: "example" | "standard" | "hidden";
  index: number;
  input: string;
  expected: string;
  actual: string;
  status: string;
  message: string;
  passed: boolean;
}

class GatewayError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fmtList(label: string, arr: { input: string; expected: string }[]) {
  if (!arr.length) return `${label}:\n  (none)`;
  return `${label}:\n${arr
    .map((c, i) => `  ${i + 1}. stdin: ${JSON.stringify(c.input)}\n     expected stdout: ${JSON.stringify(c.expected)}`)
    .join("\n")}`;
}

function collectCases(d: Draft) {
  return [
    ...d.examples.map((e, i) => ({ kind: "example" as const, index: i + 1, input: e.input ?? "", expected: e.output ?? "" })),
    ...d.standard_test_cases.map((t, i) => ({ kind: "standard" as const, index: i + 1, input: t.input, expected: t.expected_output })),
    ...d.hidden_test_cases.map((t, i) => ({ kind: "hidden" as const, index: i + 1, input: t.input, expected: t.expected_output })),
  ];
}

function specContext(d: Draft, week: { name: string; concepts: string[] } | null) {
  const cases = collectCases(d);
  return `LANGUAGE / RUNTIME: ${RUNTIME_VERSIONS[d.language]} — do not use syntax or library features newer than this runtime.
TITLE: ${d.title || "(untitled)"}
${week ? `COURSE WEEK: ${week.name}\nCONCEPTS STUDENTS HAVE LEARNED THIS WEEK: ${week.concepts.join(", ") || "(not listed)"}\n` : ""}
PROBLEM STATEMENT:
${d.problem_statement}

INPUT SPECIFICATION (stdin):
${d.input_spec}

OUTPUT SPECIFICATION (stdout):
${d.output_spec}

CONSTRAINTS:
${d.constraints?.trim() || "(none stated)"}

${fmtList("WORKED EXAMPLES", cases.filter((c) => c.kind === "example"))}

${fmtList("STANDARD TEST CASES", cases.filter((c) => c.kind === "standard"))}

${fmtList("HIDDEN / EDGE TEST CASES", cases.filter((c) => c.kind === "hidden"))}

STARTER CODE (keep its structure, function names and entry point):
\`\`\`
${d.starter_code?.trim() || "(none)"}
\`\`\``;
}

/** Streams one /v1/responses call with a strict JSON schema; returns parsed JSON. */
async function callResponses(
  key: string,
  purpose: string,
  logMeta: Record<string, unknown>,
  instructions: string,
  input: string,
  schemaName: string,
  schema: Record<string, unknown>,
): Promise<any> {
  let lastErr: GatewayError | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const resp = await loggedGatewayFetch(
      FUNCTION_NAME,
      { model: MODEL, purpose, attempt, total_attempts: 2, ...logMeta } as any,
      "https://ai.gateway.lovable.dev/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: MODEL,
          instructions,
          input,
          stream: true,
          store: false,
          reasoning: { effort: "medium" },
          text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
        }),
      },
    );
    if (!resp.ok || !resp.body) {
      const status = resp.status;
      const text = await resp.text().catch(() => "");
      let msg = `AI gateway error (HTTP ${status}).`;
      try {
        const p = JSON.parse(text);
        if (typeof p?.error?.message === "string") msg = p.error.message;
        else if (typeof p?.message === "string") msg = p.message;
      } catch { /* keep */ }
      lastErr = new GatewayError(msg, status);
      if ((status === 429 || status >= 500) && attempt === 1) {
        await sleep(3_000);
        continue;
      }
      throw lastErr;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let out = "";
    let completedText = "";
    let failed: string | null = null;
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
        let ev: any;
        try {
          ev = JSON.parse(data);
        } catch {
          continue;
        }
        if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") out += ev.delta;
        else if (ev.type === "response.completed") {
          const items = ev.response?.output ?? [];
          for (const it of items) {
            for (const c of it?.content ?? []) if (c?.type === "output_text") completedText += c.text ?? "";
          }
        } else if (ev.type === "response.failed" || ev.type === "error") {
          failed = ev.response?.error?.message ?? ev.error?.message ?? ev.message ?? "AI request failed.";
        }
      }
    }
    if (failed) throw new GatewayError(failed, 500);
    const text = (out || completedText).trim();
    if (!text) throw new GatewayError("The AI returned an empty answer.", 500);
    return JSON.parse(text);
  }
  throw lastErr ?? new GatewayError("AI request failed.", 500);
}

const SOLUTION_SCHEMA = {
  type: "object",
  properties: { solution: { type: "string" }, notes: { type: "string" } },
  required: ["solution", "notes"],
  additionalProperties: false,
};

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    checks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", enum: SOLUTION_CHECKS.map((c) => c.id) },
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
};

const GEN_RULES = `You write reference solutions for university coding exercises. They are executed automatically and compared to expected stdout.
Hard rules:
- Complete, runnable program. Read ALL input from standard input exactly in the order/format of the input specification.
- Never print prompts (e.g. no input("Enter...") text), debug output, or anything besides the answer.
- Match the output specification exactly: casing, spacing, separators, decimal places, one value per line, etc.
- Handle every constraint bound and edge case (empty input, boundaries, large values) efficiently.
- Must produce the expected stdout for EVERY example and test case listed.
- Keep the starter code's structure and names; add the entry point that reads stdin and prints.
- Use only language features available in the stated runtime, and only concepts appropriate for the course week.
- For Java, the public class must be named Main.
- No placeholder comments or TODOs. Short clarifying comments are fine.
Return JSON: { "solution": <source code only, no markdown fences>, "notes": <one sentence on the approach> }.`;

function stripFences(code: string) {
  const m = code.match(/^```[a-zA-Z0-9+#]*\n([\s\S]*?)\n?```\s*$/);
  return (m ? m[1] : code).trim() + "\n";
}

async function runAll(
  d: Draft,
  code: string,
  onCase: (done: number, total: number, kind: CaseResult["kind"]) => void,
): Promise<CaseResult[]> {
  const cases = collectCases(d);
  const results: CaseResult[] = new Array(cases.length);
  let cursor = 0;
  let done = 0;
  const worker = async () => {
    while (cursor < cases.length) {
      const i = cursor++;
      const c = cases[i];
      const r = await runOnJudge0(d.language, code, c.input);
      results[i] = {
        ...c,
        actual: r.stdout,
        status: r.status,
        message: r.compileOutput || r.stderr || r.message || "",
        passed: judgePassed(r, c.expected),
      };
      done += 1;
      onCase(done, cases.length, c.kind);
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, cases.length) }, () => worker()));
  return results;
}

async function run(req: Request, emit: (o: unknown) => void): Promise<{ status: number; payload: unknown }> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { status: 401, payload: { error: "Not authenticated" } };
  const { data: userData, error: userErr } = await admin.auth.getUser(authHeader.slice(7));
  if (userErr || !userData?.user) return { status: 401, payload: { error: "Not authenticated" } };
  const userId = userData.user.id;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return { status: 400, payload: { error: "Invalid request", details: parsed.error.flatten().fieldErrors } };
  }
  const { course_id: courseId, week_number, draft } = parsed.data;

  const { data: course } = await admin.from("courses").select("teacher_id").eq("id", courseId).maybeSingle();
  if (!course) return { status: 404, payload: { error: "Course not found" } };
  let allowed = course.teacher_id === userId;
  if (!allowed) {
    const { data: ct } = await admin
      .from("course_teachers").select("teacher_id").eq("course_id", courseId).eq("teacher_id", userId).maybeSingle();
    allowed = !!ct;
  }
  if (!allowed) {
    const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    allowed = prof?.role === "admin";
  }
  if (!allowed) return { status: 403, payload: { error: "Forbidden" } };

  if (collectCases(draft).length === 0) {
    return { status: 400, payload: { error: "Add at least one example or test case first." } };
  }

  let week: { name: string; concepts: string[] } | null = null;
  if (typeof week_number === "number") {
    const { data: w } = await admin
      .from("lesson_plan_weeks").select("week_name, concepts").eq("course_id", courseId).eq("week_number", week_number).maybeSingle();
    if (w) {
      const concepts = Array.isArray(w.concepts)
        ? (w.concepts as any[]).map((c) => (typeof c === "string" ? c : c?.name)).filter(Boolean)
        : [];
      week = { name: w.week_name, concepts };
    }
  }

  const ctx = specContext(draft, week);
  const logMeta = { teacher_id: userId, course_id: courseId, context: { title: draft.title } };
  const total = collectCases(draft).length;

  const progress = (stage: string, label: string, extra: Record<string, unknown> = {}) =>
    emit({ type: "progress", stage, label, ...extra });

  // ─── Generate + run (one retry with failing cases) ───
  let solution = "";
  let notes = "";
  let results: CaseResult[] = [];
  let attempts = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    attempts = attempt;
    progress("writing", attempt === 1 ? "Writing solution" : "Fixing failing cases");
    let input = `EXERCISE\n${ctx}`;
    if (attempt === 2) {
      const failing = results.filter((r) => !r.passed).slice(0, 8);
      input += `\n\nYOUR PREVIOUS SOLUTION:\n\`\`\`\n${solution}\`\`\`\n\nIT FAILED THESE CASES — fix it so every case passes:\n${failing
        .map(
          (f) =>
            `- ${f.kind} ${f.index}: stdin ${JSON.stringify(f.input)}\n  expected ${JSON.stringify(f.expected)}\n  got ${JSON.stringify(f.actual)}${f.message ? `\n  error: ${f.message.slice(0, 500)}` : ""}`,
        )
        .join("\n")}`;
    }
    const gen = await callResponses(lovableKey, `regen-solution-${attempt}`, logMeta, GEN_RULES, input, "reference_solution", SOLUTION_SCHEMA);
    solution = stripFences(String(gen?.solution ?? ""));
    notes = String(gen?.notes ?? "").trim();
    if (solution.trim().length < 10) throw new GatewayError("The AI returned an empty solution.", 500);

    progress("running", "Running examples and test cases", { completed: 0, total });
    results = await runAll(draft, solution, (done, t, kind) =>
      progress("running", kind === "example" ? "Running examples" : kind === "standard" ? "Running standard tests" : "Running hidden tests", { completed: done, total: t }),
    );
    if (results.every((r) => r.passed)) break;
  }

  // ─── AI format/constraints review ───
  progress("reviewing", "Checking format and constraints");
  let checks: { id: string; label: string; status: "pass" | "warning" | "fail"; note: string }[];
  try {
    const passed = results.filter((r) => r.passed).length;
    const review = await callResponses(
      lovableKey,
      "regen-solution-review",
      logMeta,
      `You review a reference solution for a university coding exercise against its specification. Return one entry per check id: ${SOLUTION_CHECKS.map((c) => `${c.id} (${c.label})`).join("; ")}.
Status: pass = fully adheres; warning = minor risk; fail = violates the spec. One short sentence per note. Never quote the solution code.`,
      `${ctx}\n\nSOLUTION UNDER REVIEW:\n\`\`\`\n${solution}\`\`\`\n\nEXECUTION: ${passed} of ${results.length} examples/test cases produced the exact expected stdout.`,
      "solution_review",
      REVIEW_SCHEMA,
    );
    const byId = new Map<string, any>((review?.checks ?? []).map((c: any) => [c.id, c]));
    checks = SOLUTION_CHECKS.map((c) => {
      const r = byId.get(c.id);
      return {
        id: c.id,
        label: c.label,
        status: ["pass", "warning", "fail"].includes(r?.status) ? r.status : "warning",
        note: String(r?.note ?? "No verdict returned.").trim(),
      };
    });
  } catch (e) {
    if (e instanceof GatewayError && (e.status === 402 || e.status === 403)) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    checks = SOLUTION_CHECKS.map((c) => ({ id: c.id, label: c.label, status: "warning" as const, note: `Review unavailable: ${msg}` }));
  }

  return { status: 200, payload: { result: { solution, notes, cases: results, checks, attempts } } };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const write = (o: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
        } catch { /* closed */ }
      };
      write({ type: "heartbeat", t: 0 });
      const hb = setInterval(() => write({ type: "heartbeat", t: Date.now() - startedAt }), 15_000);
      try {
        const { status, payload } = await run(req, write);
        write({ type: "result", status, payload });
      } catch (e: any) {
        console.error(`${FUNCTION_NAME} error:`, e);
        const status = e instanceof GatewayError ? e.status : e instanceof Judge0Error ? 502 : 500;
        write({ type: "error", status, message: e?.message ?? String(e) });
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
    headers: { ...corsHeaders, "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
});
