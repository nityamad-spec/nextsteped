
## Goal

Capture the two currently-NULL columns on `diagnostic_questions` (`bloom_justification`, `difficulty_justification`) from Gemini at generation time, using a constrained, categorised format so values are consistent and analysable — not free-form prose.

## Format decision

Each justification is stored as a single string in the form:

```
<CATEGORY>: <short rationale>
```

- Non-empty, ≤ 300 characters total
- `<CATEGORY>` MUST be one of a fixed enum (below)
- `<short rationale>` is a 1-sentence explanation tied to *this* question

### Fixed categories — `bloom_justification`

Aligned to the existing Bloom level (1–6) the model already returns:

- `RECALL` — direct recall of fact / syntax / definition (Bloom 1)
- `COMPREHENSION` — explain or interpret a concept or code snippet (Bloom 2)
- `APPLICATION` — apply a rule/procedure to a new but routine case (Bloom 3)
- `ANALYSIS` — decompose, trace, compare, or debug (Bloom 4)
- `EVALUATION` — judge correctness/quality against criteria (Bloom 5)
- `SYNTHESIS` — design or construct a new solution (Bloom 6)

Validator additionally checks the category is consistent with `bloom_level`
(`RECALL`↔1, `COMPREHENSION`↔2, `APPLICATION`↔3, `ANALYSIS`↔4, `EVALUATION`↔5, `SYNTHESIS`↔6).

### Fixed categories — `difficulty_justification`

Aligned to the tier's target difficulty band:

- `SURFACE_RECOGNITION` — recognise a term/output, minimal reasoning (~0.1–0.3)
- `SINGLE_STEP` — one rule or one line of code to reason about (~0.3–0.5)
- `MULTI_STEP` — chain 2–3 concepts or steps (~0.4–0.6)
- `EDGE_CASE` — corner case, subtle distractor, or non-obvious behaviour (~0.6–0.8)
- `COMPOSITE_REASONING` — integrate multiple concepts under constraints (~0.75–0.95)

Validator additionally checks the category is "plausible" for `difficulty_estimate`:
each category has an allowed `[min, max]` band (above); a mismatch is rejected.

## Changes to `supabase/functions/generate-diagnostic-questions/index.ts`

1. **`GeneratedQuestion` interface** — add `bloom_justification: string` and `difficulty_justification: string`.

2. **Tool-call JSON schema** (`submit_questions.parameters`) — add both fields as `string`, list them in `required`. Include the category enum and 300-char limit in the field `description` so Gemini emits the right shape.

3. **System prompt** — add a short section:
   > Each question must include `bloom_justification` and `difficulty_justification`, each starting with one of the allowed categories followed by `:` and a 1-sentence rationale. Total length ≤ 300 chars.
   Followed by the two enum lists and the consistency rules.

4. **`validateMcq`** — extend to:
   - require both strings, non-empty, ≤ 300 chars
   - parse `^([A-Z_]+):\s*(.+)$`; reject if category isn't in the allowed enum
   - reject if `bloom_justification` category doesn't match `bloom_level`
   - reject if `difficulty_justification` category's band doesn't contain `difficulty_estimate`
   - return both normalised strings in `ValidatedQuestion`

5. **`ValidatedQuestion`** — add the two fields.

6. **Row builder (lines 631–647)** — include `bloom_justification` and `difficulty_justification` in the insert payload.

7. **Retry behaviour** — unchanged; existing `MAX_ATTEMPTS=3` and "common issues" hint already surface validator reasons, so category/band violations naturally feed the retry prompt.

## Non-changes

- DB schema: no migration required — both columns already exist on `diagnostic_questions` and are nullable.
- `seed-questions/index.ts`: leave as-is (it already passes these fields through from authored JSON).
- Student-facing UI: unchanged — these justifications are author/analytics metadata, not shown to students.
- Teacher analytics: out of scope here; can later be surfaced in Assessment Analytics if desired.

## Risk / rollout

- Stricter validation may cause more retries on first few generations. Mitigation: the enum + format is explicit in both the system prompt and the tool schema description, and `MAX_ATTEMPTS=3` already retries with reason hints.
- If after 3 attempts a tier still can't satisfy the new fields, the function returns 422 (existing behaviour) — surfaces the problem instead of silently storing junk.
