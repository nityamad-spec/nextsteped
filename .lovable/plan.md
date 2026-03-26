

## Plan: Admin Role, Dashboard, and Teacher Approval Flow

### Summary
Introduce an admin role with a dedicated dashboard. Teacher signups go into a "pending approval" state. The admin reviews pending teachers and either approves them (assigning to an existing course as collaborator or allowing new course creation) or rejects them. A default admin account is seeded via migration.

### Database Changes

**1. Create `teacher_applications` table**
Stores pending teacher signup requests before admin approval.

```sql
CREATE TABLE public.teacher_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  assigned_course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  assignment_type text, -- 'collaborator' or 'new_course'
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);

ALTER TABLE public.teacher_applications ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage applications
CREATE POLICY "Admins can manage teacher applications"
  ON public.teacher_applications FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Teachers can view their own application status
CREATE POLICY "Users can view own application"
  ON public.teacher_applications FOR SELECT TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
```

**2. Seed the default admin account**

Use a migration with a PL/pgSQL block to:
- Create an auth user via `auth.users` insert (email: `admin@nextstep.ai`, encrypted password)
- Insert a profile row with `role = 'admin'`

```sql
-- Insert admin user into auth.users and profiles
-- (Uses Supabase's internal auth schema for seeding)
```

Note: Since we cannot directly insert into `auth.users` via a migration safely, we will instead use an edge function or the admin API to create this user on first deploy. Alternatively, the admin account will be created manually and the profile seeded via migration.

**Revised approach**: Create the admin profile row via migration after the admin signs up through the normal auth flow. We will:
1. Enable auto-confirm for this one account
2. Use an edge function `seed-admin` that creates the user via the Supabase Admin API and inserts the profile

### Auth Flow Changes

**Teacher signup flow (modified)**:
1. Teacher fills out signup form as before
2. Instead of creating a Supabase auth account immediately, insert a row into `teacher_applications` with status `pending`
3. Show a "Your application is under review" message
4. No verification email is sent yet

**Admin approval flow**:
1. Admin logs in (normal auth flow, profile role = `admin`)
2. Admin dashboard shows pending teacher applications
3. For each application, admin can:
   - **Approve as collaborator**: Select an existing course, then approve. System creates the auth account, sends verification email, and pre-assigns the teacher to the course
   - **Approve as new course owner**: Approve without assigning. Teacher creates their own course after verifying
   - **Reject**: Mark application as rejected
4. On approval, an edge function creates the teacher's auth account (using service role key) and triggers the verification email

### New Files

1. **`supabase/functions/seed-admin/index.ts`** — One-time edge function to create the default admin account using the Admin API
2. **`supabase/functions/approve-teacher/index.ts`** — Edge function that creates a teacher auth account, profile, and optionally assigns to a course
3. **`src/pages/admin/AdminDashboard.tsx`** — Main admin page showing pending/approved/rejected teacher applications with action buttons
4. **`src/pages/admin/AdminLogin.tsx`** — Admin-specific login (or reuse Auth page with role=admin)
5. **`src/layouts/AdminLayout.tsx`** — Simple layout for admin pages

### Modified Files

1. **`src/pages/Auth.tsx`** — When `role=teacher` and `isLogin=false` (signup): instead of calling `signUp`, insert into `teacher_applications` and show pending message
2. **`src/App.tsx`** — Add admin routes (`/admin`, `/admin/dashboard`), update `AuthRedirect` to handle `admin` role
3. **`src/pages/Landing.tsx`** — Add a subtle admin login link (or access via `/admin` directly)
4. **`src/contexts/AuthContext.tsx`** — No changes needed (admin logs in via normal signIn)

### Component Details: AdminDashboard

- Tabs: Pending | Approved | Rejected
- Each pending card shows: teacher name, email, submitted date
- Action buttons per card:
  - "Approve as Collaborator" — opens a dropdown to select an existing course, then calls `approve-teacher` edge function
  - "Approve as Owner" — calls `approve-teacher` with `assignment_type: 'new_course'`
  - "Reject" — updates status to `rejected`
- Approved/Rejected tabs show historical records

### Edge Function: `approve-teacher`

1. Receives `{ applicationId, assignmentType, courseId? }`
2. Validates caller is admin (check profile role via service role)
3. Creates auth user via `supabase.auth.admin.createUser({ email, password: random, email_confirm: false })`
4. This triggers the verification email automatically
5. Inserts profile row with `role: 'teacher'`
6. If `assignmentType = 'collaborator'`, inserts into `course_teachers`
7. Updates `teacher_applications` status to `approved`

### Security

- `teacher_applications` RLS restricts all writes to admin role
- The `approve-teacher` edge function uses service role key for auth user creation
- Admin role check uses the `profiles.role` column (not localStorage)
- The admin profile policy allows self-select which already exists

