# Prepare step: STAR Story Builder

Replace the module list in the Career Readiness "Prepare" step with a STAR story builder, matching the reference screenshot. Demo content only — nothing is saved to the account yet.

## What the student sees

Header row: "STAR Story Builder · 3/12" with a short instruction line ("Prepare 10–12 crisp STAR stories, each under 2 minutes with concrete numbers...") and a "+ New story" button on the right.

Coverage bar: 12 slots, filled ones tinted, with a "3/12 stories · 7/16 themes" counter on the right.

Two panels side by side:
- Common prompts — the classic behavioural questions (tell me about yourself, why this company, a time you failed, disagreement with a teammate, time you led something, proudest project), each with one line of guidance.
- Themes panel — the static leadership-principle style tag set from the screenshot, with a short explanation of how stories map to multiple themes.

Story cards below: each shows its theme tags, a title, time since written, an Edit button, and the four STAR sections (Situation, Task, Action, Result) in a two-column grid. Three sample stories ship as demo content.

Editing: "+ New story" and "Edit" open a form with title, theme tags, and the four STAR fields. Edits live in the page only — refreshing restores the demo stories. The form says so plainly.

"Improve my story": inside the editor, sends the four fields to the AI and returns a tighter rewrite with sharper structure and prompts for concrete numbers. The student can accept it into the fields or discard it.

## Technical notes

- New `src/lib/starStories.ts` — demo story data, the theme tag set, and the common-prompt list.
- New `src/components/student/employment/StarStoryBuilder.tsx` — header, coverage bar, prompts/themes panels, story cards, and editor sheet; all state in React (`useState`), no database writes.
- `CareerReadinessSteps.tsx` — the `prepare` step renders `StarStoryBuilder` instead of the module list, same pattern already used by `UnderstandBriefing` for `understand`. Practice is unchanged.
- New edge function `improve-star-story` calling the AI gateway through the existing `loggedGatewayFetch` helper, returning improved Situation/Task/Action/Result text as JSON.
- Styling reuses existing design tokens and card components; no new colors hardcoded.
- No schema changes, no changes to the academic pathway.
