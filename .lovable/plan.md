# Fix: MCQ-worded question rendered with True/False options

## Root cause
In `supabase/functions/generate-practice-questions/index.ts`:

- The default intent allows both types: `DEFAULT_INTENT.types = ["mcq", "true_false"]`, and the Stage 2 prompt lets the model freely pick either per question.
- The Stage 2 system prompt has no rule forcing "Which of the following…" / "Select the best…" / "Choose the option…" stems to be MCQ, nor forcing true_false stems to be declarative statements.
- The sanitizer only checks that `type` is one of the allowed values; it does not check that the stem shape matches the type. So a stem like *"Which of the following best describes a core principle of effective prompt engineering?"* generated with `type: "true_false"` passes through, and the widget faithfully renders True/False buttons.

The UI (`PracticeQuestionsWidget.tsx`) branches on `currentQuestion.type` — that behavior is correct. The bug is that a question with an MCQ-shaped stem is being tagged `true_false`.

## Fix (two layers, both cheap)

### 1. Prompt-side constraint (Stage 2 generator)
Add explicit stem-shape rules to `SYSTEM_PROMPT_GENERATE_TEMPLATE` in a new "Type selection" block:

- `true_false`: stem MUST be a single declarative statement that is unambiguously True or False. Never start with an interrogative like "Which", "What", "How", "Select", "Choose", "Identify", "Pick".
- `mcq`: use for any stem that asks the student to pick among candidates ("Which of the following…", "Select the best…", "What is…"). Must have exactly 4 options.
- If unsure, default to `mcq`.

### 2. Server-side sanitizer guard (defense in depth)
In the sanitizer loop, after `normalizeType`, run a small `stemLooksMcq(question)` check: matches a leading interrogative/imperative pattern like `^\s*(which|what|select|choose|identify|pick|name)\b` (case-insensitive) or contains `"of the following"`. If it matches AND `type === "true_false"`, drop the question (`return null`) and log a warning. The existing `.filter` removes it; if the batch ends up empty, the caller already handles that gracefully.

We drop rather than auto-convert because we don't have 4 options to fabricate, and converting to MCQ with 2 options fails the length-parity / 4-option rule anyway.

## Files touched
- `supabase/functions/generate-practice-questions/index.ts`
  - Extend `SYSTEM_PROMPT_GENERATE_TEMPLATE` with the "Type selection" rules (~10 lines).
  - Add `stemLooksMcq()` helper and one guard inside the sanitizer `.map` (~10 lines).

No client-side change.

## Risks / trade-offs

- **Occasional dropped questions.** If the LLM keeps mismatching, some batches may shrink. Mitigation: the widget already handles smaller sets fine; if drops become frequent, edge-function logs will show it and we can tighten the prompt further.
- **Regex false positives.** A TF statement legitimately starting with "What a great model" or a stem that starts with "Which" but is actually a valid TF ("Which is faster, X or Y? — True or False") is unlikely in practice for this generator, but possible. The guard is intentionally conservative (only fires when type is `true_false` AND stem starts with an interrogative). Worst case: a valid question is dropped, never mis-labeled.
- **Only fixes new generations.** Cached/older results already shown to students remain as-is (there is no persistent cache of generated questions, so this is effectively moot — each Practice session regenerates).
- **Does not fix the inverse case.** A declarative statement wrongly tagged `mcq` with 4 options would still pass. That's a separate, less user-visible failure mode (student still gets 4 real options); can be added later if reported.
- **No change to intent parsing.** We keep `types: ["mcq","true_false"]` as the default so students who ask for a TF drill still get one — the fix only ensures the stem shape matches the chosen type.
- **Prompt length grows slightly.** Negligible token cost on `gemini-2.5-flash-lite`.

## Verification
- Regenerate the same "Prompt Engineering" practice set; the offending question should either come back as MCQ with 4 options, or be absent from the set.
- Check edge function logs for `practice: dropping question, stem looks MCQ but type is true_false` warnings to gauge frequency.

## Out of scope
- UI changes in `PracticeQuestionsWidget.tsx`.
- Broader Stage 2 prompt rewrite.
- Adding a stem-quality check for MCQs (distractor quality, ambiguity, etc.).
