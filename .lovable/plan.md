

## Plan: Per-Course Enrollment Control + Global Teacher Application Toggle

### Overview
Give the admin two controls:
1. **Per-course student enrollment toggle** — close/open enrollment for individual courses
2. **Global teacher application toggle** — disable/enable the teacher signup form entirely

### Database Changes

**1. Add `enrollment_open` column to `courses` table**
- `enrollment_open boolean NOT NULL DEFAULT true`
- Courses with `enrollment_open = false` reject new student signups using that enrollment code

**2. Create `admin_settings` table for global flags**
```
admin_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
)
```
- Seed with row: `key = 'teacher_signups_enabled'`, `value = 'true'`
- RLS: admins can read/write, authenticated can read

### Frontend Changes

**3. Auth page (`src/pages/Auth.tsx`)**
- When verifying enrollment code, also check `enrollment_open = true` — show "Enrollment is closed for this course" if false
- When rendering teacher signup form, fetch `admin_settings` for `teacher_signups_enabled` — if `'false'`, show a message like "Teacher registrations are currently closed" and disable the form

**4. Admin Dashboard (`src/pages/admin/AdminDashboard.tsx`)**
- Add a new "Settings" tab with:
  - **Teacher Applications toggle**: Switch to enable/disable teacher signups globally (reads/writes `admin_settings`)
  - **Course Enrollment table**: List all courses with a toggle switch per course to open/close enrollment (updates `courses.enrollment_open`)

### Files Modified
- 1 migration (add column + create table + seed + RLS)
- `src/pages/Auth.tsx` — enrollment code verification + teacher signup gate
- `src/pages/admin/AdminDashboard.tsx` — new Settings tab with toggles

