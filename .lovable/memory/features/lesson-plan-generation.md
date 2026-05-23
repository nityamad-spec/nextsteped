---
name: lesson-plan-generation
description: Lesson plan AI output format and generation gating. Generation is now MANUAL — professor must fill Course Schedule (Total Weeks, Classes per Week, Duration per Class, Midterm Week, Final Week — all 5 required) and click "Generate Lesson Plan". After plan exists, "Regenerate" is replaced with "Update Plan" which only enables when schedule (including cadence) has changed since last generation.
type: feature
---

## Multi-step generation pipeline (weight + complexity aware)

`generate-lesson-plan` runs a 3-step pipeline (no longer a single LLM call):
1. **LLM A — estimate effort**: Gemini 2.5 flash returns per-concept `complexity (1-5)` and `estimated_sessions (0.5-3)`. Strict tool-call schema; defaults to `complexity=3, sessions=1` for any concept the model drops, plus a warning.
2. **Deterministic allocator (TS)**: blends teacher `concepts.weight` and AI `estimated_sessions` (`α=0.6` favors teacher weight) into demand, distributes session slots via largest-remainder rounding with `slots_i ≥ 1` guarantee, then pours concepts in approved order across teaching weeks (skipping exam weeks). When `concepts > totalSessions`, packs multiple per session and warns.
3. **LLM B — author weeks**: Gemini 2.5 pro receives the LOCKED week→concepts assignment and only writes `week_name`, `overview`, `resources`, and `overall_course_learning_outcomes`. Concepts are NOT in its output schema, so it cannot drop or invent them.

Response includes `meta.allocation` (per-concept weight, complexity, est. sessions, allocated slots) and `meta.warnings`. Total runtime ~60–150s (frontend ETA = 90s).

`generate-lesson-plan` edge function emits per-week:
- `week_name` (3–6 word theme), `overview` (1–2 sentences)
- `concepts[]` (Topics Covered) — 2–5 items; last 1–2 surface as "Key Concepts to Include"
- `resources[]` capped: exactly 1 `coding-exercise` + 1–2 `article`
- top-level `overall_course_learning_outcomes` (one paragraph)

Renderer in `CourseCreation.tsx` shows: Week N — <week_name>, Overview, Topics Covered, Industry-Relevant Exercise & Suggested Articles (combined section), Key Concepts to Include (highlighted callout from last 1–2 concepts), and a closing "Overall Course Learning Outcomes" card.

NEVER render "Learning Outcomes by Week" or "Additional Tips".

Gap mode: auto-on when teacher uploaded any `lesson-plans` files. System prompt instructs AI to emit only NEW additions/gaps, mark all items `ai_suggested=true`. UI shows banner: "Since you've uploaded existing teaching materials, the plan below highlights gaps and additions not already covered in what you've shared."

## Generation gating (manual, schedule-driven)

`CourseCreation.tsx` has 3 phases: `idle` → `generating` → `plan`.
- **idle** (no plan exists): renders only the Course Schedule form (Total Weeks, Midterm Week, Final Week — all 3 required) + a disabled "Generate Lesson Plan" button. Button enables once all 3 fields are set; clicking it triggers `runGeneration()` and switches to `generating`.
- **generating**: shows the 3-step progress indicator. Errors offer Retry / Go to Concept Review / Back to Materials.
- **plan**: shows the full editable plan. The schedule card and the "Weekly Breakdown" header both expose a single "Update Plan" button (replaces the old "Regenerate" buttons). Update Plan is disabled unless ALL of: schedule complete AND `lastGeneratedSchedule` differs from current values. Clicking it opens a confirm modal ("This will replace your current weeks and any edits…") which calls `runGeneration()` directly.

`lastGeneratedSchedule` snapshot (`{ total_weeks, midterm_week, final_week }`) is set after each successful generation and persisted in the draft (`LessonPlanDraft.lastGeneratedSchedule`) so the change-detection survives reloads. Existing professors with a draft/published plan from before this change skip the empty state — `applyDraft` flips phase to `plan` immediately.

The previous auto-trigger effect (`if (phase === "generating" && !weeks.length && totalWeeks) runGeneration()`) has been REMOVED. Generation only happens via explicit user click.
