

## Root Cause: Silent Upload Failure in `savePlan`

### Problem
The `savePlan` function (line 146-162 in `TeachingPlan.tsx`) does not check the `error` returned by the Supabase storage `.upload()` call. The Supabase JS client returns `{ data, error }` — it does **not throw** on failure. So even if the upload fails (e.g., due to a storage policy issue or network error), the code falls through to the success toast: "Plan saved". The user sees success, but nothing was actually written.

### Current Code (broken)
```ts
await supabase.storage
  .from("course-materials")
  .upload(`${user.id}/lesson-plan/published-plan.json`, file, { upsert: true });
// ← error is never checked
setHasChanges(false);
toast({ title: "Plan saved" });  // always fires
```

### Fix — `src/pages/teacher/TeachingPlan.tsx`
Destructure the upload response and throw on error so the catch block handles it:

```ts
const { error } = await supabase.storage
  .from("course-materials")
  .upload(`${user.id}/lesson-plan/published-plan.json`, file, { upsert: true });
if (error) throw error;
setHasChanges(false);
toast({ title: "Plan saved", description: "Your lesson plan has been saved successfully." });
```

This is a one-line change: capture the `{ error }` and add an `if (error) throw error` check before showing success. The existing `catch` block already handles the error display.

### Files Modified
- `src/pages/teacher/TeachingPlan.tsx` — fix `savePlan` to check upload error response

