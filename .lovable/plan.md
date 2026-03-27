

## Plan: Fix Course Collaborators Widget

### Root Causes
1. **No foreign key** from `course_teachers.teacher_id` to `profiles.id` — the Supabase `.select("..., profiles(name)")` join silently returns null for the profile data.
2. **Owner has no row** in `course_teachers` — the component checks `mapped.find(c => c.teacher_id === user.id)` to determine ownership, but the course owner only exists in `courses.teacher_id`, not in `course_teachers`.

### Fix

#### 1. Database migration
Add a foreign key from `course_teachers.teacher_id` to `profiles.id`:
```sql
ALTER TABLE public.course_teachers
  ADD CONSTRAINT course_teachers_teacher_id_fkey
  FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
```

#### 2. Update `src/components/CourseCollaborators.tsx`
- Instead of relying on the owner being in `course_teachers`, determine ownership by querying the `courses` table (`courses.teacher_id === user.id`) or checking `currentCourse` from AppContext.
- Fetch the owner's profile separately and prepend them to the collaborator list with role "owner".
- This way the owner always appears in the list and `isOwner` is set correctly.

**Revised logic:**
```typescript
// Determine ownership from courses table or AppContext
const { currentCourse } = useApp();
const isOwner = user?.id === currentCourse?.teacher_id;
// OR fetch from courses table if teacher_id not in currentCourse
```

- Fetch owner profile from `profiles` table and display as first collaborator
- Fetch `course_teachers` rows (these are all collaborators) with the profile join (now works with FK)
- Combine: `[ownerRow, ...collaboratorRows]`

### Files Modified
1. New migration SQL (add FK)
2. `src/components/CourseCollaborators.tsx`

