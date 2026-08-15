# Fix the StudentHome heatmap test's quiz-button locator

`src/pages/student/StudentHome.test.tsx:228` looks for a button named `/start quiz/i`. No such label exists on the page. `StudentHome.tsx` renders these action-card button labels: `Start studying`, `Start practice`, `Take quiz`, `Keep practising`. So the query can never match and the test fails before it can verify the heatmap refresh.

A second, unconfirmed factor: the quiz card is conditional. It renders only when the focused unit's quiz is open (`availableQuizDays.has(unit) && !takenQuizzes[unit]`) **and** the unit stage is `not_started` (label "Take quiz" on the "Take Unit quiz instead" card) or `practised` (label "Take quiz"). In the `studied` and `needs_work` stages no quiz button is rendered at all. The test's mocked data has to land the focused unit on a stage that produces the button; the current DOM dump from the failing run is truncated, so which stage it lands on is not yet verified.

## Approach

1. **Confirm what renders.** Re-run the test with `DEBUG_PRINT_LIMIT` raised and print the "What to do today" section, to see which action cards and button labels actually appear for the mocked unit.
2. **Fix the locator** to match reality, scoped rather than global:
   - `await screen.findByText(/what to do today/i)` first, so a still-loading section fails with a meaningful message instead of a missing-button one.
   - Find the quiz action card by its heading (`/take (the )?unit .* quiz/i`), then click the button inside that card with `within(card).getByRole("button", { name: /take quiz/i })`.
3. **Only if step 1 shows no quiz card at all**, make the mock deterministic instead of loosening the query: seed the mocked tables so the focused unit is unambiguously "quiz open, not yet taken" (an `assessment_questions` row for that unit, no `assessment_results` row for it), so the card is guaranteed to render. No behavioural change to `StudentHome.tsx`.
4. Re-run the file plus the full frontend suite to confirm 222/222 green and no other test depended on the old query.

## Scope

- Edited: `src/pages/student/StudentHome.test.tsx` only.
- Not edited: `src/pages/student/StudentHome.tsx` and any scoring code — the assertion being repaired is about the mastery heatmap refreshing after the quiz dialog closes, and that assertion itself stays exactly as written.

## Risk

If the quiz card turns out to be genuinely unreachable with the current mocks, step 3 changes the fixture data, which slightly widens what this test exercises. It stays confined to the test file, and the three heatmap assertions at the end of the test are unchanged, so what the test proves does not move.
