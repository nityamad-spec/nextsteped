Remove the "Auto-fill empty" AI metadata button from the Add/Edit Question dialog on /teacher/setup/exam-mode, since we will only use "Regenerate all" going forward. Clean up the dead code paths that implemented the fill-empty behavior.

Changes:
1. Remove the "Auto-fill empty" button from the dialog's AI metadata section.
2. Update the helper text in that section to describe only "Regenerate all" behavior.
3. Refactor `handleAutoGenerateMetadata` so it no longer takes a mode argument and always regenerates all six metadata fields, keeping the existing confirmation prompt when values are already present.
4. Verify the page compiles and the dialog still works.

No edge function, backend, or schema changes are required.