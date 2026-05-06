# Add Progress Bar + ETA on Lesson Plan Generation

The `/teacher/setup/lesson-plan` route renders `CourseCreation.tsx`. Its `phase === "generating"` view already shows a 3-step checklist and tracks `genElapsed` (seconds), but there's no progress bar and no estimated-time readout shown to the teacher.

Add a progress bar with live elapsed/ETA copy that mirrors the pattern just added on `/teacher/setup/concept-review`.

## UI

In the generating-phase block (around lines 735–760), under the existing "Usually takes 30–90 seconds." subtitle, insert:

- A `<Progress>` bar that fills asymptotically based on elapsed time vs. an ETA of **60s** (mid-point of the existing 30–90s range), capped at ~92% so it never appears "done" before the API returns. On success (`setGenStep(2)` then `setPhase("plan")`), briefly show 100% before the view swaps.
- A subtext line directly under the bar:
  - Normal: `Elapsed 0:24 · Est. ~60s`
  - Once `genElapsed > 60`: `Taking longer than usual… (1:12)`
  - The existing `genElapsed > 90` warning block stays as-is.

The 3 step cards (`genSteps`) remain unchanged below the bar for granular feedback.

## Technical

Files:
- `src/pages/teacher/CourseCreation.tsx` — only file changed.

Implementation:
- Import `Progress` from `@/components/ui/progress`.
- Add a small helper `fmt(s)` → `m:ss` (local to this file).
- Compute `pct`:
  - While generating and no error: `Math.min(92, (genElapsed / 60) * 90)`.
  - When `genStep === 2` (success path right before `setPhase("plan")`): force `100`.
  - When `genError` is set: keep current pct, render bar in muted state.
- Render `<Progress value={pct} className="h-2" />` plus the elapsed/ETA paragraph between the heading block and the `genSteps` list.
- Reuse existing `genElapsed` timer; no new state needed beyond a derived `pct` value.

Out of scope:
- Edge function changes (no streaming progress available from `generate-lesson-plan`).
- The `restoringDraft` and "AI Suggest" per-week flows (those are separate spinners on `TeachingPlan.tsx`).
- Any change to the existing `genSteps` checklist or the 90s "taking longer" warning.
