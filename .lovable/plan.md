# Recent mocks: icon badges instead of letter initials

## Goal
In Career Readiness → Practice, the "Recent mocks" rows currently show a generic
indigo tile with the first letter of the interview type (C, S, B). Replace the
letter with the same icon used on the interview-type cards, colored with that
type's accent color, and no background tile.

## Changes

1. `src/lib/mockInterviews.ts`
   - Add `icon` and `accent` fields to each `RECENT_MOCKS` entry, matching the
     corresponding interview type:
     - Coding → `icon: "code"`, `accent: "blue"`
     - System Design → `icon: "network"`, `accent: "purple"`
     - Behavioural → `icon: "star"`, `accent: "green"`

2. `src/components/student/employment/MockInterviewLab.tsx`
   - In the Recent mocks list, replace the `bg-primary/10` letter tile with the
     type's icon rendered in its accent color (e.g. blue `Code2` for Coding),
     no background tile. Reuse the existing `ICONS` and `ACCENT_TEXT` maps.
   - Keep everything else unchanged: type name, note text, timestamp, row
     layout, light blue-violet panel.

## Verification
- `bunx tsgo --noEmit -p tsconfig.app.json`
- Run existing MockInterviewLab tests; update if any assert on the old letter badge.
- Authenticated Playwright screenshot of the Recent mocks section (desktop).
