# Fix: Study step never marks complete after chatting

## What's wrong today

The Study step for a unit is inferred from the **chat session title** only. In practice that fails:

- Sessions often keep the default title `New Study Session` (the rename only happens on the very first manually typed message).
- When renamed, the title is the first 50 characters of the student's question, e.g. `give me a state diagram of DFA`, which does not contain the unit's term `Foundations of Automata Theory`, so the match fails.
- The actual conversation body is never looked at, so real study activity is invisible to Home and the Learning Path.

## Approach

Keep inferring study progress at load time (no schema change), but infer it from real signals instead of titles, using a combination rule and a 2-message minimum.

A unit counts as **studied** when the course has a study-mode chat session with **2 or more user messages**, and any of:

1. **Deep-link attribution** — the session was opened from that unit's Study button (detected from the generated session title prefix, e.g. `Help me get started with "<unit topic>"`, and from the unit topic appearing in the first user message).
2. **Topic match on message text** — user message text in the session references the unit's topic or any of its concept names (same normalised matching as today, applied to message content rather than the title).
3. **Fallback** — if the session qualifies (2+ user messages) but matches no unit, it counts toward the student's **current focus unit** (the first unit that is not yet ready), so ordinary studying is never lost.

Existing signal is kept: a unit with attempted concept mastery still counts as studied.

## Technical changes

- `src/hooks/useUnitProgress.ts`
  - Replace the `chat_sessions(title)` query with a query that also loads `chat_messages` for those sessions (`session_id, role, content`, study-mode sessions for the current course, bounded limit and recency ordering).
  - Group messages per session; keep sessions with `userMessageCount >= 2`.
  - For each qualifying session, resolve its unit via deep-link title prefix first, then via topic match over its user message text.
  - Unattributed qualifying sessions mark the focus unit; the hook accepts the focus unit number as an argument (or exposes the unattributed count so callers can apply it).
  - Return `studiedByUnit` as before so no caller has to change shape.
- `src/lib/unitStage.ts` — no change to `computeUnitStage`; add a small helper for matching a session's messages to a unit if the matching logic grows beyond a few lines.
- Callers (`src/pages/student/StudentHome.tsx`, `src/pages/student/StudentLearningPath.tsx` / `UnitPathwayCard.tsx`) pass the focus unit into the hook; their rendering logic is unchanged.

## Risks and constraints

- Loading message bodies is heavier than loading titles. Mitigated by limiting to recent study-mode sessions for the current course and selecting only the fields needed; results stay client-side and are already memoised.
- Loose topic matching can over-credit a neighbouring unit when two units share vocabulary. The 2-message minimum and deep-link-first ordering reduce this.
- Because progress stays inferred, deleting chat history will un-complete the Study step. That is the accepted trade-off for no schema change.

## Verification

- With an existing chat that has 2+ messages, Home's "What to do today" advances from Study to Practice, and the unit card's Study step shows complete.
- A brand-new session with a single message does not complete Study.
- Chatting from a unit's Study button credits that unit specifically.
