# Redesigned student Jobs page (skilling courses)

Stays inside Resources. The "See live jobs" link on the home page keeps pointing there. Students can only view jobs. They never see sources and there is no refresh button.

## Layout
- Title: "Jobs for your [target role] pathway". Uses the professor-approved target role, or just "Jobs" if no role is set.
- Subtitle: "Entry-level roles in India, or remote roles open to candidates in India. Updated X ago."
- Banner: "Not sure where to start? Begin with the Apply first jobs..."
- Filter pills: All jobs, Apply first, Worth a strong try, Long shot, each with a count. On phones the row scrolls sideways. A one-line explanation sits under the selected pill. For All jobs it reads "Sorted from the best first chance to the biggest stretch."
- All jobs groups the cards under one heading per tier, easiest first. Each heading shows the tier name, competition label, job count and description. Cards sit in one column on phones and in a responsive grid on larger screens. There are no side-by-side tier columns.
- Each tier has its own accent color (green / amber / rose), and text stays readable in light and dark mode.

## Job card (only these items)
- Competition badge with a 3-bar meter, e.g. "Apply first · Low competition"
- Title and company
- Location, shown as "Remote (India)" for remote roles
- Package, or "Not disclosed" when missing
- "Skills they ask for" chips, e.g. "SQL, working"
- "View job and apply" button that opens the original job link in a new tab

## Empty state
"Your professor hasn't set up jobs yet. Check back soon."

## Access
No change is needed. Students already read only the jobs for courses they are actively enrolled in, and they can't read job sources at all.

## Technical details
- Rewrite `src/components/student/StudentJobsSection.tsx`. It reads `target_role` for the course along with jobs.
- Add the tier copy (student labels, competition, descriptions) to `src/lib/jobCoverage.ts` as a student-facing map. The professor-side labels stay unchanged.
- Use semantic tokens (primary / warning / destructive) for the tier accents. Don't hardcode colors.
