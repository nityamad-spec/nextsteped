/**
 * run-code
 *
 * Purpose:
 *   Execute student code from the practice coding terminal using Judge0.
 *
 * Auth / Access:
 *   Bearer user JWT required.
 *
 * Inputs:
 *   - language: "python" | "cpp" | "java" | "javascript"
 *   - code: string (source)
 *   - stdin?: string
 *
 * External calls:
 *   Judge0 (RapidAPI or self-hosted) via JUDGE0_API_HOST / JUDGE0_API_KEY.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_CODE_CHARS = 50_000;
const MAX_STDIN_CHARS = 10_000;
const POLL_ATTEMPTS = 20;
const POLL_DELAY_MS = 700;

/** Judge0 CE language ids. */
const LANGUAGE_IDS: Record<string, number> = {
  python: 71, // Python 3.8
  cpp: 54, // C++ (GCC 9)
  java: 62, // Java (OpenJDK 13)
  javascript: 63, // JavaScript (Node 12)
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Accepts a bare host ("judge0-ce.p.rapidapi.com") or a full URL. */
function resolveBase(raw: string): { base: string; isRapidApi: boolean; host: string } {
  const trimmed = raw.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  return {
    base: `${url.origin}${url.pathname === "/" ? "" : url.pathname}`,
    isRapidApi: url.hostname.endsWith("rapidapi.com"),
    host: url.hostname,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return jsonResp({ error: "Missing authorization" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonResp({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("JUDGE0_API_KEY");
    const apiHost = Deno.env.get("JUDGE0_API_HOST");
    if (!apiKey || !apiHost) {
      return jsonResp({ error: "Code execution is not configured yet." }, 503);
    }

    const body = (await req.json().catch(() => ({}))) as {
      language?: string;
      code?: string;
      stdin?: string;
    };

    const languageId = LANGUAGE_IDS[(body.language ?? "").toLowerCase()];
    if (!languageId) return jsonResp({ error: "Unsupported language" }, 400);

    const code = (body.code ?? "").slice(0, MAX_CODE_CHARS);
    if (!code.trim()) return jsonResp({ error: "No code to run" }, 400);
    const stdin = (body.stdin ?? "").slice(0, MAX_STDIN_CHARS);

    const { base, isRapidApi, host } = resolveBase(apiHost);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isRapidApi) {
      headers["X-RapidAPI-Key"] = apiKey;
      headers["X-RapidAPI-Host"] = host;
    } else {
      headers["X-Auth-Token"] = apiKey;
    }

    // Submit (base64 avoids encoding issues with non-ASCII source).
    const enc = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
    const dec = (s?: string | null) => {
      if (!s) return "";
      try {
        return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
      } catch {
        return "";
      }
    };

    const submitRes = await fetch(`${base}/submissions?base64_encoded=true&wait=false`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        language_id: languageId,
        source_code: enc(code),
        stdin: stdin ? enc(stdin) : undefined,
        cpu_time_limit: 10,
      }),
    });

    if (!submitRes.ok) {
      const text = await submitRes.text();
      console.error("judge0 submit failed", submitRes.status, text.slice(0, 500));
      if (submitRes.status === 401 || submitRes.status === 403) {
        return jsonResp({ error: "Code execution credentials were rejected." }, 502);
      }
      if (submitRes.status === 429) {
        return jsonResp({ error: "Code execution quota reached. Try again shortly." }, 429);
      }
      return jsonResp({ error: "Code execution service error." }, 502);
    }

    const { token } = (await submitRes.json()) as { token?: string };
    if (!token) return jsonResp({ error: "Code execution service error." }, 502);

    // Poll for the result.
    let result: Record<string, unknown> | null = null;
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      await sleep(POLL_DELAY_MS);
      const res = await fetch(`${base}/submissions/${token}?base64_encoded=true`, { headers });
      if (!res.ok) continue;
      const data = (await res.json()) as Record<string, any>;
      const statusId = data?.status?.id ?? 0;
      if (statusId >= 3) {
        result = data;
        break;
      }
    }

    if (!result) return jsonResp({ error: "Execution timed out. Try simplifying your code." }, 504);

    const statusDesc = (result as any)?.status?.description ?? "Finished";
    return jsonResp({
      status: statusDesc,
      statusId: (result as any)?.status?.id ?? null,
      stdout: dec((result as any).stdout),
      stderr: dec((result as any).stderr),
      compileOutput: dec((result as any).compile_output),
      message: dec((result as any).message),
      time: (result as any).time ?? null,
      memory: (result as any).memory ?? null,
    });
  } catch (e) {
    console.error("run-code error", e);
    return jsonResp({ error: "Unexpected error running your code." }, 500);
  }
});
