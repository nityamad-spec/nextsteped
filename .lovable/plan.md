# Career Readiness — Understand step tweaks

## 1. "The rounds you'll face" outer box
- Change only the outer rounded box background back to white (remove the violet/surface tint; keep its border).
- Inner round cards, timeline line, number circles, and all text stay exactly as they are.

## 2. Company-specific notes — match the Home "Openings matched to you" card format
- Keep the existing section heading and intro text.
- Each company renders as a `Card` styled like the home openings cards: initial badge (primary tint), company name, and its interview note as the body text (no salary line).
- Add the readiness row from the home cards: progress bar + colored status label + percentage, using the same color rules:
  - 75%+ = Ready, green (bar + label)
  - 50–74% = Stretch, amber (bar + label)
  - below 50% = Early, gray (bar + label)
- Cards side-by-side in a grid (3 columns on desktop like home, stacking on smaller screens).
- Data: reuse `DEMO_OPENINGS` (status, match %, initial) joined with the existing `COMPANY_NOTES` text in `src/lib/careerReadinessBriefing.ts`.

## Technical
- Files: `src/components/student/employment/UnderstandBriefing.tsx` (markup), `src/lib/careerReadinessBriefing.ts` (expose initial/status/match on each company note if not already).
- Reuse the `statusClass`/`barClass` mappings and `Progress` `indicatorClassName` approach from `MatchedOpeningsSection.tsx`.
- Verify via typecheck + Playwright screenshot on `/student/career-readiness`.
