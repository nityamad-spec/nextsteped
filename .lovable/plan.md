## Goal
Match the attached screenshot for the Concept Mastery section on `/student/home`, and open the existing full mastery map in a modal when the user clicks "View full mastery map →".

## Scope
Frontend only. `src/pages/student/StudentHome.tsx` + one new component. No data model or query changes — reuse existing `concepts`, `conceptMastery`, `courseMastery` state.

## Design (summary card)
Replace the current large heatmap card at lines 658–727 with a compact card:

- Header row:
  - Left: Title **"Concept mastery"** (serif or existing heading style) + subtitle "A quick view of where you stand".
  - Right: Large `NN%` in primary color + small "OVERALL" label. Value = `Math.round(courseMastery * 100)`.
- Thin progress bar (h-2) under header, same source as today.
- Two mini stat tiles side-by-side:
  - **Strong concept** (soft green bg): concept with highest mastery among those with `attempted > 0`. Shows name (bold), `NN% · <MasteryLabel>`.
  - **Needs attention** (soft amber bg): concept with lowest mastery among attempted (>0). Shows same fields.
  - If fewer than 2 attempted concepts, degrade gracefully: hide the missing tile and show a hint ("Take a quiz to see your strongest concept").
- Footer link button: **"View full mastery map →"** (ghost/link style, left-aligned) that opens the modal.

Small "Preview"-style badge in the top-left corner of the card is decorative in the screenshot — we'll skip it (consistent with the "Personalised" change already made elsewhere) unless you want it kept.

## Full map modal
New component `src/components/student/ConceptMasteryDialog.tsx`:
- shadcn `Dialog` with `max-w-3xl`.
- Header: "Concept mastery map" + current overall % + progress bar.
- Body: the existing full grid (concept tiles with `MASTERY_TILE_CLASS`, tooltips, %), the legend row, and the "engage with TA" helper text — moved verbatim from current `StudentHome`.
- Props: `open`, `onOpenChange`, `concepts`, `conceptMastery`, `courseMastery`.

`StudentHome` holds a `masteryDialogOpen` state; the summary card's link toggles it.

## Selection logic for the two tiles
```
attemptedList = concepts
  .map(c => ({ c, m: conceptMastery[c.id] }))
  .filter(x => (x.m?.attempted ?? 0) > 0)
  .map(x => ({ id: x.c.id, name: x.c.name, score: x.m.score, level: getMasteryLevel(x.m.attempted, x.m.score) }));

strongest = maxBy(attemptedList, x => x.score);
weakest   = minBy(attemptedList, x => x.score);   // if same as strongest, hide weakest tile
```

## Risks / notes
- Empty state (no attempted concepts yet): summary still renders header + progress at 0%; both tiles collapse into a single "Start a quiz to build your mastery" hint. Link still opens modal, which shows all concepts as Not Explored.
- No changes to mastery scoring, DB, or navigation routes.
- Legend + tips only live inside the modal after this change; that's intentional to keep the home card compact.

## Files
- `src/pages/student/StudentHome.tsx` — replace lines 658–727 with the new summary card; add dialog state + render `<ConceptMasteryDialog />`.
- `src/components/student/ConceptMasteryDialog.tsx` — new.
