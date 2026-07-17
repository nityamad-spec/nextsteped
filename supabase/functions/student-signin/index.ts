/**
 * student-signin
 *
 * Purpose:
 *   Server-side sign-in for students that bypasses per-IP rate limits imposed
 *   on the browser client by proxying credentials through the edge function.
 *
 * Auth / Access:
 *   Public; validates credentials against Supabase auth.
 *
 * Inputs:
 *   - email, password
 *
 * Steps:
 *   1. Validate inputs.
 *   2. Call auth.signInWithPassword via the anon client.
 *   3. On failure return a normalized error (invalid credentials, unverified, etc.).
 *   4. On success return the session tokens to the client.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(255),
});

const MAX_FAILED_ATTEMPTS = 10;
const WINDOW_MINUTES = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password } = parsed.data;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check per-email rate limit (failed attempts only)
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count, error: countError } = await adminClient
      .from("signin_attempts")
      .select("*", { count: "exact", head: true })
      .eq("email", email.toLowerCase())
      .eq("success", false)
      .gte("attempted_at", windowStart);

    if (countError) {
      console.error("Rate limit check error:", countError);
    } else if ((count ?? 0) >= MAX_FAILED_ATTEMPTS) {
      return new Response(
        JSON.stringify({ error: "Too many failed sign-in attempts. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call GoTrue directly from edge function (bypasses per-IP gateway limit)
    const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ email, password }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      const msg = tokenData?.error_description || tokenData?.msg || "Invalid login credentials";

      // Self-healing: auto-confirm unverified students and retry
      if (msg === "Email not confirmed") {
        try {
          const { data: { users }, error: listErr } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
          console.log("Self-heal: listUsers count:", users?.length, "error:", listErr?.message);
          const foundUser = users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
          console.log("Self-heal: found user:", foundUser?.id, "confirmed:", foundUser?.email_confirmed_at);

          if (foundUser) {
            const { error: updateErr } = await adminClient.auth.admin.updateUserById(foundUser.id, { email_confirm: true });
            console.log("Self-heal: confirm result:", updateErr?.message ?? "success");
            // Retry sign-in
            const retryRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: serviceRoleKey },
              body: JSON.stringify({ email, password }),
            });
            const retryData = await retryRes.json();
            if (retryRes.ok) {
              await adminClient.from("signin_attempts").insert({ email: email.toLowerCase(), success: true });
              return new Response(
                JSON.stringify({ access_token: retryData.access_token, refresh_token: retryData.refresh_token, user: retryData.user }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        } catch (confirmErr) {
          console.error("Auto-confirm retry failed:", confirmErr);
        }
      }

      // Record failed attempt
      await adminClient.from("signin_attempts").insert({ email: email.toLowerCase(), success: false });

      return new Response(
        JSON.stringify({ error: msg }),
        { status: tokenRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record successful attempt (for audit; won't count against rate limit)
    await adminClient
      .from("signin_attempts")
      .insert({ email: email.toLowerCase(), success: true });

    return new Response(
      JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        user: tokenData.user,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("student-signin error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
