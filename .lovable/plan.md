# ML Depth live mock + tailored coach checklists

## What changes

1. **ML Depth card becomes a full timed mock.** Clicking "Start timer" on the ML Depth Ready screen now opens the same live screen already used by Coding and System Design (prompt card on top, timer ring with End & review / Abort on the left, Live coach checklist on the right), followed by the same review screen.

2. **ML Depth content** (from the reference screenshot):
   - Label: `ML Depth · Live`, 45 minutes
   - Question: "Design a fraud detection system for a payments company."
   - Sub-line: "Cover: labels, features, model choice, class imbalance, serving latency, drift monitoring."
   - Live coach checklist tailored to ML:
     - Define the prediction target and label strategy
     - Discuss feature sources and leakage risks
     - Justify model choice against a simple baseline
     - Handle class imbalance explicitly
     - State evaluation metrics beyond accuracy
     - Cover serving latency, retraining, and drift monitoring
   - Review notes tailored to ML depth (label quality, baseline comparison, monitoring).

3. **Coding card coach checklist refreshed** so it reads as coding-specific rather than generic:
   - Restate the problem and confirm input/output
   - Ask clarifying questions and state assumptions
   - Outline brute force, then optimize
   - Walk through a concrete example
   - Analyze time and space complexity
   - Cover edge cases and test your code
   Coding review notes updated to match the new items.

The layout stays the existing light Career Readiness theme (not the dark mock-up); only content and wiring change. Behavioural and Agent Design keep their Ready-screen-only behaviour.

## Technical notes

- `src/lib/codingMock.ts`: add `ML_DEPTH_MOCK_CONFIG` (MockConfig), update `CODING_COACH_CHECKLIST` and `CODING_REVIEW_NOTES`.
- `src/components/student/employment/MockInterviewLab.tsx`: route `activeMock === "ml-depth"` to `CodingMockSession` with the new config.
- Update `MockInterviewLab.test.tsx` / `codingMock.test.ts` expectations; run typecheck and an authenticated screenshot check of the ML Depth live + review screens.
