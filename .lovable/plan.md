

## Plan: Skip PDF-to-JSON Re-conversion on Subsequent Reviews

### Problem
Every time the professor clicks "Review," the pipeline downloads the raw PDF, sends it to the `parse-syllabus` edge function for JSON conversion, then runs `quality-check`. If an approved JSON already exists in storage (`approved-syllabus.json`), the expensive parse step is unnecessary — the system should use the existing JSON directly.

### Change

**File: `src/pages/teacher/MaterialQualityCheck.tsx`**

Modify `runPipeline` (lines 118-195) to add a check at the start:

1. **Before fetching/parsing the PDF**, attempt to download the existing approved JSON from storage at `${user.id}/syllabus/approved-syllabus.json`.
2. **If the JSON file exists**: parse it, set it as `syllabusJson`, skip the `"parsing"` stage entirely, and jump straight to the `"checking"` stage (quality-check edge function).
3. **If the JSON file does not exist**: proceed with the current flow (download PDF → call `parse-syllabus` → call `quality-check`).

This means:
- First review: PDF → parse-syllabus → JSON → quality-check (full pipeline)
- Subsequent reviews: JSON from storage → quality-check (skips parse step)

### Technical Detail
```text
runPipeline():
  1. Try download "course-materials" / "{userId}/syllabus/approved-syllabus.json"
  2. If success → parse blob as JSON → setSyllabusJson → skip to quality-check
  3. If 404/error → fall through to existing PDF download + parse-syllabus flow
  4. quality-check runs the same either way
```

The stage messaging will reflect the shortcut: show "Loading saved syllabus…" instead of "Analyzing your syllabus…" when using the cached JSON.

### Files Modified
1. `src/pages/teacher/MaterialQualityCheck.tsx` — add JSON-first check in `runPipeline`

