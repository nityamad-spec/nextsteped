

## Plan: Respect Supabase "Disable Signups" as Primary Gate

### Context
Supabase Auth has a built-in setting to disable all new signups at the infrastructure level. The admin's role-level and course-level toggles (teacher signups, per-course enrollment) should act as **secondary** controls that never override this primary setting.

### Approach
When the Auth page loads in signup mode, check if Supabase signups are actually enabled by attempting a lightweight probe. The simplest reliable method: read the `admin_settings` table for a new key `signups_disabled_notice` that the system checks, **and** attempt to detect the Supabase-level block when `signUp()` returns a specific error.

Since we cannot query the Supabase Auth config from the client, the two realistic options are:

1. **Catch at signup time** — When Supabase signups are disabled, `supabase.auth.signUp()` returns an error like "Signups not allowed for this instance". Detect this error and show a clear message. The admin toggles become irrelevant because the signup call itself fails.

2. **Admin dashboard notice** — Add an info banner on the Settings tab reminding admins that the backend signup setting takes precedence over in-app toggles.

### Changes

**1. `src/pages/Auth.tsx`**
- In `handleSubmit`, when `signUp()` or teacher application insert returns an error containing "Signups not allowed" or "signup_disabled", show a specific toast: "All signups are currently disabled by the system administrator."
- This ensures even if admin toggles say "enabled", the Supabase-level block is respected and communicated clearly.

**2. `src/pages/admin/AdminDashboard.tsx`**
- Add an info callout on the Settings tab: "Note: If signups are disabled at the backend level (Cloud Auth settings), these toggles will have no effect — all signups will be blocked regardless."
- This makes the hierarchy explicit to the admin.

**3. `src/contexts/AuthContext.tsx`**
- In the `signUp` function, detect the "signups not allowed" error specifically and return a distinct error message so the Auth page can differentiate it from other errors.

### Files Modified
- `src/pages/Auth.tsx` — handle signup-disabled error distinctly
- `src/pages/admin/AdminDashboard.tsx` — add info banner on Settings tab
- `src/contexts/AuthContext.tsx` — detect and surface signup-disabled error

### No database changes needed
The Supabase Auth "disable signups" setting is managed through Cloud Auth settings, not the database.

