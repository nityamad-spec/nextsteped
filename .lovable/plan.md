# Stop filler messages from triggering the "course materials" fallback

Short conversational turns ("sounds good", "what's next", "ok thanks") are currently treated as course questions: they go through the relevance classifier and the RAG grounding path, so weak retrieval produces the "I couldn't find enough in the uploaded course materials…" card instead of a normal reply.

## Behaviour after the change

- A conversational/filler turn is answered normally from the conversation history and course context.
- No RAG retrieval, no fallback card, no off-topic refusal for those turns.
- Real course questions keep the existing grounded behaviour, citations and fallback prompt unchanged.
- Applies to both the student TA chat and the professor Course Assistant (they share the same `chat` function).

## Detection

Two layers, cheapest first:

1. **Local heuristic** (new shared helper `supabase/functions/_shared/conversational-intent.ts`, used by both edge functions):
   - Normalised match against a filler phrase list: ok/okay, thanks/thank you, got it, sounds good, cool, nice, yes/no/yeah/sure, please continue, go on, next, what's next, that helps, makes sense, hi/hello/hey, bye, etc.
   - Plus a length/shape rule: <= 4 words, no code fence, no "?" attached to a content word, no course concept term present.
   - Returns `true` only on high confidence; anything longer or topic-bearing falls through.
2. **Classifier intent field** (`classify-question`): the tool schema gains `intent: "question" | "conversational" | "off_topic"` alongside the existing `relevant` boolean. The heuristic runs first inside the function and short-circuits without a model call; otherwise the model decides. Response becomes `{ relevant, intent }` (still defaults to `{ relevant: true, intent: "question" }` on any error).

## Wiring

- `src/pages/student/AIChat.tsx` and `src/pages/teacher/TeacherChat.tsx`: keep the classify call (student side already has one; teacher side gets the same lightweight pre-check), and pass `conversational: true` to the `chat` function when the verdict is conversational. Never set `relevanceContext.relevant = false` for a conversational turn.
- `supabase/functions/chat/index.ts`: accept a `conversational` flag, and also run the same shared heuristic server-side on the latest user message as a safety net (so the behaviour holds even if the client skips the classifier). When conversational:
  - skip the RAG retrieval / `buildMaterialsGrounding` branch entirely (no `materialsContext`, no `needs_fallback` JSON response, no `[[NEEDS_FALLBACK]]` instruction in the prompt),
  - skip the off-topic refusal block,
  - keep the normal system prompt + course context so the model just continues the conversation.

## Verification note

The repo copy of `supabase/functions/chat/index.ts` references `materialsContext` and `ragSources` at lines 641 and 717, but no declaration or retrieval block for them exists in the file — the deployed function evidently still has it. First step of implementation is to reconcile that: restore the retrieval block (guarded by the new conversational check) so the file is internally consistent, rather than editing around a missing symbol.

## Tests

- Unit tests for the heuristic (`conversational-intent_test.ts`): filler phrases → true; "what's next in week 3 of the syllabus?" and other real questions → false.
- Existing `chat-grounding_test.ts` and RAG tests stay green.

## Risks

- Over-matching: a genuine short question ("what is RAG?") must not be classified as filler — the heuristic requires no content/concept word, and the classifier is the tiebreaker.
- "What's next" is ambiguous (small talk vs. "what's the next topic"): treated as conversational, answered from conversation + course context, which still gives a useful answer without the fallback card.
- Conversational turns lose citations by design.
