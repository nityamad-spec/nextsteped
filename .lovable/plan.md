## Goal
Replace the "Coming Soon" placeholder on `/student/project-lab` with a real Project Lab page matching the two attached screenshots. Static content only — no backend, no persistence.

## Change — `src/pages/student/StudentProjectLab.tsx`
Rewrite the file to render:

1. **Header**
   - Title "Project Lab" (serif, matches page headings elsewhere).
   - Subtitle: "Apply AI concepts through short, practical challenges."

2. **"Learn by doing" intro banner**
   - Purple-tinted rounded card with a flask icon tile (lucide `FlaskConical`).
   - Eyebrow "LEARN BY DOING", bold line "Choose a lab and expand it to see the mission", helper paragraph from screenshot 1.

3. **Expandable lab cards** (accordion-style; multiple can be open). Each card shows:
   - Left: 2-digit index (`01`, `02`, `03`) in muted style.
   - Row 1: `Available` purple badge + tag chips (e.g. `15 minutes`, `Prompt injection`).
   - Row 2: bold title + one-line summary.
   - Chevron toggle on the right.
   - Expanded body split into two columns:
     - **MISSION** (left, purple eyebrow) — paragraph + optional amber "safe use" callout.
     - **INSTRUCTIONS** (right, purple eyebrow) — numbered steps with purple circle badges. Steps can contain: paragraph text, monospace prompt blocks (muted background, rounded), inline "Open <link>" button (external icon), 2×2 or 1×N grids of small labelled tiles, and green-check bullet grids.

4. **Lab content (verbatim from screenshots)**
   - **01 Jail Breaking** — 15 minutes · Prompt injection. Mission + amber caution. Steps: (1) Go to the game with "Open hackmerlin.io" link; (2) Beat as many levels as possible in 15 minutes with 4 level tiles (Level 1 / Levels 2–3 / Levels 4–6 / Level 7+); (3) Try different prompt-injection strategies with 3 monospace prompt boxes (Ignore instructions, Roleplay, Logical transformation) and closing note.
   - **02 Build a Working Game** — Build challenge · Claude Artifacts. Mission + steps: (1) Open the Claude mobile app with two monospace prompt blocks (build + course-correct); (2) Test the game — 2×2 green-check grid (Do the controls work?, Does it keep track of score?, Is it easy to use?, Is anything missing, such as a rotation button?); (3) Personalise it paragraph.
   - **03 Eye Exam for LLMs** — Model evaluation · Suno. Mission + steps: (1) Open Suno with "Open suno.com" link; (2) Generate a song with monospace prompt; (3) Compare and score the results — 2×2 green-check grid (Genre / Instrumentation / Mood / Duration accuracy); (4) Identify the model's assumptions paragraph.

5. **Interaction**
   - Local `useState<number[]>` of expanded indices; clicking header toggles.
   - External links open in new tab (`target="_blank"`, `rel="noopener noreferrer"`) with lucide `ExternalLink` icon.

## Styling
- Semantic tokens only (`bg-primary/10`, `text-primary`, `border-border`, `bg-muted`, `text-muted-foreground`, `bg-amber-50 text-amber-900 border-amber-200` for the caution callout).
- Monospace prompt blocks: `font-mono text-sm bg-muted rounded-md p-3`.
- Purple step-number circles: `bg-primary/10 text-primary`.
- Matches existing student-page container width used on `/student/learning-path`.

## Out of scope
- No routing changes (route already exists).
- No sidebar/nav changes.
- No progress tracking, completion state, or backend writes.
- No changes to other pages or shared components.
