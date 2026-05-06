
# Weight- and Complexity-Aware Lesson Plan Distribution

## Problem

`generate-lesson-plan` currently sends all approved concepts + the syllabus/lesson docs to a single LLM call and asks it to "distribute, maintain order, balance load." It ignores the `concepts.weight` value the teacher already curated, has no explicit per-concept time estimate, and the single-shot prompt occasionally drops or unevenly clusters concepts (the existing fallback just dumps unassigned concepts into the last teaching week).

We will replace this with a deliberate multi-step pipeline so the final plan provably covers every concept and distributes them by weightage + estimated mastery time.

## Pipeline (all inside `supabase/functions/generate-lesson-plan/index.ts`)

```text
Step 0  Load concepts (with weight) + course + exam weeks + syllabus/docs context
Step 1  LLM call A — Estimate mastery effort per concept
Step 2  Deterministic allocator — Convert (weight, effort) → integer "session slots" per week
Step 3  LLM call B — Author week metadata (week_name, overview, resources) given the fixed assignment
Step 4  Validate full coverage → repair pass if needed → persist
```

Each LLM call has a tight, single-purpose schema so the model can't drop concepts.

### Step 1 — Mastery-effort estimation (LLM call A)

Input to the model:
- Course name/term/objectives
- For each approved concept: `{ index, name, teacher_weight }` (weight already on `concepts.weight`, 0–1)
- Short syllabus excerpt + lesson-plan excerpts (already loaded today) for pacing signals

Tool schema (single function call):
```ts
estimate_concept_effort({
  concepts: [{
    index: number,
    name: string,                       // echoed exactly
    complexity: 1 | 2 | 3 | 4 | 5,      // intrinsic difficulty
    estimated_sessions: number,         // 0.5 .. 3 (step 0.5) — sessions an avg student needs to reach proficiency
    rationale: string                   // one sentence, used only for logs
  }]
})
```

The system prompt explicitly states: "Return one entry per input concept, in the same order, with the name spelled exactly as given. Do not add or remove concepts." Server-side we assert `result.length === input.length` and that every name resolves; on mismatch we retry once, then fall back to `complexity=3, estimated_sessions=1` for missing entries.

### Step 2 — Deterministic allocator (no LLM)

Inputs:
- `teacherWeights[]` (from `concepts.weight`, normalized to sum to 1)
- `estimatedSessions[]` (from Step 1)
- `totalWeeks`, `sessionsPerWeek`, exam weeks
- Optional `complexity[]` for tie-breaking

Algorithm:
1. `totalSessions = (totalWeeks - examWeeks) * sessionsPerWeek`
2. For each concept compute a blended demand:
   `demand_i = α * normalize(teacherWeights[i]) + (1-α) * normalize(estimatedSessions[i])`, default `α = 0.6` (teacher weight wins ties; complexity reshapes the long tail).
3. Raw allocation: `slots_i = demand_i * totalSessions`. Apply largest-remainder rounding so slots sum exactly to `totalSessions` and `slots_i >= 1` for every concept (guaranteed coverage; if `concepts.length > totalSessions`, fall back to `slots_i = 1` and pack multiple concepts per session — surfaced as a teacher-visible warning).
4. Walk concepts in their existing approved order (we keep the current ordering rule) and pour them into teaching weeks left-to-right, never crossing exam weeks. A concept whose slot count exceeds the remaining capacity in the current week spans into the next week (same name appears in both — already supported by the renderer).
5. Output: `assignment: Array<{ week: number, concept_names: string[], session_slots_used: number }>` covering all `totalWeeks`, with exam weeks marked and empty.

This step is pure TypeScript, fully deterministic, fully testable, and is the actual guarantor of "every concept appears" + "distribution honors weight × effort." The LLM never gets to drop concepts again.

### Step 3 — Week authoring (LLM call B)

Now the assignment is frozen. We ask the model to *only* author readable metadata for each week.

Tool schema:
```ts
author_weeks({
  weeks: [{
    week: number,                       // echoed
    week_name: string,                  // 3–6 words; "" for exam weeks
    overview: string,                   // 1–2 sentences; fixed string for exam weeks
    resources: [                        // capped server-side: 1 coding-exercise + 1–2 articles
      { type: "coding-exercise" | "article", title, description, url?, ai_suggested: true }
    ]
  }],
  overall_course_learning_outcomes: string
})
```

The user prompt passes the locked `assignment` per week ("Week 3 covers: Functions, Scope. Author title/overview/resources for THIS exact set"). The model cannot add/remove/reorder concepts because they aren't part of its output schema.

If a single Step 3 call risks truncation for long courses (>16 weeks with dense resources), batch in chunks of 8 weeks and merge — the assignment is already fixed so chunking is safe.

### Step 4 — Validate, repair, persist

- Re-derive `concepts[]` per week from the Step 2 assignment (source of truth), attach Step 3's `week_name/overview/resources`.
- Assert: every approved concept name appears in `union(weeks[].concepts)`. If not (should be impossible after Step 2 but defensive), append missing ones to the nearest non-exam week and log a warning into the response.
- Persist to `lesson_plan_weeks` via the existing `upsertPublishedWeeks` flow (no schema change).
- Response payload adds `meta: { effort_estimates, allocation, warnings }` so the frontend progress UI can show what happened.

## Frontend changes (`src/pages/teacher/CourseCreation.tsx`)

Update the existing 3-step generation indicator (already added in the previous task) to reflect the new pipeline and longer expected runtime:

- Step labels: "Estimating concept effort" → "Distributing across weeks" → "Authoring week details"
- Bump ETA from 60s → **90s** (range 60–150s) and update the "taking longer" threshold to 150s.
- Show a small footnote under the bar: "Using teacher-set weights and AI-estimated complexity to balance the schedule."
- No other UI changes; the rendered plan format is unchanged because we still emit the same `weeks[]` shape.

## Files touched

- `supabase/functions/generate-lesson-plan/index.ts` — full rewrite of the body (steps 1–4); keep file/CORS scaffolding and concept loading. Single config block (no `verify_jwt` change needed).
- `src/pages/teacher/CourseCreation.tsx` — progress copy + ETA tweaks only.
- `.lovable/memory/features/lesson-plan-generation.md` — note the new pipeline + that `concepts.weight` is now an input.

## Out of scope

- DB schema changes (weights already exist on `concepts`; no new columns).
- Editing the rendered plan layout, "Update Plan" gating, or `TeachingPlan.tsx`.
- Streaming progress from the edge function (still polled via elapsed timer).
- Changing the Concept Review UI or weight semantics.

## Risks & mitigations

- **Step 1 returns wrong count / renamed concepts.** Strict server-side validation + one retry + safe fallback values.
- **Per-concept slot < 1 when concepts > sessions.** Allocator falls back to packing; warning surfaced to teacher.
- **LLM still tries to invent concepts in Step 3.** Schema in Step 3 has no `concept_names` field, so it physically cannot.
- **Longer total runtime (~90s).** Existing progress bar already handles "taking longer" copy; ETA bumped accordingly.
