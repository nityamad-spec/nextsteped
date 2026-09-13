# Behavioural + Agent Design live mocks, and Mock Interview Lab refresh

## Part 1 — Behavioural and Agent Design live sessions

Both remaining Practice cards get the same full timed flow that Coding, System Design, and ML Depth already use: Ready screen → live screen (prompt card, timer ring with End & review / Abort, Live coach checklist) → review screen. Same light Career Readiness theme, demo only, nothing saved.

**Behavioural (30 min)**
- Label: `Behavioural · Live`
- Question: "Tell me about a time you disagreed with a teammate and how you resolved it."
- Sub-line: "Follow STAR strictly. Concrete numbers. Own your part. What did you learn?"
- Live coach checklist: set the situation in two sentences or less; state your specific task and ownership; describe the actions you personally took; quantify the result with concrete numbers; say what you learned and changed after; keep it under three minutes.
- Review notes: STAR structure, owning your part, quantified outcome.

**Agent Design (60 min)**
- Label: `Agent Design · Live`
- Question: "Design an agent that books flights end-to-end from a natural-language request."
- Sub-line: "Planning, tool schemas, error recovery mid-booking, memory of preferences, safety."
- Live coach checklist: clarify task scope and success criteria; outline the planning loop and when it stops; define tool schemas and their inputs/outputs; handle errors and recovery mid-booking; explain memory of user preferences; cover safety, guardrails, and human handoff.
- Review notes: planning-loop clarity, tool schema precision, failure recovery and safety.

## Part 2 — Mock Interview Lab header

- Description becomes: "Aim for 8–10 mocks on each interview type before onsites. Record yourself. Review body language, filler words, and clarity."
- Label changes from "Completed" to "TOTAL COMPLETED", in black text (white in dark mode).
- The count is the sum of per-type completions across the five cards, out of 40 (5 types × 8). Currently 3/40.

## Part 3 — Per-type card colors and counts

Each card gets its own accent color used for both the icon tile and the duration text:

- Coding — blue
- System Design — purple
- ML Depth — orange
- Behavioural — green
- Agent Design — pink

Each card also shows that type's own progress, e.g. Coding `1/8`. Demo counts: Coding 1, System Design 1, ML Depth 0, Behavioural 1, Agent Design 0 (total 3).

## Part 4 — Recent mocks

- The Recent mocks card gets a light blue/violet tinted background.
- The `8/10` style score is removed from each row; the type, note, and timestamp remain.

## Technical notes

- `src/lib/codingMock.ts`: add `BEHAVIOURAL_MOCK_CONFIG` and `AGENT_DESIGN_MOCK_CONFIG`.
- `src/lib/mockInterviews.ts`: add `accent` and `completed` per type, `MOCK_PER_TYPE_TARGET = 8`, derive `MOCK_TOTAL_TARGET` and total completed; drop `score` usage from rendering.
- `src/components/student/employment/MockInterviewLab.tsx`: route both new ids to `CodingMockSession`; apply accents, per-type counts, header copy, and tinted Recent mocks card. `MockReadyScreen` fallback stays in place but is no longer reached.
- Update `MockInterviewLab.test.tsx` for the new live sessions and header copy; run typecheck, unit tests, and an authenticated screenshot check.
