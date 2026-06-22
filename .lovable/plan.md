Disable the "Edit Settings" toggle in `src/components/ExamPrepPanel.tsx` so students can't customize practice exam time/question count.

Changes:
- Set `disabled` to `true` on the Edit/Hide Settings button (≈L96–106), keeping it visible but inert. Add a `title` tooltip ("Settings are fixed by your professor") for clarity.
- Force `showSettings` to stay `false` (remove the toggle handler effect) so the expandable panel never renders. Keep the rendering block intact behind `showSettings` in case we re-enable later.
- Leave `Start Exam Practice`, the badges, and rotation logic unchanged. Time/question count fall back to the professor-recommended values.

Risks:
- Students lose ability to shorten/lengthen practice exams. Acceptable per request.
- `Customized` badge logic becomes unreachable but harmless.
- No backend or schema changes.