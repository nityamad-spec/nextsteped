

## Plan: Show Approved Syllabus Preview on Page Load

### Summary
When the idle page loads, check if `approved-syllabus.json` already exists in storage. If found, display it as a readable preview below the upload zone — so professors can immediately see their previously approved syllabus without clicking "Review".

### Changes

#### 1. Load approved JSON on mount
**File: `src/pages/teacher/MaterialQualityCheck.tsx`**

- Add a new `useEffect` that runs on mount (alongside the existing file-fetching effect)
- Downloads `{userId}/syllabus/approved-syllabus.json` from storage
- If found, parses it and stores in a new state variable `previewJson: SyllabusJson | null`
- Also sets `finalApproved = true` since it was previously saved

#### 2. Show preview in idle stage
**File: `src/pages/teacher/MaterialQualityCheck.tsx`**

- In the `stage === "idle"` render block, after the upload card and before the action buttons:
  - If `previewJson` exists, render `<SyllabusPreview syllabus={previewJson} />` inside a card with a header like "Previously Approved Syllabus"
  - Include a note that they can re-upload and re-review if needed
- Enable the "Continue to Lesson Plan" button when `previewJson` exists (allow skipping re-review)
- Add a "Continue to Lesson Plan" navigation button alongside "Review Syllabus" when a preview exists

### Files Modified
1. `src/pages/teacher/MaterialQualityCheck.tsx` — add mount-time fetch + conditional preview in idle stage

