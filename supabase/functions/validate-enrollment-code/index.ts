// Public endpoint to validate an enrollment code in real time during signup.
// Returns { valid: true, course: { id, name, course_code } } or { valid: false, error }.
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
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ valid: false, error: "Enrollment code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const code = parsed.data.enrollment_code.trim();
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: course } = await adminClient
      .from("courses")
      .select("id, name, course_code, enrollment_open, published")
      .eq("enrollment_code", code)
      .maybeSingle();

    if (!course) {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid enrollment code. Please check with your instructor." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!course.published) {
      return new Response(
        JSON.stringify({ valid: false, error: "This course isn't open to students yet." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!course.enrollment_open) {
      return new Response(
        JSON.stringify({ valid: false, error: "Enrollment is closed for this course." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ valid: true, course: { id: course.id, name: course.name, course_code: course.course_code } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("validate-enrollment-code error:", err);
    return new Response(
      JSON.stringify({ valid: false, error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
