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

    const { applicationId, assignmentType, courseId, action } = await req.json();

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
        })
        .eq("id", applicationId);

      return new Response(
        JSON.stringify({ message: "Application rejected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "approve") {
      const tempPassword = crypto.randomUUID().slice(0, 16) + "!Aa1";

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: application.email,
        password: tempPassword,
        email_confirm: false,
        user_metadata: { name: application.name, role: "teacher" },
      });

      if (createError) throw createError;

      const { error: profileError } = await adminClient
        .from("profiles")
        .insert({
          id: newUser.user.id,
          name: application.name,
          role: "teacher",
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

      // Send password reset email
      await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: application.email,
      });

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
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
