/**
 * enroll-additional-course
 *
 * Purpose:
 *   Lets an already signed-in student join another course via enrollment code,
 *   then switches their active_course_id so the dashboard routes to it.
 *
 * Auth / Access:
 *   Bearer token of a signed-in student.
 *
 * Inputs:
 *   - enrollment_code: string
 *
 * Steps:
 *   1. Validate body with Zod; require Authorization header.
 *   2. Resolve the caller via anon client; require profile.role === "student".
 *   3. Look up the course by enrollment_code; ensure published + enrollment_open.
 *   4. If roster_enforcement, verify the student email is in course_roster_allowlist.
 *   5. If already enrolled, just flip active_course_id and return already_enrolled=true.
 *   6. Otherwise insert enrollments row and update active_course_id.
 *   7. Return the resolved course id + name.
 */

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

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      .select("id, name, enrollment_open, published, roster_enforcement")
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

    // Roster allowlist enforcement
    if (course.roster_enforcement) {
      const userEmail = (user.email ?? "").trim().toLowerCase();
      const { data: allowed } = await adminClient
        .from("course_roster_allowlist")
        .select("id")
        .eq("course_id", course.id)
        .eq("email", userEmail)
        .maybeSingle();
      if (!allowed) {
        return new Response(
          JSON.stringify({ error: "Your email isn't on this course's approved roster. Please contact your instructor." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
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
