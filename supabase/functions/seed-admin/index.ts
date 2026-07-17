/**
 * seed-admin
 *
 * Purpose:
 *   One-time bootstrap for the built-in admin account. Idempotent — safe to
 *   invoke repeatedly; ensures both the auth user and profile row exist.
 *
 * Auth / Access:
 *   Public (protected by obscurity + service role); no user JWT required.
 *
 * Steps:
 *   1. List existing auth users and look for the admin email.
 *   2. If the user exists but has no profile, insert the admin profile and return.
 *   3. If the user exists with a profile, return "already exists".
 *   4. Otherwise create the auth user with email_confirm=true and insert the profile.
 *
 * Side effects:
 *   auth.users create, profiles insert.
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const email = "admin@nextstep.ai";
    const password = "admin@3465";

    // Check if admin already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingAdmin = existingUsers?.users?.find((u) => u.email === email);

    if (existingAdmin) {
      // Ensure profile exists
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("id", existingAdmin.id)
        .maybeSingle();

      if (!existingProfile) {
        const { error: pErr } = await adminClient.from("profiles").insert({
          id: existingAdmin.id,
          name: "Admin",
          role: "admin",
        });
        if (pErr) throw pErr;
        return new Response(
          JSON.stringify({ message: "Admin profile created for existing user" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ message: "Admin account already exists" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin auth user with confirmed email
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: "Admin", role: "admin" },
    });

    if (createError) throw createError;

    // Create admin profile
    const { error: profileError } = await adminClient
      .from("profiles")
      .insert({
        id: newUser.user.id,
        name: "Admin",
        role: "admin",
      });

    if (profileError) throw profileError;

    return new Response(
      JSON.stringify({ message: "Admin account created successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
