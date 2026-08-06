# Editable "Explain a concept" prompt on Student Chat

Make the first suggestion card on `/student/chat` behave like "Search course materials": clicking it fills the composer with an editable prompt instead of sending immediately.

## Changes

- Card label stays "Explain a concept".
- Card description becomes: "Explain a unit's key concept in simple terms."
- Clicking the card populates the input with:
  `Explain the key concept "<current week topic>" from this unit in simple terms with an example.`
  where `<current week topic>` is the same `currentWeekTopic` value already used by the materials prompt (falls back to `X` when unknown), so the student can edit the concept before sending.
- Focus the textarea after populating, and do not disable the card while streaming (same as the materials card).

## Technical notes

Single file: `src/pages/student/AIChat.tsx`.
- Update the "Explain a concept" entry in `STUDENT_SUGGESTED_PROMPTS` to `action: "populate"` with the new prompt text.
- Generalize the `populate` branch of the card `onClick` so it builds the prompt text per card (replacing the topic placeholder) rather than hardcoding the materials string.
