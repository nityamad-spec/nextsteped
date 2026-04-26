// Called by /reset-password after a student invitee sets their password.
// Looks up their pending_signups row, materializes a profile + enrollment,
// marks the pending row consumed, and returns the course_id so the client
// can route to the per-course diagnostic.
//
// Auth: requires the caller's JWT (the just-signed-in student).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticated client (uses caller's JWT) — to identify the user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = (user.email || "").toLowerCase();
    if (!email) {
      return new Response(JSON.stringify({ error: "User has no email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find pending row for this email
    const { data: pending } = await adminClient
      .from("pending_signups")
      .select("*")
      .eq("email", email)
      .is("consumed_at", null)
      .maybeSingle();

    if (!pending) {
      // Idempotent: if already consumed, just return existing enrollment
      const { data: existingEnrollment } = await adminClient
        .from("enrollments")
        .select("course_id")
        .eq("student_id", user.id)
        .order("enrolled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return new Response(
        JSON.stringify({ ok: true, course_id: existingEnrollment?.course_id ?? null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Re-validate course is still open (enrollment may have closed since signup)
    if (!pending.course_id) {
      return new Response(JSON.stringify({ error: "Pending signup has no course" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: course } = await adminClient
      .from("courses")
      .select("id, enrollment_open, published")
      .eq("id", pending.course_id)
      .maybeSingle();
    if (!course || !course.published || !course.enrollment_open) {
      return new Response(
        JSON.stringify({ error: "This course is no longer accepting enrollments." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Materialize profile (upsert in case a stub row exists)
    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: user.id,
      email,
      name: pending.name,
      role: "student",
      roll_number: pending.roll_number,
      university_id: pending.university_id,
      degree_id: pending.degree_id,
      branch_id: pending.branch_id,
      graduation_year: pending.graduation_year,
      learner_level: "Beginner",
      needs_password_setup: false,
      active_course_id: pending.course_id,
    }, { onConflict: "id" });

    if (profileError) {
      console.error("profile upsert error:", profileError);
      throw profileError;
    }

    // Materialize enrollment
    const { error: enrollError } = await adminClient
      .from("enrollments")
      .upsert({ student_id: user.id, course_id: pending.course_id }, {
        onConflict: "student_id,course_id",
      });
    if (enrollError) {
      // ignore unique violation
      if (!enrollError.message?.includes("duplicate")) {
        console.error("enrollment upsert error:", enrollError);
        throw enrollError;
      }
    }

    // Mark pending consumed
    await adminClient
      .from("pending_signups")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", pending.id);

    return new Response(
      JSON.stringify({ ok: true, course_id: pending.course_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("complete-student-signup error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
