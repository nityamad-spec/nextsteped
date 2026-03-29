

## Plan: Add Roll Number and Email to Profiles Table

### Problem
The student onboarding form collects a roll number but never persists it. Email is available from the auth user but not stored in the profiles table for easy querying.

### Changes

**1. Database migration** — Add two columns to `profiles`
```sql
ALTER TABLE public.profiles ADD COLUMN roll_number text;
ALTER TABLE public.profiles ADD COLUMN email text;
```

**2. `src/pages/student/StudentOnboarding.tsx`**
- Include `roll_number` and `email` (from `user.email`) in the `profiles.upsert()` call
- No UI changes needed — roll number input and email already exist

### Files Modified
- 1 database migration
- `src/pages/student/StudentOnboarding.tsx`

