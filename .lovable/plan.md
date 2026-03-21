

## Plan: Add Delete Option for Uploaded Files on Quality Check Page

### Change
**File: `src/pages/teacher/MaterialQualityCheck.tsx`**

1. **Expand the `syllabusFiles` state** to include `storage_path` and `id` — update the `select` query (line 199) to fetch `file_name, storage_path, id` instead of just `file_name`.

2. **Add a delete handler** that:
   - Removes the file from the `course-materials` storage bucket using `supabase.storage.from("course-materials").remove([storagePath])`
   - Deletes the metadata row from `course_material_files` by `id`
   - Updates the local `syllabusFiles` state to remove the deleted entry
   - Shows a toast confirmation

3. **Add a delete button (trash icon)** next to each file in the idle view file list (lines 331-335) — a small ghost button with `Trash2` icon that triggers the delete handler with a confirmation step.

4. **Confirmation**: Use a simple `window.confirm` or inline confirmation to prevent accidental deletion.

### Files Modified
- `src/pages/teacher/MaterialQualityCheck.tsx`

