# Coding mock interview flow (Practice step)

Make the Coding card in Career Readiness → Practice clickable, opening a three-screen demo flow. The other four cards stay informational for now.

## Screen 1 — Ready?

Opens in place of the lab grid when the Coding card is clicked.

- Small label: `Coding mock · 45 min`
- Heading: `Ready?`
- Sub-label: `Before you start:`
- Four numbered prep rows (numbered circles in the same style already used by the interview-rounds timeline):
  1. Close every other tab — this is single-task time.
  2. Have paper + pen. Whiteboard-style thinking beats typing early.
  3. Narrate your thinking. Silent minutes are lost points.
  4. Aim to finish 5 min before the buzzer — leaves room for follow-ups.
- Buttons: `Start timer` (primary) and `Back` (returns to the lab)

## Screen 2 — Live

- Prompt card at top: `Coding · Live` label, the question text, and a follow-up line
  - Question: "Given a stream of integers, return the K largest elements at any moment."
  - Follow-up: "What if K is 10^6? What if the stream is 10^9 elements? Space vs. time trade-off."
- Left panel: a counting-up timer against 45:00, shown with a circular progress ring
- Right panel: `Live coach` checklist the student can tick off
  - Restate the problem in your own words
  - State assumptions explicitly
  - Discuss brute force before optimizing
  - Walk through an example
  - Analyze time + space complexity
  - Ask about edge cases
- Buttons: `End & review` and `Abort` (abort returns straight to the lab)

## Screen 3 — Review

Static demo summary shown after `End & review` or when the timer hits 45:00:

- Time used vs. the 45-minute target
- Checklist completion count (e.g. 4/6 habits hit) with the missed items listed
- A short fixed set of demo feedback notes
- Button: `Back to mock lab`

## Styling and behavior

- Built with the existing card, button, and badge components and semantic tokens — light theme consistent with the rest of Career Readiness, not the dark mock-up. The screenshots are used for structure and content only.
- Everything is in-page state: nothing saved, refresh returns to the lab. Recent mocks list and completed count are unchanged.
- Works on mobile (panels stack).

## Technical details

- New `src/lib/codingMock.ts` holding the prompt, prep steps, coach checklist, and demo review notes as static data.
- New `src/components/student/employment/CodingMockSession.tsx` with a `stage` state of `ready | live | review`, a `setInterval` timer cleaned up on unmount, and an `onExit` callback.
- `MockInterviewLab.tsx` gains local `activeMock` state; the Coding card becomes a button that sets it. When set, the lab renders `CodingMockSession` instead of the grid. Other cards keep current non-interactive rendering.
- Unit test for the timer formatting and stage transitions; TypeScript check and authenticated desktop/mobile screenshots for verification.
