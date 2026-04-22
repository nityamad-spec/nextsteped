

## Auto-parse syllabus on upload + remove orphan Syllabus Review code

### Goal

When a teacher uploads a syllabus PDF/DOCX in `/teacher/setup/upload`, parse it in the background and save `approved-syllabus.json` to storage so downstream concept extraction can use structured data. No new UI step. Also delete the orphaned `MaterialQualityCheck` code path.

### Part 1 — Auto-parse on syllabus upload

**Trigger point:** `src/components/FileUploadZone.tsx` → `handleConfirmedUpload()`, immediately after a syllabus file lands in storage and the `course_material_files` row is inserted. Detection: `folderType === "syllabus"`.

**Flow per syllabus file:**

1. Fire-and-forget (non-blocking) call to existing `parse-syllabus` edge function with the file's base64 content + filename.
2. On success, write the returned JSON to storage at `course-materials/{teacherId}/syllabus/approved-syllabus.json` (upsert; latest upload wins).
3. Resolve the active course id (prefer `courseId` prop → fall back to latest `courses` row for the teacher). If found, `UPDATE courses SET syllabus_json_path = '<that path>'`. If no course row yet, store the path in component state and back-fill in `CourseMaterials.handleNext()` alongside the existing `course_id` back-fill.
4. Show a small inline status pill on the syllabus file row: `Parsing…` → `Parsed ✓` (green) or `Parse failed` (muted, non-blocking, with retry on next upload). No toast spam, no blocking the Next button.
5. Errors (429/402/parse failure) are logged + reflected in the pill only — upload itself is still considered successful.

**Why fire-and-forget:** parsing takes 5–20s with `gemini-2.5-pro`. We don't want to gate the teacher behind it. By the time they click through Concept Review, the JSON is almost always ready; if it's not, downstream still has the raw file fallback that exists today.

**Downstream payoff (no extra work needed):**

- `ConceptManagement.handleAutoGenerate()` already reads `courses.syllabus_json_path` → now it actually finds something.
- `ConceptReview` / `suggest-concepts` edge function already reads `syllabus_json_path` (truncated to 12k chars) → same code path, now backed by structured JSON instead of being NULL.

**Re-upload behavior:** if a teacher uploads a new syllabus, we overwrite `approved-syllabus.json` (upsert) and re-point `syllabus_json_path` to the same canonical path. Old parsed content is replaced.

**Delete behavior:** if the only syllabus file is deleted (`FileUploadZone.performDelete`), also delete `approved-syllabus.json` and clear `courses.syllabus_json_path`.

### Part 2 — Remove orphan Syllabus Review code

Files to delete:

- `src/pages/teacher/MaterialQualityCheck.tsx`

Routes to remove from `src/App.tsx`:

- Any `<Route>` pointing to `MaterialQualityCheck` (e.g. `/teacher/setup/syllabus-review` if present) and the corresponding import.

Verify nothing else imports `MaterialQualityCheck` (search before delete). The `parse-syllabus` and `quality-check` edge functions are **kept** — `parse-syllabus` is now used by the auto-parse flow. `quality-check` becomes unused; leave deployed for now (cheap, no UI references it) and note in memory that it's dormant — easy to revive if we want a teacher-facing review later.

### Memory updates

Update `mem://ux/teacher-setup-flow.md`:

- Document that syllabus uploads now auto-trigger `parse-syllabus` and persist `approved-syllabus.json` + `courses.syllabus_json_path`.
- Note that `MaterialQualityCheck.tsx` and its route are removed.
- Note that `quality-check` edge function is dormant.

### Files touched

| File | Change |
|---|---|
| `src/components/FileUploadZone.tsx` | Add post-upload syllabus parse hook + status pill state + delete cleanup |
| `src/pages/teacher/CourseMaterials.tsx` | Back-fill `syllabus_json_path` on `handleNext()` if course was created lazily |
| `src/App.tsx` | Remove `MaterialQualityCheck` import + route |
| `src/pages/teacher/MaterialQualityCheck.tsx` | Delete |
| `.lovable/memory/ux/teacher-setup-flow.md` | Update flow doc |

### Out of scope

- No new UI step or page.
- No changes to `parse-syllabus` or `quality-check` edge functions.
- No retry queue / background job table — best-effort inline call is sufficient at this scale.
- No schema changes (`courses.syllabus_json_path` already exists).

