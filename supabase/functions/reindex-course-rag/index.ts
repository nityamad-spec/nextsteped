/**
 * reindex-course-rag
 *
 * Backfill helper: re-runs `ingest-rag-document` for every PDF in a course.
 * Callable by a teacher of the course or an admin.
 *
 * Body: { course_id: string }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CONCURRENCY = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      token,
    );
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const { course_id } = await req.json().catch(() => ({}));
    if (!course_id) {
      return new Response(
        JSON.stringify({ error: "course_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: isMember } = await admin.rpc("is_course_member", {
      _course_id: course_id,
      _user_id: userId,
    });
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (!isMember && profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: files, error: filesErr } = await admin
      .from("course_material_files")
      .select("id, file_name")
      .eq("course_id", course_id);
    if (filesErr) throw filesErr;

    const pdfs = (files ?? []).filter((f) =>
      f.file_name.toLowerCase().endsWith(".pdf")
    );

    let ok = 0;
    let failed = 0;
    const results: Array<{ file_id: string; ok: boolean; error?: string }> = [];

    // Simple concurrency window.
    let cursor = 0;
    async function worker() {
      while (cursor < pdfs.length) {
        const idx = cursor++;
        const f = pdfs[idx];
        try {
          const { error } = await admin.functions.invoke(
            "ingest-rag-document",
            { body: { file_id: f.id } },
          );
          if (error) throw error;
          ok++;
          results.push({ file_id: f.id, ok: true });
        } catch (e) {
          failed++;
          results.push({
            file_id: f.id,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pdfs.length) }, () => worker()),
    );

    return new Response(
      JSON.stringify({ total: pdfs.length, ok, failed, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("reindex-course-rag error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
