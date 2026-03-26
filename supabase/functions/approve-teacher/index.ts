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

    // Check admin role using service role client
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

    // Get the application
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
      // Generate a random temporary password
      const tempPassword = crypto.randomUUID().slice(0, 16) + "!Aa1";

      // Create auth user (email_confirm: false triggers verification email)
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: application.email,
        password: tempPassword,
        email_confirm: false,
        user_metadata: { name: application.name, role: "teacher" },
      });

      if (createError) throw createError;

      // Create profile
      const { error: profileError } = await adminClient
        .from("profiles")
        .insert({
          id: newUser.user.id,
          name: application.name,
          role: "teacher",
        });

      if (profileError) throw profileError;

      // If assigning as collaborator to existing course
      if (assignmentType === "collaborator" && courseId) {
        const { error: ctError } = await adminClient
          .from("course_teachers")
          .insert({
            course_id: courseId,
            teacher_id: newUser.user.id,
            role: "collaborator",
          });

        if (ctError) throw ctError;
      }

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

      // Send password reset email so teacher can set their own password
      const { error: resetError } = await adminClient.auth.admin.generateLink({
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
