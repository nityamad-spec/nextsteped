/**
 * _shared/judge0.ts — server-side Judge0 execution + judge-style output
 * comparison (mirrors src/lib/codingExerciseTestRun.ts normalizeOutput).
 */

export const JUDGE0_LANGUAGE_IDS: Record<string, number> = {
  python: 71, // Python 3.8
  cpp: 54, // C++ (GCC 9)
  java: 62, // Java (OpenJDK 13)
  javascript: 63, // JavaScript (Node 12)
};

export const RUNTIME_VERSIONS: Record<string, string> = {
  python: "Python 3.8",
  cpp: "C++ (GCC 9, C++17)",
  java: "Java (OpenJDK 13), public class Main",
  javascript: "JavaScript (Node.js 12)",
};

export interface Judge0Result {
  statusId: number | null;
  status: string;
  stdout: string;
  stderr: string;
  compileOutput: string;
  message: string;
}

export class Judge0Error extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function resolveBase(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  return {
    base: `${url.origin}${url.pathname === "/" ? "" : url.pathname}`,
    isRapidApi: url.hostname.endsWith("rapidapi.com"),
    host: url.hostname,
  };
}

const enc = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const dec = (s?: string | null) => {
  if (!s) return "";
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
};

export async function runOnJudge0(language: string, code: string, stdin: string): Promise<Judge0Result> {
  const apiKey = Deno.env.get("JUDGE0_API_KEY");
  const apiHost = Deno.env.get("JUDGE0_API_HOST");
  if (!apiKey || !apiHost) throw new Judge0Error("Code execution is not configured yet.");
  const languageId = JUDGE0_LANGUAGE_IDS[language.toLowerCase()];
  if (!languageId) throw new Judge0Error(`Unsupported language: ${language}`);

  const { base, isRapidApi, host } = resolveBase(apiHost);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isRapidApi) {
    headers["X-RapidAPI-Key"] = apiKey;
    headers["X-RapidAPI-Host"] = host;
  } else {
    headers["X-Auth-Token"] = apiKey;
  }

  const submit = await fetch(`${base}/submissions?base64_encoded=true&wait=false`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      language_id: languageId,
      source_code: enc(code),
      stdin: stdin ? enc(stdin) : undefined,
      cpu_time_limit: 10,
    }),
  });
  if (!submit.ok) {
    await submit.text().catch(() => "");
    if (submit.status === 429) throw new Judge0Error("Code execution quota reached. Try again shortly.");
    throw new Judge0Error(`Code execution service error (HTTP ${submit.status}).`);
  }
  const { token } = (await submit.json()) as { token?: string };
  if (!token) throw new Judge0Error("Code execution service error.");

  for (let i = 0; i < 20; i++) {
    await sleep(700);
    const res = await fetch(`${base}/submissions/${token}?base64_encoded=true`, { headers });
    if (!res.ok) {
      await res.text().catch(() => "");
      continue;
    }
    const d = (await res.json()) as Record<string, any>;
    const statusId = d?.status?.id ?? 0;
    if (statusId >= 3) {
      return {
        statusId,
        status: d?.status?.description ?? "Finished",
        stdout: dec(d.stdout),
        stderr: dec(d.stderr),
        compileOutput: dec(d.compile_output),
        message: dec(d.message),
      };
    }
  }
  throw new Judge0Error("Execution timed out.");
}

export function normalizeOutput(s: string): string {
  return (s ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

export function judgePassed(r: Judge0Result, expected: string): boolean {
  return judgeVerdict(r, expected) === "passed";
}

export type Verdict =
  | "passed" | "wrong_answer" | "no_output" | "runtime_error" | "compile_error" | "time_limit" | "error";

export function judgeVerdict(r: Judge0Result, expected: string): Verdict {
  const id = r.statusId;
  if (id === 6 || r.compileOutput.trim()) return "compile_error";
  if (id === 5) return "time_limit";
  if (typeof id === "number" && id >= 7 && id <= 12) return "runtime_error";
  if (typeof id === "number" && id !== 3) return "error";
  if (r.stderr.trim()) return "runtime_error";
  if (normalizeOutput(r.stdout) === normalizeOutput(expected)) return "passed";
  return normalizeOutput(r.stdout) === "" ? "no_output" : "wrong_answer";
}
