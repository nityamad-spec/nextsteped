## Goal
On `/student/home`, the "Concept Exploration & Mastery Map" tiles currently show only the concept name + percentage (or "—") with a generic status ("Not explored" / "Touched" / "Deeply explored"). Replace this with the real mastery **level** (Beginner / Developing / Proficient / Expert) already computed in the backend.

## Changes (UI only, `src/pages/student/StudentHome.tsx`)

1. **Add a level helper** that mirrors the backend `bandFor` thresholds (`update-mastery/index.ts`):
   - score ≤ 0.25 → Beginner
   - ≤ 0.50 → Developing
   - ≤ 0.75 → Proficient
   - > 0.75 → Expert
   - `attempted === 0` → Not explored

2. **Tile rendering (lines 746–768):** replace the existing `MasteryStatus` derivation so each tile shows:
   - Line 1: concept name (unchanged)
   - Line 2: the level label (e.g. "Proficient") instead of the bare `%`
   - Keep `%` as small secondary text under the label when attempted (otherwise hidden)
   - Color mapping:
     - Not explored → existing muted background
     - Beginner → soft destructive tint
     - Developing → amber/warning tint
     - Proficient → primary/20
     - Expert → solid primary

3. **Legend (lines 771–784):** swap the 3-item legend (Not explored / Touched / Deeply explored) for a 5-item legend matching the new levels and their swatches.

4. **Tooltip (line 763):** show `"<concept>: <Level> (<pct>% mastery)"` when attempted, else `"<concept>: Not explored"`.

5. **Remove now-unused** `MasteryStatus` type, `getMasteryColor`, `getMasteryLabel` (or repurpose them to the new level-based helpers).

## Out of scope
- No backend / schema / query changes — `student_concept_mastery.mastery_score` is already fetched into `conceptMastery`.
- No changes to course-level mastery display, progress bar, or other surfaces.
- Professor-facing views are not touched (rule stays: not shown to professors).

## Memory update
Update `mem://index.md` Core rule: mastery level names are now visible to **students** on the home heatmap; still hidden from professors.
