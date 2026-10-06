/** Shared helpers for course job sources: URL safety checks and auth. */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** Returns the caller's user id when they teach the course, else null. */
export async function requireCourseTeacher(
  req: Request,
  admin: SupabaseClient,
  courseId: string,
): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: ok } = await admin.rpc("is_course_member", { _course_id: courseId, _user_id: data.user.id });
  return ok ? data.user.id : null;
}

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v.includes(":")) {
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") ||
      v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
  }
  const p = v.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Throws a readable error when a URL is not https or points to a private network. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Enter a valid link.");
  }
  if (u.protocol !== "https:") throw new Error("Only https links are allowed.");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Local or private network addresses are not allowed.");
  }
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    if (isPrivateIp(host.replace(/^\[|\]$/g, ""))) throw new Error("Local or private network addresses are not allowed.");
    return u;
  }
  const ips: string[] = [];
  for (const t of ["A", "AAAA"] as const) {
    try {
      ips.push(...(await Deno.resolveDns(host, t)));
    } catch { /* no record */ }
  }
  if (ips.length === 0) throw new Error("That site could not be found.");
  if (ips.some(isPrivateIp)) throw new Error("Local or private network addresses are not allowed.");
  return u;
}
