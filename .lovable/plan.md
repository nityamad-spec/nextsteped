## Goal
In `/admin/setup-debug`, the Audit Log tab (and the related Persisted Rows tab, which uses the same Teacher/Course columns) currently shows truncated `teacher_id` and `course_id`. Replace them with the teacher's email (from `profiles.email`, which covers admin actors too) and the course name (from `courses.name`).

## Changes — `src/pages/admin/AdminSetupDebug.tsx`

1. Extend state with two lookup maps:
   - `emailById: Map<string, string | null>`
   - `courseNameById: Map<string, string | null>`
2. In `load()`, after fetching `logs` + `progress`:
   - Collect distinct `teacher_id`s from both arrays → `profiles.select("id, email").in("id", ids)` → build `emailById`.
   - Collect distinct non-null `course_id`s from both arrays → `courses.select("id, name").in("id", ids)` → build `courseNameById`.
   - Store both via `setState`.
3. Audit Log table (lines 187–189): render
   - Teacher cell: `emailById.get(r.teacher_id) ?? <span className="font-mono">{r.teacher_id.slice(0,8)}…</span>`, keep `title={r.teacher_id}`.
   - Course cell: `r.course_id ? (courseNameById.get(r.course_id) ?? <span className="font-mono">{r.course_id.slice(0,8)}…</span>) : "—"`, keep `title={r.course_id}`.
4. Persisted Rows table (lines 270–273): same rendering swap.
5. Filter (`filteredLogs`, `filteredProgress`): also match against resolved email + course name so the search bar still works when typing names/emails.
6. Update placeholder to `"Filter by teacher / course / step / error / request_id / caller…"`.

No backend, schema, RLS, or grants changes — admin already reads `profiles` and `courses`. The same lookup naturally resolves admin emails when admins are the actor.