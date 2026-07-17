/**
 * complete-student-signup
 *
 * Purpose:
 *   Finalizes a student account after email confirmation: creates/updates the
 *   profile row, enrolls the student in the requested course, and clears the
 *   pending_signups holding record.
 *
 * Auth / Access:
 *   verify_jwt = true (see supabase/config.toml). Caller must be the newly
 *   authenticated student.
 *
 * Inputs:
 *   - enrollment_code?: string
 *   - name?, roll_number? — profile fields captured pre-verification
 *
 * Steps:
 *   1. Validate JWT and extract user id/email.
 *   2. Look up any pending_signups row for the email to recover pre-verify data.
 *   3. Upsert the profiles row (role=student, name, roll_number).
 *   4. Resolve the course by enrollment_code; enforce roster allowlist if enabled.
 *   5. Insert an enrollments row (idempotent) and set profiles.active_course_id.
 *   6. Delete the pending_signups row.
 *   7. Return the resolved course id so the client can route to the diagnostic.
 *
 * Side effects:
 *   profiles upsert, enrollments insert, pending_signups delete.
 */

// Called by /reset-password (and the StudentRedirect self-heal path) after a
// student invitee sets their password. Looks up their pending_signups row,
// materializes a profile + enrollment, marks the pending row consumed, and
// returns the course_id so the client can route to the per-course diagnostic.
//
// Safeguards (defense-in-depth — RLS on pending_signups already restricts
// non-admin reads to the caller's own email):
//   1. Caller MUST present a valid Supabase JWT and have a confirmed email.
//   2. The pending row is matched ONLY against the JWT's email — request body
//      is ignored. Clients cannot pass an arbitrary email to claim someone
//      else's pending row.
//   3. If a profile already exists for the caller with role != 'student',
//      we refuse to convert them (prevents a stale pending row from
//      demoting a teacher/admin).
//   4. The pending row is claimed atomically with a conditional UPDATE
//      (consumed_at IS NULL → now()) and `.select()` — only the caller
//      whose UPDATE flips the row proceeds. Concurrent calls cannot both
//      consume the same row.
//   5. The course is re-validated as published + enrollment_open at claim
//      time; a closed course rejects the consumption.
//   6. The idempotent "already consumed" branch only returns enrollment data
//      if the caller already has a `student` profile.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return json(401, { error: "Missing or malformed Authorization header" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticated client (uses caller's JWT) — to identify the user.
    // We deliberately do NOT trust any body field for identity.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json(401, { error: "Not authenticated" });
    }

    const email = (user.email || "").toLowerCase().trim();
    if (!email) {
      return json(400, { error: "User has no email" });
    }

    // Require a verified email. Supabase's invite/verify flow sets
    // email_confirmed_at on first sign-in; without it, an unverified token
    // could try to claim a pending row.
    const emailVerified = !!(user.email_confirmed_at || (user as any).confirmed_at);
    if (!emailVerified) {
      return json(403, { error: "Email is not verified yet." });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Refuse if caller already has a non-student profile ───────────────
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (existingProfile && existingProfile.role && existingProfile.role !== "student") {
      return json(403, {
        error: `This account is registered as a ${existingProfile.role} and cannot be converted to a student.`,
      });
    }

    // ── Idempotent fast path: pending row already consumed ───────────────
    // If there's no unclaimed pending row for this email, return the
    // existing student enrollment (if any). We only do this for callers
    // who already have a student profile — otherwise we'd silently 200
    // for a completely unrelated user.
    const { data: unclaimedPeek } = await adminClient
      .from("pending_signups")
      .select("id")
      .eq("email", email)
      .is("consumed_at", null)
      .maybeSingle();

    if (!unclaimedPeek) {
      if (existingProfile?.role === "student") {
        const { data: existingEnrollment } = await adminClient
          .from("enrollments")
          .select("course_id")
          .eq("student_id", user.id)
          .order("enrolled_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return json(200, { ok: true, course_id: existingEnrollment?.course_id ?? null });
      }
      return json(404, { error: "No pending signup found for this account." });
    }

    // ── Atomic claim ─────────────────────────────────────────────────────
    // Conditional UPDATE: only the row that's still unclaimed flips, and
    // .select() returns the row we actually claimed. If a concurrent call
    // already consumed it, we get back zero rows and bail.
    const { data: claimedRows, error: claimError } = await adminClient
      .from("pending_signups")
      .update({ consumed_at: new Date().toISOString() })
      .eq("email", email)
      .is("consumed_at", null)
      .select("*");

    if (claimError) {
      console.error("pending_signups claim error:", claimError);
      return json(500, { error: "Failed to claim pending signup." });
    }
    if (!claimedRows || claimedRows.length === 0) {
      return json(409, { error: "Pending signup was already consumed." });
    }
    const pending = claimedRows[0];

    // Defensive: confirm the email on the row matches the JWT's email.
    if ((pending.email || "").toLowerCase().trim() !== email) {
      // Should be impossible given the .eq("email", email) filter, but
      // re-roll consumption just in case and refuse.
      await adminClient
        .from("pending_signups")
        .update({ consumed_at: null })
        .eq("id", pending.id);
      return json(403, { error: "Pending signup does not match the signed-in user." });
    }

    if (!pending.course_id) {
      // Roll back the consumption so an admin can fix the row.
      await adminClient
        .from("pending_signups")
        .update({ consumed_at: null })
        .eq("id", pending.id);
      return json(400, { error: "Pending signup has no course." });
    }

    // ── Re-validate course is still open ─────────────────────────────────
    const { data: course } = await adminClient
      .from("courses")
      .select("id, enrollment_open, published")
      .eq("id", pending.course_id)
      .maybeSingle();

    if (!course || !course.published || !course.enrollment_open) {
      // Roll back so the student can retry once the course reopens.
      await adminClient
        .from("pending_signups")
        .update({ consumed_at: null })
        .eq("id", pending.id);
      return json(400, { error: "This course is no longer accepting enrollments." });
    }

    // ── Materialize profile (upsert in case a stub row exists) ───────────
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
      learner_level: "beginner",
      needs_password_setup: false,
      active_course_id: pending.course_id,
    }, { onConflict: "id" });

    if (profileError) {
      console.error("profile upsert error:", profileError);
      // Roll back consumption so a retry can succeed once the underlying
      // issue (e.g. transient DB error) is resolved.
      await adminClient
        .from("pending_signups")
        .update({ consumed_at: null })
        .eq("id", pending.id);
      return json(500, { error: "Failed to create profile." });
    }

    // ── Materialize enrollment ───────────────────────────────────────────
    const { error: enrollError } = await adminClient
      .from("enrollments")
      .upsert({ student_id: user.id, course_id: pending.course_id }, {
        onConflict: "student_id,course_id",
      });
    if (enrollError && !enrollError.message?.includes("duplicate")) {
      console.error("enrollment upsert error:", enrollError);
      // Profile is already created; don't roll back the pending consumption
      // (the profile is the harder-to-undo side-effect). Surface the error
      // so the client can retry — the upsert itself is idempotent.
      return json(500, { error: "Failed to create enrollment." });
    }

    return json(200, { ok: true, course_id: pending.course_id });
  } catch (err: any) {
    console.error("complete-student-signup error:", err);
    return json(500, { error: err.message || "An unexpected error occurred" });
  }
});
