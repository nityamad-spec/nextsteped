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
        await adminClient.from("profiles").insert({
          id: existingAdmin.id,
          name: "Admin",
          role: "admin",
        });
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
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
