# Hide "Industry-Relevant Exercise & Suggested Articles" for coding/lab weeks

## Goal
Coding/lab weeks get their exercises from the dedicated **Coding exercises** section, so the generic resources section ("Industry-Relevant Exercise & Suggested Articles") is redundant there. Remove it from the teacher editor and the student learning path for coding weeks only. Existing resource data stays in the database — it is hidden, not deleted. AI generation is guarded so coding weeks never gain resources.

## Phase 1 — Teacher editor (`src/pages/teacher/CourseCreation.tsx`)
- Wrap the resources `<section>` (the "Industry-Relevant Exercise & Suggested Articles" block, ~lines 2002–2130) in `{!w.is_coding_week && (...)}`, mirroring the existing pattern already used for the Weekly Quiz section (line 2139). Teaching and exam weeks are unchanged.
- **Regenerate button**: keep it enabled for coding weeks (refreshing title/overview is still useful), but:
  - Pass `is_coding_week: target.is_coding_week` in the `regenerate-lesson-plan-week` invoke body (~line 856).
  - When the target week is a coding week, do **not** apply `data.resources` to state — preserve the week's existing (hidden) resources so a regenerate can't silently strip them.
- Update the regenerate confirm dialog copy (~line 2495) so coding weeks read: only the week's **title** and **overview** will be replaced.

## Phase 2 — Edge-function guards
- **`supabase/functions/regenerate-lesson-plan-week/index.ts`**: accept an `is_coding_week` boolean. When true, drop the "1 coding-exercise + 1–2 article resources" instruction from the system prompt and force `resources: []` in the response (same shape as the existing exam-week short-circuit, but still LLM-authoring title/overview).
- **`supabase/functions/generate-lesson-plan/index.ts`**: defensive guard only — coding weeks are manual-only today and the generator never creates them. Add a prompt line stating coding/lab weeks must have empty resources, and a post-processing rule (next to `capResources`) that forces `resources: []` on any week flagged `is_coding_week`, so the invariant holds even if generation ever emits coding weeks.

## Phase 3 — Student learning path
- **`src/components/student/UnitPathwayCard.tsx`**: compute `visibleResources = isCodingWeek ? [] : resources` and use it for `readingCount` / `readingsDone` / the "Readings & exercises" block. The block already renders only when the count is > 0, so it disappears for coding units automatically. The separate read-only **Coding exercises** block is untouched.
- **`src/pages/student/StudentLearningPath.tsx`**: pass `resources={[]}` for coding weeks (defense in depth alongside the card-level gate).
- No `StudentHome` change needed — its "What to do today" cards don't render week resources, and the coding-unit CTA already points at "View exercises".

## Phase 4 — Tests & verification
- Add/extend a `UnitPathwayCard` test: a coding week with resources in props renders no "Readings & exercises" section; a teaching week with the same resources still does.
- Run typecheck plus the `UnitPathwayCard` and `StudentHome` vitest suites.

## Risks & constraints
- **RAG indexing**: hidden resources remain in the published lesson-plan JSON, which is indexed for the TA chat — the chatbot could still reference a coding week's hidden articles. Accepted for now (per the "hide, don't delete" decision); stripping them from the indexed payload would be a separate change.
- **Republish preservation**: `upsertPublishedWeeks` preserves `resources` across clean-slate republishes, so hidden data survives re-publishing — consistent with the hide-only decision.
- **No DB migration** required; no schema or RLS changes.
- `duplicateWeekAsCoding` already clones weeks without copying resources, so newly duplicated coding weeks start clean — no change needed there.
