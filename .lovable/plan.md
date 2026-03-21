

## Plan: Fix Save Spinner Never Dismissing

### Root Cause
In `handleApproveAndSave` (line 279), after successful save, the code sets `setFinalApproved(true)` but never resets `stage` back from `"saving"`. The render guard on line 290 catches `stage === "saving"` and shows the full-screen spinner indefinitely.

### Fix
**File: `src/pages/teacher/MaterialQualityCheck.tsx`, line 279**

Add `setStage("preview")` right before or after `setFinalApproved(true)` in the success path (line 279). This transitions the UI back to the preview view, which will now show the "approved" state instead of the spinner.

```typescript
// Line 279 — add stage reset
setStage("preview");
setFinalApproved(true);
```

This is a one-line fix. The save operation itself completes in under a second (confirmed via network logs), but the UI was stuck on the spinner because the stage was never updated.

