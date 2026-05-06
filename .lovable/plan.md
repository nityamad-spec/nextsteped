## Problems observed

1. **Missing concepts** — some approved concepts never appear in any week of the generated plan.
2. **Duplicated topics** — the same concept name shows up in more than one week (or twice in a single week).

## Root causes in `supabase/functions/generate-lesson-plan/index.ts`

1. **Allocator overflow path** (lines ~549–557): when a concept still has remaining `need` after `twPtr` runs out of teaching weeks, it is force-pushed into the *last* teaching week. The dedup guard there only checks the *last* item in that week, so if the concept was already added to an earlier week and then re-pushed at the end, we get a cross-week duplicate.
2. **Defensive repair** (lines ~713–727): all `unassigned` concepts are dumped into a single trailing week with no global dedup, no even distribution, and no guard against a near-duplicate already present in another week.
3. **No global uniqueness invariant** — nothing in the pipeline asserts "each approved concept appears in exactly one week." The LLM authoring step is locked out of changing concepts, so any duplication/omission introduced by the allocator silently ships to the UI.
4. **Case/whitespace drift** — the allocator compares names with strict `!==`. Two approved concepts that differ only in surrounding whitespace or casing (rare but possible after the order-verification remap) can dodge dedup checks.

## Fix plan (single file: `supabase/functions/generate-lesson-plan/index.ts`)

### A. Make the allocator dedup-safe

- Maintain a module-local `globalAssigned = new Set<string>()` keyed by `name.trim().toLowerCase()` while pouring concepts into weeks.
- Before pushing a concept name into `weekAssign[wIdx].concept_names`, check both:
  - it is not already the last item of that week (existing check), AND
  - its lowercase key is not already in `globalAssigned` from a *different* week.
- If `globalAssigned` already has the name, do NOT re-push; just consume the remaining `slots_used` budget on that week without adding the label again. (Slots are a pacing budget; the topic is already taught.)
- Replace the "force into last teaching week" overflow branch with: pick the teaching week with the lowest `slots_used` that does not already contain this concept; if none exists, drop the extra slots and emit a warning.

### B. Replace the blunt repair step with a structured validator

After Step 4 produces `normalized`, run one validator pass that enforces TWO invariants and emits warnings instead of silent fixes:

```text
invariant 1: union(week.concepts.name) == orderedConceptNames (set equality)
invariant 2: no name appears in concepts[] of more than one week
invariant 3: no name appears twice within the same week
```

Algorithm:

1. Walk `normalized` once and de-duplicate within and across weeks (keep first occurrence, drop later ones). Push warning per removed dup: `"Removed duplicate concept '<name>' from Week N (already in Week M)."`
2. Compute `missing = orderedConceptNames - seenSet`.
3. For each missing concept, append it to the teaching week with the fewest concepts (ties broken by earliest week). Push warning: `"Repaired missing concept '<name>' into Week N."`
4. Re-assert invariants; if anything still fails, surface it in `meta.warnings` so the front end shows it.

Use lowercased trimmed keys for all comparisons; canonicalize back via `conceptNameLookup` so the displayed spelling stays consistent.

### C. Tighten the locked-assignment prompt to the author LLM

Add a single explicit rule to the `authorSystem` prompt: "Each concept name appears in exactly one week. Do not echo concept names from other weeks in this week's `overview`." This reduces visible duplication in the rendered overview text even though the structural fix above is what guarantees correctness.

### D. Surface counts in `meta` for traceability

Extend the `meta` payload with:

- `meta.duplicateConceptsRemoved: string[]`
- `meta.repairedMissingConcepts: string[]`
- `meta.invariantsHeld: boolean`

These are already-warned items, but having them as structured fields lets us assert in future debugging without grepping warnings.

## Out of scope

- Front-end rendering changes in `CourseCreation.tsx` / `lessonPlanShape.ts` — once the edge function emits a clean, deduped, fully-covering structure, the existing UI renders correctly.
- Per-week regenerate (`regenerate-lesson-plan-week`) — that endpoint receives the locked concept list from the client, so it already cannot duplicate or drop concepts.
- Persisting changes to the `concepts` table.

## Files to edit

- `supabase/functions/generate-lesson-plan/index.ts` (allocator overflow branch + new validator + prompt nudge + meta fields)
