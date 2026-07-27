## Goal
On hover of an unearned achievement tile on `/student/home`, show clear "how to earn it" guidance with current progress.

## Scope
Frontend only. Two files:
- `src/hooks/useAchievements.ts` — add a structured `howTo` field per achievement (title + steps + progress).
- `src/components/student/AchievementsCard.tsx` — render richer tooltip content for unearned tiles.

No data model, query, or backend changes.

## Tooltip content per achievement (unearned)

- **First Steps** — "Complete Unit 1 basics"
  - Take the Week 1 quiz — {done ✓ / not yet ✗}
  - Open this week's Learning Path readings — {done ✓ / not yet ✗}
- **Comeback** — "Grow any concept from Beginner to Expert"
  - Current best jump: {name} — {baselineLevel} → {currentLevel} (or "No concept promoted yet")
- **Consistency** — "Take a weekly quiz two weeks in a row"
  - Progress: {consistencyCount}/2 weeks
  - Missing: {this week / last week}
- **Concept Master** — "Reach Proficient or Expert on every concept"
  - Progress: {proficientCount}/{totalConcepts} concepts

Earned tiles keep a short confirmation tooltip ("Earned — {reason}").

## Implementation notes

`useAchievements` currently builds `tooltip: string`. Change each achievement to also expose:
```ts
howTo: { title: string; steps: { label: string; done: boolean }[] }
```
Keep `tooltip` for back-compat / earned state.

`AchievementsCard` `TooltipContent`:
- If `earned` → single-line label (current behavior).
- If not earned → render `howTo.title` as bold header, then a compact checklist (✓ / ○) of steps with muted text for done, foreground for pending. Width `max-w-[240px]`.

Use existing shadcn `Tooltip`; no new deps.

## Risks
- Baseline snapshotting for Comeback is client-side (localStorage) — tooltip will accurately reflect stored baseline, which is what the achievement itself uses, so consistent.
- Tooltip on touch devices: shadcn Tooltip already handles this; no change needed.

## Files
- `src/hooks/useAchievements.ts` — extend `Achievement` type + populate `howTo` for all four.
- `src/components/student/AchievementsCard.tsx` — conditional tooltip rendering.
