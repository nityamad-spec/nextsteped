# Mock Interview Lab (Career Readiness → Practice)

Replace the Practice step's module list with a Mock Interview Lab, matching the reference layout and the styling already used by Understand and Prepare.

## What the student sees

Practice (step 3 of Career Readiness, both on the Career Readiness tab and inside Stage 3 of the learning path) shows:

- A header: "Mock Interview Lab", guidance to aim for 8–10 mocks before onsites, record yourself, and review body language, filler words and clarity. A "Completed 3/10" counter on the right.
- A grid of five mock interview cards, each with an icon, title, duration and one-line description:
  - Coding — 45 min — 2 LeetCode-style problems, screenshare + narration
  - System Design — 60 min — HLD or LLD prompt with follow-ups and trade-offs
  - ML Depth — 45 min — Derive from scratch, defend design choices, debug models
  - Behavioural — 30 min — STAR-format cross-examination on your stories
  - Agent Design — 60 min — Multi-agent architecture prompt: planning, tools, evals
- A "Recent mocks" panel listing three sample entries with a score out of 10, a short takeaway note, and a relative time (3 days ago, 1 week ago, 2 weeks ago).

Everything is demo content: same for every course, nothing clickable, nothing saved. The professor's assigned Practice modules no longer appear.

## Technical notes

- New `src/lib/mockInterviews.ts`: `MOCK_INTERVIEW_TYPES` (id, title, minutes, description, icon key, accent token), `RECENT_MOCKS` demo entries, and `MOCK_TARGET_COUNT` / completed count constants.
- New `src/components/student/employment/MockInterviewLab.tsx`: renders the header, card grid and recent list using the existing Card/Badge primitives and semantic design tokens (no hardcoded colours from the screenshot's dark mockup), lucide icons per type.
- `CareerReadinessSteps.tsx`: add an `active === "practice"` branch rendering `MockInterviewLab`, placed alongside the existing `understand` and `prepare` branches. The module-list branch then only serves any remaining steps.
- No database, schema, or edge-function changes. Academic pathway untouched.
