## Goal

Add an independent LLM call ("Step 0 — Order Verification") that re-orders the approved concepts to match the pedagogical order implied by the syllabus document, BEFORE the existing effort-estimation and weekly distribution steps. The teacher-approved concept set is preserved exactly (no add/drop); only sequence may change.

## Where it fits

In `supabase/functions/generate-lesson-plan/index.ts`, between current step 2 (load concepts) and current step "STEP 1: LLM call A — estimate per-concept effort". The reordered list then flows into all downstream code unchanged (effort, allocator, week authoring).

```text
load concepts (creation order)
  └── NEW: LLM Call 0 — verify_concept_order(syllabus, concepts) ──► canonicalOrderedConceptNames
        └── STEP 1 effort estimation (uses new order)
              └── allocator (uses new order)
                    └── STEP 2 author weeks
```

## LLM Call 0 — design

- **Model:** `google/gemini-2.5-pro` (consistent with current Step 1/2; reasoning-heavy, structured output)
- **Tool calling** (no JSON parsing of free text). Tool name: `verify_concept_order`
- **Inputs in prompt:**
  - Course name/term/objectives (light context)
  - Approved concept list (current order, names exactly as stored)
  - Syllabus context (existing `syllabusContext`, capped ~10k chars)
  - Lesson-plan doc excerpts (existing `lessonPlanExcerpts`, capped ~6k chars) — used only as secondary signal
- **Tool schema (returned):**
  ```json
  {
    "ordered_concepts": [
      { "name": "<exact input name>", "rationale": "<≤15 words why this position>" }
    ],
    "changed": true,
    "notes": "1–3 sentence summary of any reordering decisions or 'order already matches syllabus.'"
  }
  ```
- **System rules (strict):**
  - MUST return exactly the same set of names as input (no add, no drop, no rename, case-preserved).
  - Order MUST reflect syllabus sequence first, lesson-plan docs second; teacher's current order is a tiebreaker only.
  - Honor explicit prerequisites stated in the syllabus.
  - If syllabus is silent or absent, return original order with `changed: false`.
- **Temperature:** 0.1, `seed: 42`, `reasoning: { effort: "high" }`, `max_tokens: 4096`.

## Validation & safety net

After the call, validate the result before adopting it:
1. Build `Set` of input names (case-insensitive). Reject result if returned set ≠ input set OR length differs.
2. Map each returned `name` back to its canonical input spelling via existing `conceptNameLookup`.
3. On any validation failure, log a warning, keep the original order, and append a `warnings` entry: `"Order verification rejected (shape mismatch); kept original order."`
4. On AI 429/402, fall back to original order (do NOT block the whole generation) and add a warning. Generation always proceeds.
5. If `syllabusContext` is empty, skip the call entirely (no signal to verify against) and add a warning: `"No syllabus text available; kept teacher-approved order."`

## Code changes (single file)

**File:** `supabase/functions/generate-lesson-plan/index.ts`

1. After line ~118 (`conceptNameLookup` built), add a new `// ─── STEP 0: Order verification ───` block:
   - Build prompt + tool schema described above.
   - `callOrderLLM()` helper mirroring `callEffortLLM()` shape.
   - Try once, retry once on shape mismatch, then fall back.
   - If accepted, reassign `orderedConceptNames` AND reorder `teacherWeights` in lockstep so weight↔name alignment is preserved.
   - Push a meta entry: `orderVerification: { changed, notes, originalOrder, newOrder, accepted }`.
2. Move file/syllabus loading (current section "3.") ABOVE the new Step 0 so `syllabusContext` exists when needed. (Effort step already depends on it, so no behavior change for downstream.)
3. Extend the response `meta` payload with `orderVerification` so the front end (and logs) can show what happened.

## Front-end impact

None required for this slice. The reorder is invisible to the teacher except through the resulting weekly distribution. We can optionally surface `meta.orderVerification.notes` later as a small info chip on the Lesson Plan page, but that's out of scope here.

## Out of scope

- Persisting the new order back into the `concepts` table (kept ephemeral, per current architecture where Concept Review is the source of truth for set membership; ordering for the plan is plan-local).
- Asking teacher to confirm the reorder before generation (could be a future enhancement; current flow stays one-click).
- Changes to per-week regenerate or to Concept Review screen.

## Risks / mitigations

- **Hallucinated/renamed concept** → strict set-equality check + canonical name remap; reject and fall back.
- **Extra latency** (one more `gemini-2.5-pro` call with high reasoning) → acceptable; user already accepted "maximum quality without considering cost." Logged via `usage` like the other calls.
- **Weight misalignment after reorder** → reorder both arrays in the same loop, unit-trace logged in `meta`.
