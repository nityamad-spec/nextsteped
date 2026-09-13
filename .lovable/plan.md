# Behavioural and Agent Design live mocks

Both remaining Practice cards get the same full timed flow that Coding, System Design, and ML Depth already use: Ready screen → live screen (prompt card, timer ring with End & review / Abort, Live coach checklist) → review screen. Same light Career Readiness theme, demo only, nothing saved.

## Behavioural (30 min)

- Label: `Behavioural · Live`
- Question: "Tell me about a time you disagreed with a teammate and how you resolved it."
- Sub-line: "Follow STAR strictly. Concrete numbers. Own your part. What did you learn?"
- Live coach checklist:
  - Set the situation in two sentences or less
  - State your specific task and ownership
  - Describe the actions you personally took
  - Quantify the result with concrete numbers
  - Say what you learned and changed after
  - Keep it under three minutes
- Review notes: STAR structure, owning your part, quantified outcome.

## Agent Design (60 min)

- Label: `Agent Design · Live`
- Question: "Design an agent that books flights end-to-end from a natural-language request."
- Sub-line: "Planning, tool schemas, error recovery mid-booking, memory of preferences, safety."
- Live coach checklist:
  - Clarify the task scope and success criteria
  - Outline the planning loop and when it stops
  - Define tool schemas and their inputs/outputs
  - Handle errors and recovery mid-booking
  - Explain memory of user preferences
  - Cover safety, guardrails, and human handoff
- Review notes: planning loop clarity, tool schema precision, failure recovery and safety.

## Technical notes

- `src/lib/codingMock.ts`: add `BEHAVIOURAL_MOCK_CONFIG` and `AGENT_DESIGN_MOCK_CONFIG`.
- `src/components/student/employment/MockInterviewLab.tsx`: route `behavioural` and `agent-design` to `CodingMockSession`; the Ready-only fallback then applies to no cards but stays in place.
- Update `MockInterviewLab.test.tsx` (ready-only list becomes empty — replace with live-session tests for both), run typecheck, tests, and an authenticated screenshot check.
