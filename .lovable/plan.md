# Add ready screens to all mock interview cards

## Changes
- Make System Design, ML Depth, Behavioral, and Agent Design cards clickable like Coding.
- Open the existing light-theme **Ready?** layout for each card.
- Reuse the same four preparation tips across all five mock types.
- Set the top label and duration from the selected card: System Design (60 min), ML Depth (45 min), Behavioral (30 min), and Agent Design (60 min).
- Keep Coding’s existing full flow unchanged. For the four new cards, **Start timer** will remain unavailable for now because this phase adds the ready screen only; **Back** returns to the mock lab.

## Technical details
- Extract a reusable ready-screen component driven by mock title, duration, and button behavior.
- Preserve keyboard accessibility for every mock card.
- Add focused tests for card selection and tailored labels, then run TypeScript and preview checks.
