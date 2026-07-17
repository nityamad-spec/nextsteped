/**
 * resend-teacher-invite
 *
 * Purpose:
 *   Admin endpoint to resend an invite (or recovery) email to an already-approved
 *   teacher who hasn't yet set their password.
 *
 * Auth / Access:
 *   Bearer token of an admin.
 *
 * Inputs:
 *   - applicationId: uuid
 *
 * Steps:
 *   1. Validate admin caller.
 *   2. Load the teacher_applications row; require status === "approved".
 *   3. Call auth.admin.inviteUserByEmail with a redirect to the published reset URL.
 *   4. If invite succeeds, mark profiles.needs_password_setup = true and return.
 *   5. Otherwise fall back to auth.resetPasswordForEmail (recovery email).
 *
 * Side effects:
 *   Sends an email; may update profiles.needs_password_setup.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adminId = claimsData.claims.sub;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: adminProfile } = await adminClient
      .from("profiles").select("role").eq("id", adminId).single();
    if (adminProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { applicationId } = await req.json();
    if (!applicationId) {
      return new Response(JSON.stringify({ error: "Missing applicationId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: application, error: appError } = await adminClient
      .from("teacher_applications").select("*").eq("id", applicationId).single();
    if (appError || !application) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (application.status !== "approved") {
      return new Response(JSON.stringify({ error: "Application is not approved" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Always send teachers to the published app — the caller's Origin/Referer
    // can be the Lovable editor (lovable.dev), which isn't in the auth
    // redirect allow-list and causes the invite to land on lovable.dev.
    const redirectTo = "https://nextsteped.lovable.app/reset-password";

    // Try invite first (works for users who haven't set a password yet)
    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      application.email,
      { data: { name: application.name, role: "teacher" }, redirectTo }
    );

    if (!inviteError) {
      // Mark profile as needing password setup so reset-password page handles correctly
      await adminClient
        .from("profiles")
        .update({ needs_password_setup: true })
        .eq("email", application.email);

      return new Response(
        JSON.stringify({ message: "Invite email resent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback: user already exists/accepted — send a recovery (password reset) email
    const { error: recoveryError } = await adminClient.auth.resetPasswordForEmail(
      application.email,
      { redirectTo }
    );

    if (recoveryError) throw recoveryError;

    return new Response(
      JSON.stringify({ message: "Password reset email sent" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
