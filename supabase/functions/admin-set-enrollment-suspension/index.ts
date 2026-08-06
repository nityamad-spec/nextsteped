/**
 * admin-set-enrollment-suspension
 *
 * Purpose:
 *   Admin endpoint to suspend or reactivate a student's access to ONE course
 *   without touching their other enrollments or their ability to sign in.
 *
 * Auth / Access:
 *   Bearer token of an admin (checked against profiles.role = 'admin').
 *
 * Inputs:
 *   - student_id: uuid
 *   - course_id: uuid
 *   - suspended: boolean  (true = suspend, false = reactivate)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  student_id: z.string().uuid(),
  course_id: z.string().uuid(),
  suspended: z.boolean(),
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const callerId = claimsData.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .maybeSingle();
    if (callerProfile?.role !== "admin") return json({ error: "Forbidden — admin only" }, 403);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, 400);
    }
    const { student_id, course_id, suspended } = parsed.data;

    const { data: enrollment, error: eErr } = await admin
      .from("enrollments")
      .select("id")
      .eq("student_id", student_id)
      .eq("course_id", course_id)
      .maybeSingle();
    if (eErr) return json({ error: eErr.message }, 500);
    if (!enrollment) return json({ error: "Student is not enrolled in this course" }, 404);

    const suspended_at = suspended ? new Date().toISOString() : null;
    const suspended_by = suspended ? callerId : null;

    const { error: upErr } = await admin
      .from("enrollments")
      .update({ suspended_at, suspended_by })
      .eq("id", enrollment.id);
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ ok: true, suspended_at }, 200);
  } catch (err: any) {
    console.error("admin-set-enrollment-suspension error:", err);
    return json({ error: err?.message ?? "Unknown error" }, 500);
  }
});
