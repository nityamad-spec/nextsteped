/**
 * admin-set-student-suspension
 *
 * Purpose:
 *   Admin endpoint to suspend or reactivate a student account without
 *   deleting any data. When suspending, revokes any active auth sessions.
 *
 * Auth / Access:
 *   Bearer token of an admin (checked against profiles.role = 'admin').
 *
 * Inputs:
 *   - user_id: uuid
 *   - suspended: boolean  (true = suspend, false = reactivate)
 *
 * Steps:
 *   1. Validate caller is admin.
 *   2. Validate body; confirm target is a student profile.
 *   3. Update profiles.suspended_at + suspended_by.
 *   4. On suspend, sign the user out globally to invalidate active sessions.
 *   5. Return the new state.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  user_id: z.string().uuid(),
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
    const { user_id, suspended } = parsed.data;
    if (user_id === callerId) return json({ error: "You cannot suspend your own account" }, 400);

    const { data: target, error: tErr } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", user_id)
      .maybeSingle();
    if (tErr) return json({ error: tErr.message }, 500);
    if (!target) return json({ error: "User profile not found" }, 404);
    if (target.role === "admin") return json({ error: "Cannot suspend an admin account" }, 400);

    const suspended_at = suspended ? new Date().toISOString() : null;
    const suspended_by = suspended ? callerId : null;

    const { error: upErr } = await admin
      .from("profiles")
      .update({ suspended_at, suspended_by })
      .eq("id", user_id);
    if (upErr) return json({ error: upErr.message }, 500);

    if (suspended) {
      const { error: soErr } = await admin.auth.admin.signOut(user_id, "global");
      if (soErr) console.error("signOut error:", soErr.message);
    }

    return json({ ok: true, suspended_at }, 200);
  } catch (err: any) {
    console.error("admin-set-student-suspension error:", err);
    return json({ error: err?.message ?? "Unknown error" }, 500);
  }
});
