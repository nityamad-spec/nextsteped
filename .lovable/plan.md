## Problem

Two related bugs in `/student/chat`:

1. **Refuses image requests.** When a student asks for "an image", the assistant replies `"I can't directly generate images for you in this text-based interface."` even though the system prompt already tells it it CAN draw diagrams. The rule exists but the model (Gemini 2.5 flash-lite) still refuses on the word "image".
2. **Diagram renders as a solid dark bar.** When the student asks for a diagram, `MermaidDiagram` renders — but the visible output is a single dark navy rectangle with no nodes, edges, or labels (see attached screenshot). The diagram is technically there, just visually collapsed / all-dark.

## Root cause

**Bug 1 — refusal.** In `supabase/functions/chat/index.ts`, the `DIAGRAMS` block in `STUDENT_SECTION` says "you CAN draw diagrams" and lists forbidden refusal phrases, but:
- The rule is buried near the bottom of a very long prompt; flash-lite doesn't reliably obey.
- There is no post-generation guardrail. When the model still emits a refusal, we stream it straight through.
- Nothing hints to the model that "image / picture / photo" from a student in a course context should be interpreted as "diagram of the concept".

**Bug 2 — dark bar.** Looking at the screenshot, the bar is roughly the width of the chat column and short. Two likely causes, both in the model's mermaid output rather than in our renderer:
- The model emitted a `%%{init: {...}}%%` directive or `classDef` / `style` lines with a dark fill and no contrasting text color, so every node paints as a filled dark rectangle with invisible text on top.
- Or the model wrapped the whole diagram in a single `subgraph "Forward Process" ... end` with an empty body (or a body mermaid rejected as invalid children), which mermaid draws as the subgraph title bar only.

Either way, our renderer is doing the right thing — mermaid parsed the source (no `catch` fired, no "failed" fallback), rendered an SVG, and we injected it. The pixels are just an unusable diagram because the source was styled dark or structurally empty. We currently do nothing to constrain or sanitize the mermaid source coming from the LLM beyond the `ALLOWED` regex on the first line.

## Fix

Edit two files. No schema changes, no new dependencies.

### 1. `supabase/functions/chat/index.ts` — tighten the DIAGRAMS rules

Update the `DIAGRAMS` block inside `STUDENT_SECTION` to:

- **Broaden the trigger vocabulary.** Explicitly list "image, picture, photo, illustration, visualization, chart, plot, figure" as words that MUST be treated as a diagram request for any course concept (unless it's genuinely a photorealistic object the student is asking for).
- **Ban the exact refusal phrases** the model keeps emitting: "I can't generate images", "text-based interface", "I can only describe", "I don't have the ability to", "in this chat I can only". Say: if you were about to write any of these, stop and draw a diagram instead.
- **Ban styling directives inside mermaid.** Forbid `%%{init: ...}%%`, `classDef`, `style`, `linkStyle`, `theme` overrides, and inline HTML in labels. Say: rely on default theme only; no colors, no custom fills. This directly kills bug 2.
- **Require non-empty structure.** At least 2 nodes and 1 edge for flowcharts; no empty `subgraph` blocks.
- **Add one short positive example** of a "draw me an image of X" prompt answered with a small mermaid flowchart, so the model has a concrete pattern to imitate.

That's ~15 lines of prompt changes, no code logic changes.

### 2. `src/components/MermaidDiagram.tsx` — sanitize LLM mermaid before rendering

Add a small pre-processing pass on the incoming `code` before `mermaid.parse`:

- Strip any `%%{init: ... }%%` header (regex on the first non-empty line).
- Strip lines starting with `classDef `, `style `, `linkStyle `.
- Strip trailing `:::className` fragments from node declarations.
- If after stripping the source has fewer than 2 non-empty content lines, treat as invalid → `setFailed(true)` (we already hide failures).

This is a belt-and-suspenders defense so even if a future model regresses and emits dark-styled mermaid, we render it with default theme colors and never show the dark bar again.

## Risks

- **Prompt bloat / drift.** The `DIAGRAMS` block gets longer, which can very slightly dilute other rules on flash-lite. Mitigation: we're only adding ~15 lines and they're in the same block, not scattered.
- **Over-triggering diagrams.** Making "image/picture/photo" always mean "draw a diagram" could produce diagrams when the student meant something else (e.g. "show me an image of the Taj Mahal"). Mitigation: the rule keeps the existing escape hatch — "if it genuinely cannot be diagrammed (photorealistic object), briefly say you can draw diagrams for course concepts and offer a related one". We keep that clause.
- **Stripping legal mermaid.** Some students / future prompts might legitimately want colored diagrams. By stripping `style`/`classDef` we lose that expressiveness. Trade-off: reliability > customization. The default theme is readable in both light and dark.
- **False negatives from the min-lines check.** A one-line diagram like `graph LR; A-->B` would be stripped to a single content line and hidden. Mitigation: count semicolon-separated statements too, not just newlines; and set the threshold to "at least 1 edge OR 2 nodes", not "2 lines".
- **Doesn't fix a genuinely stubborn refusal.** If flash-lite still refuses despite the prompt tightening, we'd need a second pass: detect the refusal phrases in the streamed output on the server and retry with a stronger nudge, or upgrade the diagram-eligible turns to `gemini-2.5-flash` (not lite). Called out as a follow-up, not in this change.

## Out of scope

- Switching the chat model away from `gemini-2.5-flash-lite`.
- Adding a server-side "did the model refuse?" detector + auto-retry loop.
- Rendering real raster images (via an image-gen model) when a student explicitly asks for a photo. The current product decision is "diagrams only".
