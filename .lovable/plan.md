# Logging + Admin Debug Screen for `markStepCompleted`

Adds an audit trail for every `markStep*` attempt and an admin-only screen to verify writes and inspect SQL/RLS errors when persistence fails.

## 1. New table `public.setup_progress_log` (migration)

Append-only audit log. Stores attempt outcome plus the Postgres error code/message/details when the upsert is rejected (e.g. RLS denial).

Columns: `id`, `teacher_id`, `course_id` (nullable), `step_id`, `action` (`mark_opened` | `mark_completed`), `success` (bool), `error_code`, `error_message`, `error_details`, `context` (jsonb), `created_at`.

Indexes on `(teacher_id, created_at desc)`, `(created_at desc)`, and a partial index on failures.

RLS:
- Teachers: `INSERT` and `SELECT` rows where `auth.uid() = teacher_id` (so failure logs from RLS-blocked writes still get recorded under the actor).
- Admins: full access via existing `public.is_admin(auth.uid())`.

## 2. Update `src/lib/setupProgress.ts`

Wrap `markStepOpened` and `markStepCompleted` with:
1. `console.info` on success / `console.warn` on failure (tagged `[setupProgress]`).
2. Re-read the row after the upsert (`select … where teacher_id+course_id+step_id`) to detect silent RLS swallows where the upsert returns no error but no row appears.
3. Insert one row into `setup_progress_log` per attempt with the captured Supabase error fields (`code`, `message`, `details`) or a synthetic "row not found after upsert" message when verification fails. Log insert is wrapped in try/catch — logging never throws.

API surface unchanged; all existing call sites work without modification.

## 3. New page `src/pages/admin/AdminSetupDebug.tsx`

Admin-only screen with:
- Three KPI cards: successful writes, failed writes, total persisted rows (last 200 each).
- Filter input (by teacher_id / course_id / step / error text) + "Failures only" toggle.
- Two tabs:
  - **Audit Log** — table over `setup_progress_log`: time, action, step, teacher (truncated), course (truncated), OK/FAIL badge, error code + message + details.
  - **Persisted Rows** — table over `teacher_setup_progress`: teacher, course, step, `opened_at`, `completed_at` (NULL highlighted in muted text, present highlighted in primary).
- Refresh button.

## 4. Wire route + nav

- `src/App.tsx`: add route `<Route path="setup-debug" element={<AdminSetupDebug />} />` under the existing `/admin` `AdminLayout` group.
- `src/layouts/AdminLayout.tsx`: append nav item `{ title: "Setup Debug", url: "/admin/setup-debug", icon: Bug }` to `navItems`.

## Out of scope

- No changes to call sites of `markStepCompleted` (already wired in step pages).
- No retention policy / log pruning (acceptable initially; can be added later as a cron-based delete of rows >30 days).
- Logging is best-effort and asynchronous — it never blocks the original write or surfaces toasts to teachers.
