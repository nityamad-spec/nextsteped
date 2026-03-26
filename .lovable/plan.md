

## Plan: Enhanced Admin Approval with Role Selection and Owner Swapping

### Summary
Redesign the pending application card UI to give the admin explicit control over three assignment options: (1) Collaborator on an existing course, (2) Owner of an existing course (demoting the current owner to collaborator), (3) Owner of a brand new course. The `approve-teacher` edge function is updated to handle the owner-swap logic.

### UI Changes — `src/pages/admin/AdminDashboard.tsx`

Replace the current single course dropdown + implicit role logic with:

1. **Role selector** (Radio group or Select): Three options:
   - "Collaborator on existing course"
   - "Owner of existing course" (swaps current owner to collaborator)
   - "Owner of new course"

2. **Course dropdown**: Shown only when role is "collaborator" or "owner of existing course". Populated from the `courses` table (already fetched). Hidden when "Owner of new course" is selected.

3. **Approve button label** updates dynamically based on selection.

4. Track `selectedRoles` state per application (in addition to `selectedCourses`).

### Edge Function Changes — `supabase/functions/approve-teacher/index.ts`

Add handling for `assignmentType === "owner_swap"`:

1. Create the new teacher's auth account and profile (same as current "approve" flow)
2. Look up the current `courses.teacher_id` for the selected course
3. Update `courses.teacher_id` to the new teacher's ID
4. Update the existing `course_teachers` row for the old owner: change role from `'owner'` to `'collaborator'` (or insert if missing)
5. Insert a `course_teachers` row for the new teacher with role `'owner'`

### Files Modified
1. `src/pages/admin/AdminDashboard.tsx` — add role selector, conditional course dropdown, dynamic button labels
2. `supabase/functions/approve-teacher/index.ts` — add `owner_swap` assignment type with owner demotion logic

