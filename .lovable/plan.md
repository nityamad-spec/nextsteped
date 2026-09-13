# System Design mock: full live session + Back buttons confirmed

## What changes

1. **Back button on all Ready screens** — already present next to "Start timer" in `MockReadyScreen.tsx` (Back outline button, works on every mock card). No change needed; verified in code.

2. **System Design gets the full three-screen flow** (Ready → Live → Review), like Coding, in the app's existing **light theme** using the layout from the screenshot:
   - **Live screen** (light theme, same structure as the reference): prompt card at top, circular timer ring counting up against 60:00 on the left with "End & review" + "Abort", and a "Live coach" checklist panel on the right.
   - **Prompt** (top part specific to System Design):
     - Label: `System design · Live`
     - Question: "Design Swiggy's real-time delivery ETA system."
     - Cover line: "Cover: data model, real-time ingestion, ETA prediction, monitoring, staleness, A/B testing."
   - **Tailored System Design coach checklist** (6 items): Clarify requirements and scope; Estimate scale (QPS, storage, users); Define the data model; Identify bottlenecks and single points of failure; Discuss trade-offs explicitly; Cover monitoring and alerting.
   - **Review screen** — same format as Coding's: time used vs. 60:00, coach habits hit, habits missed, and a short fixed set of System Design–specific demo feedback notes.

3. **Other mock cards (ML Depth, Behavioral, Agent Design)** keep the Ready screen with Back for now — only System Design goes live, per your choice.

## Technical details

- `src/lib/codingMock.ts` → add a generic `MockConfig` shape (title, minutes, prompt, checklist, review notes) plus `SYSTEM_DESIGN_*` data, keeping the existing Coding exports untouched.
- `CodingMockSession.tsx` → refactor the internal `LiveScreen`/`ReviewScreen` to accept a config (title, minutes, prompt, checklist, notes) instead of reading Coding constants directly; behavior identical for Coding.
- `MockInterviewLab.tsx` → route `system-design` to the session component with the System Design config; other cards keep `MockReadyScreen`.
- Unit test for the new System Design data; TypeScript check; authenticated desktop + mobile screenshots of Ready, Live, and Review screens.
- Everything stays in-page state — nothing saved, refresh returns to the lab.
