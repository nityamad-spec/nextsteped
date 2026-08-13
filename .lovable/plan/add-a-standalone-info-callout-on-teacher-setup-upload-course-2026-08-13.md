Add a standalone info callout on `/teacher/setup/upload` (Course Materials step) that emphasizes handwritten notes can be uploaded under "Past Course Materials & Teaching Resources."

Scope
- Update `src/pages/teacher/CourseMaterials.tsx` only.
- No backend, database, or Content Library changes.

Implementation
1. In the "Past Course Materials & Teaching Resources" card (`CardHeader`/`CardContent` block), add a prominent callout between the description and the existing bullet list.
2. Use an existing lightweight pattern (e.g., `Alert` from shadcn or a custom rounded banner with `bg-primary/10` + `text-primary`) to keep the callout visually consistent with the rest of the setup UI.
3. Include a relevant icon (e.g., `Pencil` or `NotebookPen` from `lucide-react`) and short copy such as: "Handwritten notes, whiteboard photos, and scanned paper materials are welcome — the AI can read images and use them to understand how you teach."
4. Keep the existing bullet list and accepted-formats line unchanged.

Verification
- Confirm the callout renders on `/teacher/setup/upload`.
- Check that the page still typechecks and builds without errors.
- Ensure the emphasis is visible but does not push the upload zone below the fold on desktop.