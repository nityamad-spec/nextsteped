/**
 * suggest-concept-skills — AI suggests a skill name + level for each untagged
 * concept in a course. Course teachers only. Writes concept_skill_tags; the
 * professor can edit afterwards.
 */
import { z } from "https://esm.sh/zod@3.23.8";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";
import { adminClient, corsHeaders, json, requireCourseTeacher } from "../_shared/job-sources.ts";

const MODEL = "openai/gpt-6-astra";
const Body = z.object({ course_id: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "Invalid request." }, 400);
  const courseId = parsed.data.course_id;
  const admin = adminClient();
  if (!(await requireCourseTeacher(req, admin, courseId))) return json({ error: "Not allowed." }, 403);
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return json({ error: "AI is not configured." }, 500);

  const [{ data: course }, { data: concepts }, { data: tags }] = await Promise.all([
    admin.from("courses").select("name, target_role").eq("id", courseId).maybeSingle(),
    admin.from("concepts").select("id, concept_code").eq("course_id", courseId),
    admin.from("concept_skill_tags").select("concept_id, skill").eq("course_id", courseId),
  ]);
  const tagged = new Set((tags ?? []).map((t: any) => t.concept_id));
  const todo = (concepts ?? []).filter((c: any) => !tagged.has(c.id)).slice(0, 120);
  if (!todo.length) return json({ added: 0 });

  const existingSkills = [...new Set((tags ?? []).map((t: any) => t.skill))];
  const resp = await loggedGatewayFetch(
    "suggest-concept-skills",
    { model: MODEL, purpose: "concept-skill-tags", course_id: courseId },
    "https://ai.gateway.lovable.dev/v1/responses",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, store: false, stream: false, reasoning: { effort: "low" },
        instructions: `You tag course concepts with the employable skill they teach, as job listings would name it (e.g. "SQL", "Python", "Data Visualization", "Statistics", "Excel"). Course: "${(course as any)?.name}", target role: "${(course as any)?.target_role ?? "unspecified"}". Reuse these skill names where they fit: ${existingSkills.join(", ") || "(none)"}. Several concepts may share one skill. Level is how deeply the concept teaches it: basic (intro), working (can apply independently), advanced (complex/production use). Return one tag per concept id.`,
        input: todo.map((c: any) => `${c.id}: ${c.concept_code}`).join("\n"),
        text: { format: { type: "json_schema", name: "skill_tags", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["tags"],
          properties: { tags: { type: "array", items: { type: "object", additionalProperties: false,
            required: ["concept_id", "skill", "level"],
            properties: { concept_id: { type: "string" }, skill: { type: "string" }, level: { type: "string", enum: ["basic", "working", "advanced"] } } } } },
        } } },
      }),
    },
  );
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.error("suggest-concept-skills", resp.status, t.slice(0, 300));
    return json({ error: resp.status === 402 ? "AI credits are exhausted." : resp.status === 429 ? "AI is busy, try again shortly." : "Could not suggest tags." }, resp.status === 402 || resp.status === 429 ? resp.status : 502);
  }
  const data = await resp.json();
  let text = typeof data?.output_text === "string" ? data.output_text : "";
  if (!text && Array.isArray(data?.output)) for (const it of data.output) for (const c of it?.content ?? []) if (typeof c?.text === "string") text += c.text;
  const ids = new Set(todo.map((c: any) => c.id));
  const rows = ((JSON.parse(text).tags ?? []) as any[])
    .filter((t) => ids.has(t.concept_id) && t.skill?.trim())
    .map((t) => ({ concept_id: t.concept_id, course_id: courseId, skill: t.skill.trim().slice(0, 80), level: t.level }));
  if (rows.length) {
    const { error } = await admin.from("concept_skill_tags").upsert(rows, { onConflict: "concept_id" });
    if (error) return json({ error: error.message }, 500);
  }
  return json({ added: rows.length });
});
