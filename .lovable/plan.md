## Change

In `src/pages/teacher/DiagnosticQuestionsSetup.tsx`, remove the "Distribution by Unit" section (lines 525–545):
- Delete the preceding `<div className="border-t" />` separator, the conditional `{distribution.length > 0 && (...)}` block containing the heading, description, badges, and its trailing separator.

Leave the `distribution` state and the `setDistribution(data.distributionByUnit)` assignment intact (harmless, no UI impact). The "Concept Coverage" section below is untouched.

No backend, logic, or other UI changes.