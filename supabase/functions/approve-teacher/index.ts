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

    // Verify caller is admin
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
      .from("profiles")
      .select("role")
      .eq("id", adminId)
      .single();

    if (adminProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { applicationId, assignmentType, courseId, action, rejectionReason } = await req.json();

    if (!applicationId || !action) {
      return new Response(JSON.stringify({ error: "Missing applicationId or action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: application, error: appError } = await adminClient
      .from("teacher_applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (application.status !== "pending") {
      return new Response(JSON.stringify({ error: "Application already processed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reject") {
      await adminClient
        .from("teacher_applications")
        .update({
          status: "rejected",
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminId,
          rejection_reason: rejectionReason ?? null,
        })
        .eq("id", applicationId);

      return new Response(
        JSON.stringify({ message: "Application rejected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "approve") {
      // Determine the redirect URL for the invite link from the caller's origin
      const origin = req.headers.get("origin") ?? req.headers.get("referer")?.replace(/\/$/, "") ?? "";
      const redirectTo = origin ? `${origin}/reset-password` : undefined;

      // Invite user — this creates the account AND sends an invite email
      const { data: newUser, error: createError } = await adminClient.auth.admin.inviteUserByEmail(
        application.email,
        { data: { name: application.name, role: "teacher" }, redirectTo }
      );

      if (createError) throw createError;

      const { error: profileError } = await adminClient
        .from("profiles")
        .insert({
          id: newUser.user.id,
          name: application.name,
          role: "teacher",
          email: application.email,
          institution: application.institution ?? null,
          department: application.department ?? null,
          designation: application.designation ?? null,
          needs_password_setup: true,
        });

      if (profileError) throw profileError;

      // Handle different assignment types
      if (assignmentType === "collaborator" && courseId) {
        // Add as collaborator to existing course
        const { error: ctError } = await adminClient
          .from("course_teachers")
          .insert({
            course_id: courseId,
            teacher_id: newUser.user.id,
            role: "collaborator",
          });
        if (ctError) throw ctError;

        // Pre-select this course so first sign-in lands on its dashboard
        await adminClient
          .from("profiles")
          .update({ active_course_id: courseId })
          .eq("id", newUser.user.id);

      } else if (assignmentType === "owner_swap" && courseId) {
        // Get current course owner
        const { data: course, error: courseError } = await adminClient
          .from("courses")
          .select("teacher_id")
          .eq("id", courseId)
          .single();

        if (courseError || !course) throw new Error("Course not found");

        const oldOwnerId = course.teacher_id;

        // Update courses.teacher_id to the new teacher
        const { error: updateCourseError } = await adminClient
          .from("courses")
          .update({ teacher_id: newUser.user.id })
          .eq("id", courseId);
        if (updateCourseError) throw updateCourseError;

        // Demote old owner to collaborator in course_teachers
        // First delete any existing row, then insert as collaborator
        await adminClient
          .from("course_teachers")
          .delete()
          .eq("course_id", courseId)
          .eq("teacher_id", oldOwnerId);

        const { error: demoteError } = await adminClient
          .from("course_teachers")
          .insert({
            course_id: courseId,
            teacher_id: oldOwnerId,
            role: "collaborator",
          });
        if (demoteError) throw demoteError;

        // Add new teacher as owner in course_teachers
        const { error: newOwnerError } = await adminClient
          .from("course_teachers")
          .insert({
            course_id: courseId,
            teacher_id: newUser.user.id,
            role: "owner",
          });
        if (newOwnerError) throw newOwnerError;
      }
      // assignmentType === "new_course" requires no additional action — teacher creates their own course later

      // Update application status
      await adminClient
        .from("teacher_applications")
        .update({
          status: "approved",
          assignment_type: assignmentType || "new_course",
          assigned_course_id: courseId || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminId,
        })
        .eq("id", applicationId);

      // Invite email is sent automatically by inviteUserByEmail above

      return new Response(
        JSON.stringify({ 
          message: "Teacher approved and account created",
          userId: newUser.user.id 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
