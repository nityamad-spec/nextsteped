/**
 * manage-job-sources — add or remove a course's job sources (course teachers only).
 * API keys are stored server-side only and never returned.
 */
import { z } from "https://esm.sh/zod@3.23.8";
import { adminClient, assertSafeUrl, corsHeaders, json, requireCourseTeacher } from "../_shared/job-sources.ts";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    course_id: z.string().uuid(),
    url: z.string().min(1).max(2000),
    name: z.string().max(120).optional().nullable(),
    source_type: z.enum(["api", "feed", "careers"]),
    api_key: z.string().max(2000).optional().nullable(),
  }),
  z.object({ action: z.literal("remove"), course_id: z.string().uuid(), source_id: z.string().uuid() }),
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Invalid request." }, 400);
    const body = parsed.data;
    const admin = adminClient();
    const uid = await requireCourseTeacher(req, admin, body.course_id);
    if (!uid) return json({ error: "Only this course's professors can manage sources." }, 403);

    if (body.action === "remove") {
      const { error } = await admin.from("course_job_sources").delete()
        .eq("id", body.source_id).eq("course_id", body.course_id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    let url: URL;
    try {
      url = await assertSafeUrl(body.url.trim());
    } catch (e) {
      return json({ error: (e as Error).message, field: "url" }, 400);
    }
    const href = url.toString();
    const { data: dup } = await admin.from("course_job_sources").select("id")
      .eq("course_id", body.course_id).eq("url", href).maybeSingle();
    if (dup) return json({ error: "This source is already added.", field: "url" }, 409);

    const key = body.api_key?.trim() || null;
    const name = body.name?.trim() || url.hostname.replace(/^www\./, "");
    const { data: row, error } = await admin.from("course_job_sources").insert({
      course_id: body.course_id, name, url: href, source_type: body.source_type, has_key: !!key,
    }).select("id, course_id, name, url, source_type, active, has_key, created_at").single();
    if (error) return json({ error: error.message }, 500);
    if (key) {
      const { error: kErr } = await admin.from("course_job_source_secrets").insert({ source_id: row.id, api_key: key });
      if (kErr) {
        await admin.from("course_job_sources").delete().eq("id", row.id);
        return json({ error: "Could not save the API key." }, 500);
      }
    }
    return json({ source: row });
  } catch (e) {
    console.error("manage-job-sources", e);
    return json({ error: "Something went wrong." }, 500);
  }
});
