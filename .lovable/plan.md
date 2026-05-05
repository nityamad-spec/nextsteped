## Goal
1. On `/teacher/setup/upload`, disable **Next: Review Concepts** until the uploaded syllabus has been parsed AND the resulting JSON has been written to the `course-materials` storage bucket.
2. On `/teacher/setup`, ensure the **Concept Review** card stays locked until the syllabus JSON is safely persisted in storage.

## Current state
- `FileUploadZone` already tracks per-file `parseStatus` (`parsing | parsed | failed`) internally, uploads JSON to `{courseId}/syllabus/approved-syllabus.json`, and updates `courses.syllabus_json_path` only after the JSON upload succeeds.
- `CourseMaterials.tsx` enables Next as soon as `syllabusFiles.length > 0` — it does NOT wait for parsing.
- `CourseSetup.tsx` already locks Concept Review until `statuses.upload === "Complete"`, and "Complete" is derived from `courses.syllabus_json_path` being non-empty. So requirement (2) is functionally enforced today, but it relies on the JSON upload succeeding before the user can return to `/teacher/setup`. We will harden this so the lock state is unambiguous and reflects storage truth, not just the DB pointer.

## Changes

### 1. `src/components/FileUploadZone.tsx`
- Add an optional prop `onParseStatusChange?: (statuses: Record<string, ParseStatus>) => void`.
- Call it inside every `setParseStatus` update (via a `useEffect` on `parseStatus`) so the parent gets a live view.
- On mount, when `folderType === "syllabus"` and `files` already has entries, seed `parseStatus` to `"parsed"` for each existing file IF `courses.syllabus_json_path` is set for the current course (so a page reload doesn't make Next look disabled forever).

### 2. `src/pages/teacher/CourseMaterials.tsx`
- Add local state `syllabusParsed: boolean`.
- On mount (after `courseId` resolves), query `courses.syllabus_json_path`; if non-empty AND the object actually exists in the `course-materials` bucket (lightweight `storage.from(...).list(folder, { search: "approved-syllabus.json" })`), set `syllabusParsed = true`.
- Pass `onParseStatusChange` into the syllabus `<FileUploadZone>`. Update `syllabusParsed` to true once any status flips to `"parsed"`; set false if all uploaded syllabus files are still parsing/failed.
- Change `canContinue` from `syllabusFiles.length > 0` to `syllabusFiles.length > 0 && syllabusParsed`.
- Replace the single helper line with two states:
  - "Please upload your syllabus to continue." (no files)
  - "Parsing your syllabus… this usually takes 10–30 seconds. The Next button will enable when it's ready." (files uploaded, not yet parsed)
  - "Syllabus parsing failed. Use Retry on the file above before continuing." (all parses failed)
- Disable the Next button accordingly via existing `nextDisabled` prop on `SetupModuleNav`.

### 3. `src/pages/teacher/CourseSetup.tsx`
Keep the existing logic (status from `syllabus_json_path`), but harden:
- Additionally verify the JSON object exists in storage by calling `supabase.storage.from("course-materials").list("{courseId}/syllabus", { search: "approved-syllabus.json", limit: 1 })`. Only mark `upload = "Complete"` if BOTH the DB pointer and the storage object are present. This guarantees Concept Review cannot unlock based on a stale/incorrect DB pointer.
- Keep the existing `isCardLocked("concept-review")` rule (`statuses.upload !== "Complete"`).

## Acceptance
- Upload a syllabus → Next stays disabled with "Parsing…" copy → flips to enabled within seconds once the parsed JSON lands in the bucket.
- Refresh `/teacher/setup/upload` after a successful prior parse → Next is enabled immediately.
- Navigate to `/teacher/setup` while parse is still in flight → Concept Review card shows Locked with the existing "Upload your syllabus in Step 1 to unlock this." message; unlocks once the JSON is in the bucket.
- Parse failure → Next remains disabled and Retry surfaces in the file row (existing behavior preserved).
