## Goal
Add a **Generate Questions** button to each exam card on `/teacher/setup/exam-mode`. UI-only — no handler wired up.

## Change
In `src/pages/teacher/ExamMode.tsx`, inside the per-exam card's footer row (the same row that currently holds **Edit Breakdown** and **Approve Estimate**), append a third button:

```tsx
<Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { /* not wired yet */ }}>
  <Sparkles className="mr-1 h-3 w-3" /> Generate Questions
</Button>
```

- Uses `Sparkles` from `lucide-react` (added to existing import).
- No state, no API call, no toast — purely visual.
- Disabled when no question types are selected (same condition as Approve Estimate) so the button doesn't look actionable when there's nothing to generate.

No other files change.
