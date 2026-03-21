

## Plan: Add "Review" Button Before AI Pipeline Runs

### Problem
Currently, the page immediately runs the full AI pipeline (fetch → parse → quality-check) on mount via `useEffect`. The user wants the page to load first showing the uploaded syllabus info, with a manual "Review" button to trigger the AI calls.

### Changes

**File: `src/pages/teacher/MaterialQualityCheck.tsx`**

1. **Add a new initial stage `"idle"`** to `PipelineStage` type — this is the default state when the page loads.

2. **Change initial state** from `"loading"` to `"idle"` (line 98).

3. **Remove the auto-run `useEffect`** (lines 193-195) that calls `runPipeline()` on mount.

4. **Add an "idle" view** — when `stage === "idle"`, render:
   - The page header and progress bar
   - A summary card showing the uploaded syllabus file name(s) (fetched via a lightweight query to `course_material_files`)
   - A prominent "Review" button that calls `runPipeline()` when clicked
   - Brief description explaining that clicking Review will have AI parse and analyze the syllabus

5. **Add a `useEffect` to fetch file names on mount** — a simple query to `course_material_files` filtered by `teacher_id` and `folder_type = 'syllabus'` to display which files will be reviewed. Store in a `syllabusFiles` state variable.

### Technical Details
- New state: `syllabusFiles: { file_name: string }[]`
- New stage value: `"idle"` added to the `PipelineStage` union
- The "idle" render block goes before the loading/parsing/checking guard (line 291)
- The existing pipeline logic (`runPipeline`) remains unchanged — it's just no longer auto-triggered

