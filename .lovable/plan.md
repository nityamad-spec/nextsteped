## Problem

In `/student/chat`, when the assistant returns a Mermaid diagram, node labels get cut off mid-word (e.g. "Encoder Lay", "Multi-Head Self-Atte", "Add & Norm" clipped, "Feed Forward Netwo"). The diagram renders, but text overflows the node rectangles and gets clipped by the SVG viewport.

## Root cause

In `src/components/MermaidDiagram.tsx` we initialize mermaid with:

```ts
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "default",
  fontFamily: "inherit",
});
```

Two things combine to cause the clipping:

1. **`fontFamily: "inherit"`** — Mermaid measures text width at render time using a temporary off-DOM SVG that does not inherit the app's font stack. It sizes each node box for one font, then the visible SVG paints text in a different (wider) inherited font. The label ends up wider than the box mermaid drew for it.
2. **Container styling** — the wrapper uses `[&_svg]:max-w-full` with `overflow-x-auto`. When the SVG's intrinsic width exceeds the chat column, mermaid's default `useMaxWidth: true` scales the whole SVG down. Because the box widths were already too small for the labels, scaling down doesn't help; the text is still clipped inside each node, and now the whole diagram is smaller too.

The image the user attached confirms this: every node with a longer word is cut at the same relative position, which is the node-box boundary — not the SVG boundary.

## Fix

Edit `src/components/MermaidDiagram.tsx` only. No changes to the chat pipeline, no changes to how the model produces mermaid.

1. **Pin a real font at init** so measurement and paint agree:
   - `fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'` (matches Tailwind's default sans stack we already ship).
2. **Disable auto-shrink** so the SVG keeps its intrinsic width and the container scrolls horizontally instead of squishing:
   - Pass per-diagram config `flowchart: { useMaxWidth: false, htmlLabels: true }`, and the same `useMaxWidth: false` under `sequence`, `class`, `state`.
3. **Container CSS** — drop `[&_svg]:max-w-full` (which forces the SVG to shrink to column width) and keep `overflow-x-auto` so wide diagrams scroll. Keep `[&_svg]:h-auto` and `[&_svg]:mx-auto` for centering.
4. **Small padding bump** via `themeVariables: { nodeSpacing: 40, rankSpacing: 50 }` and `flowchart: { padding: 8 }` so labels have a couple of extra pixels of breathing room even if the browser's font metrics differ slightly from what mermaid measured.

That's the whole change — one file, ~10 lines.

## Risks

- **Horizontal scroll on mobile.** Wide diagrams will now scroll sideways inside the message bubble instead of shrinking. This is the intended trade (readable > tiny) but worth calling out; the wrapper already has `overflow-x-auto` so no layout break, just a scrollbar.
- **Font stack drift.** If the app's body font ever changes to something significantly wider (e.g. a display serif), we'd need to update the mermaid `fontFamily` to match, or clipping returns. Low likelihood; the sans stack is stable.
- **`htmlLabels: true` + `securityLevel: "strict"`.** Strict mode already sandboxes HTML labels; enabling htmlLabels is safe under strict, but any future switch to `securityLevel: "loose"` combined with htmlLabels would allow raw HTML in labels from LLM output. We are keeping strict, so this stays safe — noted so a future edit doesn't flip both at once.
- **Diagram regressions.** Changing `useMaxWidth` alters sizing for every diagram type, not just the one in the screenshot. Sequence/class/state diagrams will also render at intrinsic size. Visually larger, but should not clip.
- **No effect on malformed mermaid.** If the model emits a diagram whose labels are genuinely huge (a full sentence in one node), it will still be wide — but it will be readable and scrollable, not clipped.

## Out of scope

- Changing how the chat model formats mermaid (e.g. asking it to keep labels short). Can be a follow-up if wide diagrams are common.
- Adding a "open diagram fullscreen" affordance. Nice-to-have, not needed to unblock the reported bug.
