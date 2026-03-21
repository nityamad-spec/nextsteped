

## Plan: Fix Storage RLS Policy for Syllabus Save

### Root Cause
The `course-materials` storage bucket has INSERT, SELECT, and DELETE policies but is **missing an UPDATE policy**. The `handleApproveAndSave` function uses `supabase.storage.upload(path, blob, { upsert: true })`, which requires UPDATE permission when the file already exists. The first save works, but any subsequent save (or re-approval) triggers "new row violates row-level security policy."

### Fix
**Database migration** — Add an UPDATE policy on `storage.objects` for the `course-materials` bucket:

```sql
CREATE POLICY "Users can update own course-materials"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

This follows the exact same pattern as the existing INSERT/SELECT/DELETE policies — scoped to the user's own folder.

### Files Modified
1. **New migration** — adds UPDATE policy on `storage.objects`

