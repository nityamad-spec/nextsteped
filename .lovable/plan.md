## Add "Textbooks" upload section to Course Setup → Upload

Add a new upload card on `/teacher/setup/upload` (`src/pages/teacher/CourseMaterials.tsx`) so professors can upload one or more textbook PDFs alongside the existing Syllabus, Past Course Materials, Lesson Plans, and YouTube Links inputs.

### Behavior
- Label: **Textbooks**
- Badge: **Optional but Recommended** (same neutral/secondary styling used by the other optional cards, not the red Required badge)
- Icon: `BookOpen` (already imported)
- Description: "Upload the primary/reference textbooks for this course. Used to ground the AI TA and lesson plan in the same source material your students read."
- Accepted file types: **PDF only** (`.pdf`), multiple files allowed (no `maxFiles` cap, matching the Past Course Materials card)
- Uses the existing `FileUploadZone` component with:
  - `folderPath={courseId}/textbooks`
  - `folderType="textbooks"` (new folder_type value — the `course_material_files.folder_type` column is free-form text with no CHECK constraint, so no migration is needed)
  - `courseId` / `teacherId` wired the same way as the other cards
- New state `textbookFiles` + hydration in the existing `fetchFiles` effect (filter `folder_type === "textbooks"`)
- Placement: directly below the Syllabus card, above Past Course Materials, so the order reads Syllabus → Textbooks → Past Materials → Lesson Plans → YouTube Links
- No change to `handleNext`, no change to the Continue gate (textbooks stay fully optional)

### Out of scope
- No changes to Content Library, analytics, edge functions, DB schema, or lesson-plan / diagnostic generation prompts. Only the upload UI on `/teacher/setup/upload` changes; the files persist through the existing `course_material_files` + `course-materials` storage bucket flow and can be surfaced elsewhere in a follow-up.
