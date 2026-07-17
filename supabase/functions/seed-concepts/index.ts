/**
 * seed-concepts
 *
 * Purpose:
 *   Development helper that replaces the concepts table for the PWIM demo
 *   course with a canonical list loaded from a JSON payload.
 *
 * Auth / Access:
 *   Not for production use; service-role backed.
 *
 * Inputs:
 *   - fileContent: string | { concepts: [{ concept_id, weight }] }
 *
 * Steps:
 *   1. Parse fileContent and validate that concepts[] exists.
 *   2. Look up the courses row where course_code = "PWIM".
 *   3. Delete all existing concepts rows for that course.
 *   4. Insert new concepts rows (concept_code, weight, course_id).
 *   5. Return the inserted row count.
 */

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
    const { fileContent } = await req.json();
    if (!fileContent) {
      return new Response(JSON.stringify({ error: "fileContent is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = typeof fileContent === "string" ? JSON.parse(fileContent) : fileContent;
    const concepts = parsed.concepts;
    if (!Array.isArray(concepts) || concepts.length === 0) {
      return new Response(JSON.stringify({ error: "No concepts array found in JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Look up PWIM course
    const { data: course, error: courseErr } = await adminClient
      .from("courses")
      .select("id")
      .eq("course_code", "PWIM")
      .single();

    if (courseErr || !course) {
      return new Response(JSON.stringify({ error: "Course with code 'PWIM' not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete existing concepts for this course
    await adminClient.from("concepts").delete().eq("course_id", course.id);

    // Insert new concepts
    const rows = concepts.map((c: { concept_id: string; weight: number }) => ({
      concept_code: c.concept_id,
      weight: c.weight,
      course_id: course.id,
    }));

    const { error: insertErr, count } = await adminClient
      .from("concepts")
      .insert(rows, { count: "exact" });

    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({ message: `Inserted ${count ?? rows.length} concepts for course PWIM` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
