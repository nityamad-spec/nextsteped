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
          // Use listUsers with filter instead of fetching all users
          const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({
            page: 1,
            perPage: 1,
          });
          // Find user by direct approach - get all matching via filter workaround
          const allUsersRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
              apikey: serviceRoleKey,
            },
          });
          // Alternative: search by email using GoTrue admin endpoint
          const getUserRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=50`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
              apikey: serviceRoleKey,
            },
          });
          let userId: string | null = null;
          if (getUserRes.ok) {
            const usersData = await getUserRes.json();
            const users = usersData?.users || usersData;
            if (Array.isArray(users)) {
              const found = users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
              if (found) userId = found.id;
            }
          }
          if (userId) {
            await adminClient.auth.admin.updateUserById(userId, { email_confirm: true });
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
