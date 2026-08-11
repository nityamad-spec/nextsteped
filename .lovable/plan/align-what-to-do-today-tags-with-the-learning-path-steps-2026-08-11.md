# Align "What to do today" tags with the Learning Path steps

Today the tag on each card varies ("Step 1 of 3", "Quiz", "Practice exam", "Next unit", "Continue learning"). It will instead name the learning-path step the card belongs to.

## New tag rules

| Card | Tag |
| --- | --- |
| Start studying / study weak concepts | Study |
| Practice questions / scored practice / practice exam | Practice |
| Unit quiz (take now or opens later) | Weekly Quiz |
| Diagnostic quiz | Diagnostic (unchanged — not a unit step) |
| Learning path not published | Heads up (unchanged) |
| Proceed to next unit / open study chat fallback | Study |

Tag colour stays tied to the step: Study and Practice keep the green tone, Weekly Quiz keeps the neutral tone, so the three steps stay visually distinguishable.

## Technical notes

- Single file: `src/pages/student/StudentHome.tsx`.
- Only the `badgeLabel` (and matching `badgeTone`) values in the `nextActions` builder change; card titles, descriptions, buttons, and the mastery/goal footer are untouched.
- No changes to `computeUnitStage`, `useUnitProgress`, or the Learning Path pages.
