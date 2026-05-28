// Step 2 of new-student onboarding: stage profile + enrollment code in
// pending_signups, then send a verification email via Supabase invite-by-email.
// The invite link redirects the student to /reset-password where they set
// their password, which then triggers `complete-student-signup` to materialize
// the profile + enrollment and clear the pending row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FullSchema = z.object({
  resend: z.literal(false).optional(),
  email: z.string().email().max(255),
  name: z.string().trim().min(1).max(200),
  roll_number: z.string().trim().min(1).max(100),
  university_id: z.string().uuid(),
  degree_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  graduation_year: z.string().trim().min(4).max(4),
  enrollment_code: z.string().trim().min(1).max(50),
  origin: z.string().url().optional(),
});

const ResendSchema = z.object({
  resend: z.literal(true),
  email: z.string().email().max(255),
  origin: z.string().url().optional(),
});

const BodySchema = z.union([ResendSchema, FullSchema]);

const MAX_ATTEMPTS_PER_HOUR = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const data = parsed.data;
    const email = data.email.toLowerCase();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Per-email rate limit ────────────────────────────────────────────
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await adminClient
      .from("signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("attempted_at", oneHourAgo);
    if ((count ?? 0) >= MAX_ATTEMPTS_PER_HOUR) {
      return new Response(
        JSON.stringify({ error: "Too many signup attempts. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    await adminClient.from("signup_attempts").insert({ email });

    // ── Validate enrollment code ────────────────────────────────────────
    const { data: course } = await adminClient
      .from("courses")
      .select("id, name, enrollment_open, published")
      .eq("enrollment_code", data.enrollment_code.trim())
      .maybeSingle();

    if (!course || !course.published) {
      return new Response(
        JSON.stringify({ error: "Invalid enrollment code. Please check with your instructor." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!course.enrollment_open) {
      return new Response(
        JSON.stringify({ error: "Enrollment is closed for this course." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Reject if profile already exists with this email ────────────────
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("email", email)
      .maybeSingle();
    if (existingProfile) {
      const msg = existingProfile.role === "student"
        ? "An account with this email already exists. Please sign in."
        : `This email is registered as a ${existingProfile.role}. Use a different email.`;
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Stage in pending_signups (upsert by email) ──────────────────────
    const { error: stageError } = await adminClient
      .from("pending_signups")
      .upsert({
        email,
        name: data.name,
        roll_number: data.roll_number,
        university_id: data.university_id,
        degree_id: data.degree_id,
        branch_id: data.branch_id,
        graduation_year: data.graduation_year,
        enrollment_code: data.enrollment_code.trim(),
        course_id: course.id,
        consumed_at: null,
      }, { onConflict: "email" });

    if (stageError) {
      console.error("pending_signups upsert error:", stageError);
      throw stageError;
    }

    // ── Send invite/verification email ──────────────────────────────────
    // Supabase invite-by-email = "verify your email AND set a password" in one link.
    // The redirect lands on /reset-password where we detect a student invite,
    // collect a password, then call complete-student-signup.
    const redirectTo = data.origin ? `${data.origin}/reset-password` : undefined;

    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { name: data.name, role: "student", needs_password_setup: true },
      redirectTo,
    });

    if (inviteError) {
      // If user already exists in auth (e.g. re-attempting a verification),
      // generate a fresh recovery link instead so they get a new email.
      if (inviteError.message?.toLowerCase().includes("already") || inviteError.message?.toLowerCase().includes("registered")) {
        const { error: linkError } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo },
        });
        if (linkError) {
          console.error("generateLink error:", linkError);
          throw linkError;
        }
      } else {
        console.error("inviteUserByEmail error:", inviteError);
        throw inviteError;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, email, course_name: course.name }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("student-pending-signup error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
