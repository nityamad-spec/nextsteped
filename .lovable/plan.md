## Problem

In `/student/chat` → Exam Prep → Practice Exam Performance Dashboard → expanded attempt → Question Review, the topic Badge (e.g. "Grounding and Retrieval Augmented Generation…") sits inline next to the question text inside a flex row. The Badge has `whitespace-nowrap` so it claims most of the row width, squeezing the question text into a very narrow vertical column.

## Fix

In `src/components/ExamHistory.tsx` (the Question Review block, ~lines 295–337), restructure each answer card so the topic Badge no longer competes for horizontal space with the question text.

Change the layout to:

1. Top row: check/X icon + question text + answer/correct/explanation (badge removed from here), using full available width.
2. Below that (only when `a.topic` exists): a separate row containing the topic Badge, aligned left under the question content, with `whitespace-normal` and a sensible `max-w-full` so long topic names wrap instead of forcing a single line.

Concretely:
- Remove the inline `{a.topic && <Badge … shrink-0>…</Badge>}` from the flex row.
- After the inner content `<div className="flex-1 min-w-0 text-left">…</div>` block, render the topic badge in its own row (e.g. `<div className="pl-5"><Badge variant="outline" className="text-[9px] whitespace-normal">{a.topic}</Badge></div>`) so it appears under the question, indented to align with the text (past the icon).

No changes to logic, data, or other components. Pure presentation tweak.

## Files

- `src/components/ExamHistory.tsx` — restructure the Question Review answer card layout.
