## Goal

Rebuild the ordering logic behind the "What to do today" cards on `/student/home` so the mix and priority match the intended flow. UI/card visuals stay as-is — only the selection + ordering rules in `StudentHome.tsx` change.

## New priority order

The card list is built by walking these rules in order and stopping at 3 cards.

1. **Learning path not published** → single "Heads up" card (unchanged).
2. **Diagnostic (if untaken)** → always first, above everything else.
3. **Weekly Quiz slot** (exactly one card):
  - a. Missed earlier weekly quiz (available + untaken).
  - b. Else this week's quiz if available and untaken.
  - c. Else omit the slot.
4. **Chatbot slot** (smart fallback, exactly one card):
  - a. Weakest touched concept in visible scope → Study Chat pre-seeded with that concept.
  - b. Else first unexplored current-week concept → Study Chat pre-seeded with that concept.
  - c. Else generic "Open Study Chat".
5. **Reading slot** — only if:
  - current week has a resource of type reading/material/article/text, AND
  - student has not opened `/student/learning-path` in the current ISO week.
   Reading links to `/student/learning-path` and, on click, marks the week as "opened" so it stops appearing.
6. **Practice Exam** — only when *all visible lesson-plan weeks have been reached* (i.e. every week ≤ currentWeek is in `availableQuizDays`... actually: `visibleWeekNumbers.every(w => w <= currentWeek)` for the published plan) AND *every published weekly quiz has been taken* AND `taSettings.examEnabled !== false`. Replaces the current exam-week special-case and the fallback exam card.
7. Safe default: if list is still empty, show generic "Open Study Chat".

Diagnostic (rule 2) sits above the weekly-quiz slot. Missed earlier quizzes only appear inside the weekly-quiz slot, they no longer generate a separate REVIEW card.

## Reading "opened this week" tracking

- New `localStorage` key: `student:lp-opened:{courseId}:{isoYearWeek}`.
- Set the key when the Reading card's "Open reading" button is clicked, and also when the student navigates to `/student/learning-path` from anywhere in `StudentHome` (Learning Path nav click and the "View full learning path" link in the header).
- Rule 5 checks presence of that key for the current ISO week before adding the Reading card.
- ISO year+week derived from `new Date()` at render time — no schema changes.

## Files touched

- `src/pages/student/StudentHome.tsx` — replace the `nextActions` builder block (rules 1–8 + splice) with the new ordered pipeline; remove the standalone REVIEW missed-quiz card, the standalone Practice-exam fallback, and the exam-week early Practice card; keep card shape, badges, metadata, and `NextAction` type unchanged.
- Small helper (inside the file or new `src/lib/isoWeek.ts` if it stays under ~15 lines) for ISO-week key + localStorage read/write.

## Out of scope

- No changes to `useLearningPlan`, DB schema, edge functions, or card visual layout.
- No new tracking beyond the localStorage flag for reading.

## Risks / constraints

- **localStorage tracking is per-device.** A student on two devices will see the Reading card independently on each. Acceptable given no backend changes were requested.
- **"All visible weeks reached" is strict** — in a 16-week course the Practice Exam won't surface until week 16 unless quizzes are also all done. That matches the "all units complete" ask but is stricter than today's fallback.
- **Cap of 3 cards** means when diagnostic is pending the student will see Diagnostic + Weekly Quiz + Chatbot and no Reading card until diagnostic is done. Confirming this trade-off is fine before implementation, otherwise I'll ship with diagnostic-wins behavior.
- **Chat pre-seed URLs** already exist (`?newchat=true&concept=…`), so the smart chatbot slot reuses current wiring — no chat-page changes needed.