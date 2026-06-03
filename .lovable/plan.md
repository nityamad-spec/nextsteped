# Concept Mastery Map — UI refresh

Scope: `src/pages/teacher/CourseDashboard.tsx` only. Static UI change, no data/logic changes.

## Changes

1. **Heading**
   - Card title: "Concept Exploration Map" → "Concept Mastery Map"
   - Card description: update to "Aggregate mastery across enrolled students" (kept neutral; no behavior change)

2. **Legend (4-stop gradient)**
   - Replace the three swatches (Deeply Explored / Touched / Not Explored) and the right-side mastery dots with a single continuous gradient bar showing 4 labeled stops:
     - Beginner → `hsl(var(--mastery-beginner))`
     - Developing → `hsl(var(--mastery-progressing))` (token name stays "progressing", label shows "Developing")
     - Proficient → `hsl(var(--mastery-proficient))`
     - Expert → `hsl(var(--mastery-expert))`
   - Layout: a thin gradient strip (`bg-gradient-to-r from-mastery-beginner via-mastery-progressing via-mastery-proficient to-mastery-expert`) with the 4 labels evenly distributed underneath.

3. **Per-concept rows**
   - Drop the right-side `{deep} deep · {touched} touched · {unexplored} unexplored` counts.
   - Drop the leading colored dot and the existing two-segment (deep/touched) progress bar.
   - Replace with a single 4-stop gradient bar (same gradient as legend) for each concept, with a small marker (vertical tick) positioned at `masteryPct%` indicating that concept's static mastery level.
   - Keep click-to-expand removed (no longer meaningful without the count breakdown) — row becomes a simple, non-interactive display.
   - Concept name stays on the left; the mastery label (Beginner/Developing/Proficient/Expert, derived from `masteryPct` thresholds 0–25 / 25–50 / 50–75 / 75–100) shows on the right as small muted text.

4. **Cleanup**
   - Remove `expandedConcept`, `hoveredConcept` state and the expanded-row block.
   - Keep `mockStatsFor` but only `masteryPct` is used now.

## Technical notes

- All colors via existing tokens in `tailwind.config.ts` (`mastery-beginner`, `mastery-progressing`, `mastery-proficient`, `mastery-expert`) — no hardcoded hex.
- No DB, hook, or route changes. Loading / error / empty states preserved.
- Note: project memory says mastery levels are hidden from professors; this request explicitly overrides that for the dashboard map. I'll update `mem://style/mastery-levels` after implementation.
