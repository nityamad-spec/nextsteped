/**
 * _shared/ai-log.ts
 *
 * Single persistent logger for Lovable AI Gateway calls made from edge
 * functions. Writes one row per gateway attempt into `ai_gateway_call_log`
 * (admin-visible in the AI Gateway Calls tab).
 *
 * Contract:
 *   - Fire-and-forget: never throws into the request path.
 *   - No-ops silently when the service-role credentials are absent.
 *   - Same row shape for every function: one helper, one shape.
 *
 * NOT used for the student / professor TA chat paths (`chat`,
 * `classify-question`, `_shared/rag-retrieve.ts`) by product decision.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let _logClient: ReturnType<typeof createClient> | null = null;
function logClient() {
  if (_logClient) return _logClient;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  _logClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _logClient;
}

export type LogOutcome =
  | "ok"
  | "retryable"
  | "client_error"
  | "timeout"
  | "network_error"
  | "aborted";

export function classifyOutcome(
  status: number | null,
  err: unknown,
): LogOutcome {
  if (status != null) {
    if (status >= 200 && status < 300) return "ok";
    if (status === 429 || status >= 500) return "retryable";
    return "client_error";
  }
  const msg = (err instanceof Error ? err.message : String(err ?? ""))
    .toLowerCase();
  if (
    msg.includes("abort") || msg.includes("timeout") ||
    msg.includes("timed out")
  ) {
    return "timeout";
  }
  return "network_error";
}

export interface LogRow {
  model?: string | null;
  purpose?: string | null;
  http_status?: number | null;
  outcome: LogOutcome;
  attempt?: number | null;
  total_attempts?: number | null;
  duration_ms?: number | null;
  request_id?: string | null;
  teacher_id?: string | null;
  course_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  context?: Record<string, unknown>;
}

/**
 * Persist one gateway attempt. `functionName` identifies the edge function.
 */
export function logGatewayCall(functionName: string, row: LogRow) {
  try {
    const c = logClient();
    if (!c) return;
    const payload = {
      function_name: functionName,
      model: row.model ?? null,
      purpose: row.purpose ?? null,
      http_status: row.http_status ?? null,
      outcome: row.outcome,
      attempt: row.attempt ?? null,
      total_attempts: row.total_attempts ?? null,
      duration_ms: row.duration_ms ?? null,
      request_id: row.request_id ?? null,
      teacher_id: row.teacher_id ?? null,
      course_id: row.course_id ?? null,
      error_code: row.error_code ?? null,
      error_message: row.error_message ? row.error_message.slice(0, 500) : null,
      context: row.context ?? {},
    };
    const p = (c.from("ai_gateway_call_log") as unknown as {
      insert: (v: unknown) => PromiseLike<{ error: unknown }>;
    }).insert(payload).then(
      ({ error }: { error: unknown }) => {
        if (error) {
          console.error(
            "ai_gateway_call_log insert failed:",
            (error as { message?: string })?.message,
          );
        }
      },
    );
    const edgeRuntime = (globalThis as {
      EdgeRuntime?: { waitUntil?: (p: PromiseLike<unknown>) => void };
    }).EdgeRuntime;
    edgeRuntime?.waitUntil?.(p);
  } catch (e) {
    console.error("ai_gateway_call_log threw:", e);
  }
}

/**
 * Convenience wrapper: times a gateway fetch, logs the outcome, and returns
 * the Response. Errors are logged then re-thrown so callers keep their own
 * retry/fallback behaviour.
 */
export async function loggedGatewayFetch(
  functionName: string,
  meta: Omit<LogRow, "outcome" | "http_status" | "duration_ms">,
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const started = Date.now();
  try {
    const response = await fetch(input, init);
    let errorText: string | null = null;
    if (!response.ok) {
      try {
        errorText = (await response.clone().text()).slice(0, 500);
      } catch {
        /* ignore */
      }
    }
    logGatewayCall(functionName, {
      ...meta,
      http_status: response.status,
      outcome: classifyOutcome(response.status, null),
      duration_ms: Date.now() - started,
      error_message: errorText ?? meta.error_message ?? null,
      error_code: response.ok ? (meta.error_code ?? null) : String(response.status),
    });
    return response;
  } catch (e) {
    logGatewayCall(functionName, {
      ...meta,
      http_status: null,
      outcome: classifyOutcome(null, e),
      duration_ms: Date.now() - started,
      error_message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
