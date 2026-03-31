import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  email: z.string().email("Invalid email address").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
  name: z.string().trim().min(1, "Name is required").max(200),
  enrollment_code: z.string().trim().min(1, "Enrollment code is required").max(50),
});

const MAX_ATTEMPTS_PER_HOUR = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstError = Object.values(fieldErrors).flat()[0] || "Invalid input";
      return new Response(JSON.stringify({ error: firstError }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, name, enrollment_code } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // --- Per-email rate limiting ---
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await adminClient
      .from("signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email", email.toLowerCase())
      .gte("attempted_at", oneHourAgo);

    if (countError) {
      console.error("Rate limit check error:", countError);
    }

    if ((count ?? 0) >= MAX_ATTEMPTS_PER_HOUR) {
      return new Response(
        JSON.stringify({ error: "Too many signup attempts for this email. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record the attempt
    await adminClient.from("signup_attempts").insert({ email: email.toLowerCase() });

    // --- Verify enrollment code ---
    const { data: course, error: courseError } = await adminClient
      .from("courses")
      .select("id, name, course_code, enrollment_open")
      .eq("enrollment_code", enrollment_code)
      .eq("published", true)
      .limit(1)
      .maybeSingle();

    if (courseError) throw courseError;

    if (!course) {
      return new Response(
        JSON.stringify({ error: "Invalid enrollment code. Please check with your instructor." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!course.enrollment_open) {
      return new Response(
        JSON.stringify({ error: "Enrollment is closed for this course. Please contact your instructor." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Create user via admin API (bypasses IP rate limits) ---
    // --- Create user with auto-confirm (enrollment code already proves legitimacy) ---
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: "student", enrollment_code },
    });

    if (createError) {
      if (createError.message?.toLowerCase().includes("already been registered") ||
          createError.message?.toLowerCase().includes("already exists")) {
        return new Response(
          JSON.stringify({ error: "An account with this email already exists. Please sign in instead." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw createError;
    }

    // --- Sign in immediately to return session tokens ---
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
      // Account created but sign-in failed — user can still sign in manually
      return new Response(
        JSON.stringify({ message: "Account created successfully. Please sign in.", user_id: newUser.user.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        user: tokenData.user,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("student-signup error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
