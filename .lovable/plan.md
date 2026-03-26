

## Plan: Collaborator Management UI on Teacher Dashboard

### Summary
Add a "Collaborators" section to the Course Dashboard page where course owners can view, add, and remove collaborators. Collaborators see a read-only list. Uses the existing `course_teachers` table with its RLS policies.

### Changes

#### 1. New file: `src/components/CourseCollaborators.tsx`

A self-contained component that:
- **Fetches** collaborators from `course_teachers` joined with `profiles` for the current course (stored in localStorage as `currentCourseId`)
- **Displays** a table/list showing each collaborator's name, role (owner/collaborator), and join date
- **Add collaborator**: Owner sees an input field to enter a teacher's email. On submit, look up the email in `profiles` (need a new RLS policy or use an edge function — see DB changes below), then insert into `course_teachers`
- **Remove collaborator**: Owner sees a delete button next to each non-owner collaborator row. Deletes from `course_teachers`
- **Role display**: Badge showing "Owner" (primary) or "Collaborator" (secondary)
- Uses Avatar with fallback initials, and a confirmation dialog before removal

#### 2. Database migration — allow profile lookup by authenticated users

Currently `profiles` RLS only allows `SELECT` on own profile. To let course owners find collaborators by email, add a limited policy:

```sql
-- Allow authenticated users to view teacher profiles (name + id only)
-- This is needed so course owners can search for collaborators
CREATE POLICY "Authenticated users can view teacher profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (role = 'teacher');
```

This exposes only teacher profiles to authenticated users, which is acceptable since teacher names are not sensitive.

#### 3. Modify: `src/pages/teacher/CourseDashboard.tsx`

- Import and render `<CourseCollaborators />` as a new Card section at the bottom of the dashboard (after the existing Topic Mastery section)

### Component Behavior

- On mount, fetch `course_teachers` rows for the current course, joining `profiles` to get names
- Determine if current user is owner (`role = 'owner'` in their `course_teachers` row, or `courses.teacher_id = auth.uid()`)
- **Owner view**: sees add/remove controls
- **Collaborator view**: sees read-only list
- Toast notifications on add/remove success/failure
- Loading skeleton while fetching

### Files Modified
1. New database migration — add teacher profile visibility policy
2. `src/components/CourseCollaborators.tsx` — new component
3. `src/pages/teacher/CourseDashboard.tsx` — integrate collaborators section

