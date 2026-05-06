# Add Progress Indicator with Estimated Time on Concept Review

Add a determinate-looking progress bar with a live elapsed/estimated-time readout while the two AI calls on `/teacher/setup/concept-review` are running:

1. **Identify Concepts** (`suggest-concepts` edge function) — typically slower, often retries on under-coverage. Estimate ~45s.
2. **Generate Additional Recommendations** (`recommend-additional-concepts`) — single shot, lighter. Estimate ~20s.

## UI behavior

While loading, replace the current bare spinner blocks with a progress card containing:

- A short status line (e.g. "Identifying concepts from your materials…" / "Generating supplementary recommendations…").
- A `<Progress>` bar that fills based on elapsed/estimated time (asymptotic, capped at ~92% so it never visually "completes" before the response returns).
- A subtext line: `Elapsed 0:12 · Est. ~45s` updating every second.
- If elapsed exceeds the estimate, swap copy to `Taking longer than usual… (0:48)` and keep the bar near 92%.
- On completion, fade out and render the existing results list.

The Identify Concepts trigger button keeps its existing inline `Identifying…` spinner; the new progress card lives in the Extracted Concepts card body (replacing the centered spinner) and in the Additional Recommendations card body.

## Technical

Files:
- `src/pages/teacher/ConceptReview.tsx` — only file changed.

Implementation:
- Add a small local `ProgressWithETA` component (in-file) that takes `{ etaSeconds, label }`, manages its own `setInterval` ticking elapsed seconds, and computes:
  - `pct = Math.min(92, (elapsed / eta) * 90)` for a smooth ease toward ~90%.
  - When `elapsed > eta`: show "Taking longer than usual…".
- Use it in two places:
  - Extracted Concepts card body, replacing the `loadingSuggestions` spinner block (lines ~384–387). `etaSeconds={45}`, label "Scanning materials and extracting concepts per unit…".
  - Additional Recommendations card body, replacing the `loadingRecs` spinner block (lines ~544–547). `etaSeconds={20}`, label "Reviewing your syllabus and confirmed concepts for gaps…".
- Use the existing `Progress` component from `@/components/ui/progress` (already in project).
- No edge function changes, no schema changes.

Out of scope:
- Real server-side progress streaming (edge functions don't emit progress events).
- Changes to the trigger buttons' inline spinners.
- Any other page or component.
