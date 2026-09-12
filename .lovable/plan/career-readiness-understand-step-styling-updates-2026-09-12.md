# Career Readiness — Understand step styling updates

## 1. "What they're really testing" box
- Replace the current sky-tinted background with a single very-light violet wash (`#F9F7FE` box, `#E8E3F7` border/accents).
- Inner question cards stay white; skill tags and text adjusted to match the violet family (dark violet `#4C1D95` where tinted).
- Keep all existing content, weightage text, and layout exactly as-is — color change only.

## 2. Company-specific notes
- Restructure into one white card per company, matching the interview-rounds card format (consistent padding, rounded corners, border).
- Each card: company name as the title, its interview notes as the body text (no salary line).
- Same card grid/spacing pattern used elsewhere on the page for consistency.

## Technical
- Files: `src/components/student/employment/UnderstandBriefing.tsx`, possibly `careerReadinessBriefing.ts` (data shape for companies).
- Update semantic tokens in `src/index.css` / `tailwind.config.ts` if a new violet token is needed (replacing the sky token).
- No content, data, or behavior changes.
- Verify via typecheck + Playwright screenshot on `/student/career-readiness` (desktop and mobile).
