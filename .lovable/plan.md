# Preserve rationale rows when Bloom level is unknown

## Problem

`buildReasoningRows` computes `Math.round(bloomFor(qid) || 1)` for each answer. When
`bloomFor` returns `NaN`, `undefined`, or any non-numeric value, the fallback collapses to
Bloom 1, `requiresReasoning(1)` is false, and the loop `continue`s — so a rationale the
student was *forced* to write is silently discarded and never persisted.

The student-written rationale is itself evidence that the question was Bloom 3+, since the
input widget only appears for Bloom 3 and above.

## Fix

In `src/lib/buildReasoningRows.ts`, split the bloom resolution into two steps:

1. Read the raw value from `bloomFor(qid)` and test it with `Number.isFinite`.
2. If it is finite, clamp to 1-6 as today and keep the existing `requiresReasoning` skip.
3. If it is not finite (NaN, undefined, null, non-numeric), do **not** skip on bloom.
   Instead, check the rationale text first: if the student wrote a complete rationale,
   keep the row and store a fallback `bloom_level` of `3` (the minimum level that
   requires reasoning). If there is no rationale text, skip as before.

The rest of the row construction — text trim/truncate, `isReasoningComplete` check, and
the verdict-matching logic — stays unchanged.

## Tests

Extend `src/lib/buildReasoningRows.test.ts` with cases for:

- `bloomFor` returning `NaN` plus a valid rationale → row is kept with `bloom_level: 3`.
- `bloomFor` returning `NaN` with empty/too-short rationale → still skipped.
- `bloomFor` returning `undefined` / a non-numeric value → same preservation behaviour.
- Finite Bloom 1-2 with stray rationale text → still skipped (no regression).
- AI verdict still attaches correctly on a preserved NaN-bloom row.

## Technical notes

Only `src/lib/buildReasoningRows.ts` and its test file change. No database, edge function,
or UI changes; `bloom_level` remains `NOT NULL`-safe because the fallback writes `3`.
