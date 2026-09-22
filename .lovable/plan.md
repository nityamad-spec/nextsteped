# Move company interview notes to Student Home

## Goal
Make the employment-pathway home page accurately present role examples rather than implied live openings, and consolidate each example's role, pay, match, and interview guidance in one place.

## Changes
- Rename **“Openings matched to you”** to **“Target role examples matched to you.”**
- Replace the current subheading with wording that clearly identifies these as illustrative role matches, not live vacancies.
- Expand each existing home-page example card to retain its company, tier, location, role, salary, readiness status, match percentage, and progress bar while also showing its existing company-specific interview/role description.
- Remove the entire **“Company-specific notes”** section from the bottom of Career Readiness → Understand.
- Keep the rest of the Career Readiness content and progression unchanged.

## Technical details
- Reuse the existing shared Sarvam, Zomato, and Google note content rather than duplicating copy.
- Simplify the Career Readiness briefing imports and supporting types after removing the notes block.
- Keep the revised cards readable across desktop and mobile widths.

## Verification
- Confirm the student home page displays all three enriched role-example cards with every existing field and its matching description.
- Confirm no wording suggests the examples are live openings.
- Confirm “Company-specific notes” no longer appears on Career Readiness.
- Run the project type check and verify both pages in the student preview.
