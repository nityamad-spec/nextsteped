/**
 * One-off backfill: ingest all currently-published lesson plans into rag_chunks.
 *
 * For each course with `lesson_plan_path IS NOT NULL`:
 *   1. Find (or create) the course_material_files row where
 *      folder_type='lesson-plan-published' AND storage_path = lesson_plan_path.
 *   2. Invoke the `ingest-rag-document` edge function with that file_id.
 *
 * Concurrency = 3 to match reindex-course-rag.
 *
 * Run with:
 *   deno run -A scripts/backfill-lesson-plan-rag.ts
 *
 * Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  Deno.exit(1);
}

const CONCURRENCY = 3;
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

type CourseRow = {
  id: string;
  name: string | null;
  teacher_id: string;
  lesson_plan_path: string;
};

async function ensureFileRow(course: CourseRow): Promise<string | null> {
  const { data: existing } = await admin
    .from("course_material_files")
    .select("id")
    .eq("course_id", course.id)
    .eq("storage_path", course.lesson_plan_path)
    .maybeSingle();
  if (existing?.id) return existing.id;

  // Get file size from storage.
  const parts = course.lesson_plan_path.split("/");
  const fileName = parts[parts.length - 1] || "published-plan.json";
  const dir = parts.slice(0, -1).join("/");
  const { data: listing } = await admin.storage
    .from("course-materials")
    .list(dir, { limit: 100, search: fileName });
  const meta = listing?.find((f) => f.name === fileName);
  const size = meta?.metadata?.size ?? 0;

  const { data: inserted, error } = await admin
    .from("course_material_files")
    .insert({
      course_id: course.id,
      teacher_id: course.teacher_id,
      storage_path: course.lesson_plan_path,
      file_name: fileName,
      file_size: size,
      folder_type: "lesson-plan-published",
    })
    .select("id")
    .maybeSingle();
  if (error || !inserted?.id) {
    console.warn(`  ⚠️  ${course.id}: failed to create file row: ${error?.message}`);
    return null;
  }
  return inserted.id;
}

async function ingest(fileId: string): Promise<{ ok: boolean; body: unknown }> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/ingest-rag-document`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file_id: fileId }),
  });
  const body = await resp.json().catch(() => ({}));
  return { ok: resp.ok, body };
}

async function main() {
  const { data: courses, error } = await admin
    .from("courses")
    .select("id, name, teacher_id, lesson_plan_path")
    .not("lesson_plan_path", "is", null);
  if (error) throw error;

  const rows = (courses ?? []) as CourseRow[];
  console.log(`Found ${rows.length} courses with published lesson plans.\n`);

  const results: Array<{ course: string; ok: boolean; note: string }> = [];
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const idx = cursor++;
      const c = rows[idx];
      const label = `${c.name || c.id}`;
      try {
        const fileId = await ensureFileRow(c);
        if (!fileId) {
          results.push({ course: label, ok: false, note: "no file row" });
          continue;
        }
        const { ok, body } = await ingest(fileId);
        const note = JSON.stringify(body);
        results.push({ course: label, ok, note });
        console.log(`${ok ? "✅" : "❌"} ${label}: ${note}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ course: label, ok: false, note: msg });
        console.log(`❌ ${label}: ${msg}`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker()),
  );

  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  console.log(`\nDone. ok=${ok}, failed=${failed}, total=${results.length}`);
}

main().catch((e) => {
  console.error(e);
  Deno.exit(1);
});
