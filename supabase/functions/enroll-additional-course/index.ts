// Allows an already-signed-in student to enroll in another course
// using an enrollment code. Validates the code, creates the enrollment,
// updates active_course_id, and returns the course id so the client can
// route to the per-course diagnostic.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  enrollment_code: z.string().trim().min(1).max(50),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Enrollment code is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: claimsData.claims.sub as string };

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is a student
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "student") {
      return new Response(JSON.stringify({ error: "Only students can enroll." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate code
    const { data: course } = await adminClient
      .from("courses")
      .select("id, name, enrollment_open, published")
      .eq("enrollment_code", parsed.data.enrollment_code.trim())
      .maybeSingle();
    if (!course || !course.published) {
      return new Response(JSON.stringify({ error: "Invalid enrollment code." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!course.enrollment_open) {
      return new Response(JSON.stringify({ error: "Enrollment is closed for this course." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Already enrolled?
    const { data: existing } = await adminClient
      .from("enrollments")
      .select("id")
      .eq("student_id", user.id)
      .eq("course_id", course.id)
      .maybeSingle();
    if (existing) {
      // Still set active so dashboard switches to it
      await adminClient.from("profiles").update({ active_course_id: course.id }).eq("id", user.id);
      return new Response(
        JSON.stringify({ ok: true, course_id: course.id, course_name: course.name, already_enrolled: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: enrollError } = await adminClient
      .from("enrollments")
      .insert({ student_id: user.id, course_id: course.id });
    if (enrollError) {
      console.error("enroll insert error:", enrollError);
      throw enrollError;
    }

    await adminClient.from("profiles").update({ active_course_id: course.id }).eq("id", user.id);

    return new Response(
      JSON.stringify({ ok: true, course_id: course.id, course_name: course.name }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("enroll-additional-course error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
