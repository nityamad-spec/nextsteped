## Goal
In `/admin/setup-debug` → Audit Log tab, replace the truncated `course_id` in the "Course" column with the course name (admin has select access on `courses`). User email already shown.

## Changes — `src/components/admin/WipeAuditTab.tsx`

1. Add `courseName?: string | null` to `WipeRow`.
2. In `load()`, after fetching `wipe_audit_log`:
   - Collect distinct `course_id`s
   - `supabase.from("courses").select("id, name").in("id", courseIds)` → `nameById` map
   - Enrich rows with `courseName: nameById.get(r.course_id) ?? null`
3. Course cell: render `r.courseName ?? <span className="font-mono">{r.course_id.slice(0,8)}…</span>`, keep `title={r.course_id}` for hover.
4. Extend `matches()` filter to include `r.courseName ?? ""`.
5. Update filter placeholder to `"Filter by course / user / error / id…"`.

No schema, RLS, or backend changes. Admin-initiated wipes use the same lookup so admin email + course name both render.