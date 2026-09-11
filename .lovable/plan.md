# Consistent section titles on student pages

## Goal
All main section titles on `/student/home`, `/student/learning-path`, and `/student/feedback` use the same font and size: the standard sans heading font (as on "What's New") at `text-xl` (as on "Concept mastery"). No serif, no icon circles.

## Current state (verified)
- Home — `StudentHome.tsx`:
  - "What's New" (`WhatsNewCard.tsx:110`): `text-base` with icon circle
  - "What to do today" (`StudentHome.tsx:645`): `text-base` with icon circle
  - "Concept mastery" (`StudentHome.tsx:756`): `text-xl font-serif`
  - "Achievements" (`AchievementsCard.tsx:21`): `text-xl font-serif`
- Feedback — `Feedback.tsx:65,88,120`: three card titles at `text-base`
- Learning path — unit name inside the detail panel (`UnitDetailPanel.tsx:250`) is a sub-title and stays as-is; page h1 headings stay as-is

## Changes
1. Every main section card title across the three pages gets `text-xl font-heading font-semibold` (the standard heading font, no `font-serif`).
2. Remove the icon-circle span from "What's New" and "What to do today" — titles become plain text; unused icon imports are cleaned up.
3. Applies to: What's New, What to do today, Concept mastery, Achievements (home); the three feedback cards; any main section title on the learning path page.
4. Out of scope: page names (Home / Learning Path / Feedback h1s) and sub-titles inside cards (unit names, news headlines) keep their current styling.

## Technical notes
- Pure className/markup edits in: `src/components/student/WhatsNewCard.tsx`, `src/pages/student/StudentHome.tsx`, `src/components/student/AchievementsCard.tsx`, `src/pages/student/Feedback.tsx`, plus a check of `src/pages/student/StudentLearningPath.tsx` for any section-level title.
- No logic, data, or layout changes; verify with typecheck and a visual pass in the preview.
