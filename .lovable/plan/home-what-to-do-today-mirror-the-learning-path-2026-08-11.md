# Home "What to do today" — mirror the learning path

Make the Home next-step cards follow the same Study → Practice → Quiz pathway students see on the learning path, so both surfaces always agree on what comes next.

## Focus unit

Home focuses on the **first unit that is not yet ready** (readiness below the 70% threshold from the learning path), not the calendar week. If every unit is ready, Home congratulates and points to the last unit / course wrap-up.

## Stages and what Home shows

| Stage | Condition | Cards shown |
| --- | --- | --- |
| Not started | No chat session for the unit's topic | 1. Start studying Unit X (primary) · 2. Take Unit X quiz instead (secondary) |
| Studied | Chat session exists for the unit, no practice set finished | 1. Do practice questions for Unit X (primary, prefills "Generate 10 practice questions on {topic}") · 2. Keep studying with the TA |
| Practised | A practice set finished, quiz not taken | 1. Take the Unit X quiz (primary) · 2. More practice |
| Quiz taken, readiness low | Quiz taken and readiness < 70% | 1. Study weak concepts (names the 2 weakest) · 2. Complete scored practice |
| Ready | Quiz taken and readiness >= 70% | 1. Start Unit X+1 (primary, study step of next unit) · 2. Review Unit X |

The diagnostic card keeps its current priority: if the diagnostic isn't taken, it stays the first card and the pathway cards follow. The "Learning path not published" heads-up state is unchanged. The footer strip from the reference — "Unit X of N · Current position" and "Quiz not taken / Readiness NN%" · "View full learning path →" — is added under the cards.

## Signals

- **Studied**: a `chat_sessions` row for this course whose title or first message references the unit topic or one of the unit's concept names (deep links from the pathway already carry the topic, so these sessions match).
- **Practice complete**: at least one `assessment_results` row with `mode = "practice"` for this course whose recorded answer topics intersect the unit's concepts.
- **Quiz taken / score**: the existing weekly-quiz results Home already loads.
- **Readiness / weak concepts**: the existing `useUnitReadiness` hook, unchanged.

## Technical notes

- New hook `src/hooks/useUnitProgress.ts`: given course + lesson plan, returns per-unit `{ studied, practised, quizTaken, readiness, weakConcepts, stage }`, built on `useUnitReadiness` plus one `chat_sessions` query and one `assessment_results` (mode=practice) query. Both are read-only; no schema changes.
- `UnitPathwayCard` on the learning path is refactored to derive its "Your next move" copy from the same `stage` value, so the two pages cannot drift.
- `StudentHome.tsx`: replace rules 3–6 of the current `nextActions` builder with the stage table above; keep the diagnostic gate, the unpublished-plan heads-up, and the existing card visuals/loading skeleton.
- Actions reuse the current navigation: study → `/student/chat?newchat=true&concept={topic}`, practice → `/student/chat?practice=1&topic={topic}`, quiz → existing `attemptOpenQuiz(unit)` with its diagnostic gate.

## Risks

- Topic matching for chat sessions is string-based; a student who studies without the deep link and never mentions the topic may look "not started". Mitigation: also treat "any concept in the unit with attempted mastery" as studied.
- Practice topics come from stored answer metadata, which can be empty for older sessions; those rows are ignored rather than mis-attributed.
