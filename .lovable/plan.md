## Problem

`suggest-concepts` returns concepts that omit syllabus topics. Likely root causes (in order):

1. **No `max_tokens` set.** The Lovable AI Gateway applies a conservative default cap. With `gemini-2.5-pro` extracting 3–8 concepts × N units × verbose `rationale` + `weight_rationale` fields per item inside a tool-call JSON, the response can be silently truncated. A truncated tool-call JSON either fails to parse (we already swallow that error and return `[]`) or parses partially, dropping later units — exactly the "missing topics" symptom.
2. **Soft, non-enforced coverage instructions.** The prompt says "3–8 concepts per unit" but never tells the model that **every listed topic must be represented by at least one concept**. The model often consolidates multiple topics into one concept name to stay terse.
3. **No post-hoc coverage check.** Even if the LLM drops a unit, we ship whatever came back. There's no "which syllabus topics ended up uncovered?" gate or auto-retry.
4. **Single-shot, all-units-at-once call.** For long syllabi, one giant tool call increases truncation risk and reduces per-unit attention.

## Fix Plan

### 1. LLM parameter changes (`supabase/functions/suggest-concepts/index.ts`)

Update the request body sent to the AI Gateway:

- **`max_tokens: 8000`** — give the tool call enough room. Each concept costs ~60–120 output tokens (name + rationale + weight_pct + weight_rationale, JSON-encoded). 8k comfortably covers ~50 concepts; raise to 12k if syllabi are very large.
- **`temperature: 0.2`** — lower than default to make extraction more deterministic and less prone to creative consolidation/skipping.
- **Keep** `model: "google/gemini-2.5-pro"` (best at long structured extraction). Document `google/gemini-3-flash-preview` as a faster fallback if cost/latency becomes a concern, but Pro is the right call here.
- Do **not** add `reasoning` — it costs latency without helping structured extraction.

### 2. Prompt tightening

Add to `systemPrompt`:

- **Coverage rule**: "Every topic listed under each unit MUST be covered by at least one concept in that same unit. Multiple closely-related topics MAY share one concept, but no topic may be silently dropped."
- **Topic-mapping field**: Add an optional `covers_topics: string[]` (verbatim topic strings from the syllabus) to each concept in the tool schema, so we can verify coverage programmatically.
- Slightly raise per-unit ceiling to **3–10** so the model isn't forced to drop topics in dense units.

### 3. Tool schema change

Extend each concept object in the `extract_unit_concepts` schema:

```
covers_topics: { type: "array", items: { type: "string" }, description: "Verbatim syllabus topic strings (from this unit) that this concept teaches." }
```

Mark it `required` so the model commits to the mapping.

### 4. Server-side coverage validation + targeted retry

After parsing the first response:

1. Build `expectedTopics = Set(unit.topics)` per unit (lowercased, trimmed).
2. Build `coveredTopics` per unit from the union of returned `covers_topics` (matched case-insensitively, with a small Levenshtein/substring tolerance for paraphrases).
3. If any unit has `coverage < ~85%` of its topics, run **one** targeted retry call that passes only the under-covered units + their missing topics and asks for additional concepts (using the same tool schema). Merge with dedupe.
4. Cap retries at 1 to bound cost/latency.

### 5. Truncation detection

After `aiData = await aiResp.json()`:

- Inspect `aiData.choices?.[0]?.finish_reason`. If it's `"length"`, log it and trigger the same retry path (split units in half and call twice) before returning.
- If `tool_call.function.arguments` fails `JSON.parse`, log the raw length and finish_reason instead of silently returning `[]`.

### 6. Frontend (`src/pages/teacher/ConceptReview.tsx`) — minor

- Display per-unit coverage badge (e.g. `Covers 7/8 topics`) on each unit's suggestion card so the teacher can see if the AI missed something. No behavior change beyond rendering values returned by the edge function (`units[i].coverage = { covered, total }`).

## Files touched

- `supabase/functions/suggest-concepts/index.ts` — params, prompt, schema, validation/retry, finish_reason handling, response includes per-unit coverage.
- `src/pages/teacher/ConceptReview.tsx` — render coverage badge.

## Out of scope

- `recommend-additional-concepts` (works on already-confirmed concepts, not raw syllabus coverage).
- DB schema, lesson plan, or diagnostic generation changes.

## Open question

Should the retry escalate to `openai/gpt-5` if `gemini-2.5-pro` still under-covers after one retry? Default plan says no (cost + provider switch); flagging in case you want a second-tier fallback.
