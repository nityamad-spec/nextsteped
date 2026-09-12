# Color band behind "Openings matched to you"

## Goal
Add a full-width, non-gradient light indigo/blue band behind the existing "Openings matched to you" section on the employment-pathway student home page. The cards inside the section stay exactly as they are now.

## Scope
- Employment-pathway courses only (`isEmployment` true).
- Only the "Openings matched to you" section gets the band.
- The band spans the full width of the main content panel (edge to edge within the page padding).
- No changes to the EmploymentPathwayHeader, Daily DSA card, What's new, What to do today, Concept mastery, or Achievements sections.

## Visual direction
- Solid color, no gradient.
- A light blue-indigo tint that is clearly different from the purple/lavender used in the "AI Engineer Track · toward job-ready" header directly above it.
- Dark-mode counterpart: a deeper muted blue-gray band.

## Changes

1. **Design tokens**
   - Add `--openings-band` and `--openings-band-foreground` HSL tokens to `src/index.css` in both `:root` and `.dark`.
   - Expose the tokens in `tailwind.config.ts` as `openings-band` / `openings-band-foreground` so the band uses semantic classes.

2. **Section wrapper**
   - In `src/pages/student/StudentHome.tsx`, wrap the `<MatchedOpeningsSection />` call inside the employment block with a full-width band container:
     - Breaks out of the page `p-6` padding using negative horizontal margins and matching horizontal padding.
     - Applies `bg-openings-band` and vertical padding.
     - Carries the bottom margin so the following Concept mastery / Achievements row still has the same separation.

3. **Spacing cleanup**
   - Remove the redundant `mb-6` from `src/components/student/employment/MatchedOpeningsSection.tsx` so the band wrapper owns the bottom spacing. The section's internal grid and cards remain unchanged.

## Technical notes
- Pure styling/markup change; no data, logic, or component behavior changes.
- Verify with TypeScript and a visual pass on the employment-pathway home page.
