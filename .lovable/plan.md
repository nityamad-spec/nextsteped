## Goal

On `/student/chat` in Study mode, change the **Search course materials** tile so that clicking it pre-fills the composer textarea (instead of sending immediately) with a prompt that references the current week's topic.

## Behavior

- Clicking the tile populates the Study-mode textarea with:
  `Find and explain information from materials uploaded by my professor on topic <current week topic>.`
- If the current week's topic can't be resolved (no lesson plan, not loaded yet), fall back to the literal placeholder:
  `Find and explain information from materials uploaded by my professor on topic X.`
- Sentence case throughout (no title case).
- The text is fully editable; the student can modify it before pressing Send.
- Pressing Send transmits the text as-is (no stripping of "on topic X" if the student left it).
- `promptMode: "materials"` behavior is preserved — the RAG grounding flag is still applied to the outgoing request when this prompt is sent.
- Textarea auto-focuses after populating so the student can immediately type/edit.

## Implementation (technical)

In `src/pages/student/AIChat.tsx`:

1. Resolve current week topic
   - Use the existing `useLearningPlan()` hook (already imported elsewhere; import here) to get `lessonPlan` and `currentWeek`.
   - Derive `currentWeekTopic` = `lessonPlan.find(w => w.day === currentWeek)?.topic ?? null`.

2. Change the **Search course materials** tile behavior
   - Instead of calling `sendMessage(...)` on click, set the composer input state (the same state bound to the Study-mode `Textarea`) to the pre-filled string.
   - Focus the textarea via a ref after populating.
   - Other tiles keep their current send-on-click behavior.

3. Prompt string
   - `Find and explain information from materials uploaded by my professor on topic ${currentWeekTopic ?? "X"}.`

4. Keep `promptMode: "materials"` wiring
   - No change to the send path — the existing materials-mode flag remains attached when the student submits this (or any) text in Study mode after using the tile. If the tile currently sets a `promptMode` state before sending, mirror that state set on populate so the subsequent send still carries `materials`.

## Risks / constraints

- `useLearningPlan()` may still be loading when the tile is clicked → fallback to "X" is used; no error surfaced.
- No backend, DB, or edge-function changes required.
- No other tiles change.

## Out of scope

- Reordering the remaining Study-mode tiles.
- Changing behavior of the "materials" prompt for direct-typed messages.
