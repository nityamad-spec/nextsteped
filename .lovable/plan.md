## What to change

### 1. `supabase/functions/chat/index.ts` — swap model
Change the single `model` field on line 595 from `"google/gemini-2.5-flash-lite"` to `"google/gemini-2.5-flash"`. No other code changes needed — same OpenAI-compatible chat body, same streaming, same tools.

### 2. `src/components/MermaidDiagram.tsx` — kill the "dark bar"
Is the blank/dark bar caused by the previous edit? **Partially yes.** The previous change added `sanitizeMermaid()` which strips `%%{init}%%`, `classDef`, `style`, `linkStyle`, and `:::className` fragments. When the model emits a diagram that leans entirely on those directives (e.g. a `subgraph` with only styled node stubs, or nodes whose only content was `:::className` references), sanitizing leaves an almost-empty source. Mermaid still parses it and renders a tiny/empty SVG, and our container (`border border-border bg-background p-3`) then paints as a full-width dark strip with nothing inside — exactly what the screenshot shows. The current `hasEdge || nonEmptyLines.length >= 2` guard is too permissive: a stray `-->` in a comment-ish line passes it.

Fixes (all inside `MermaidDiagram.tsx`, no new deps):

- **Stricter emptiness check before render.** Require BOTH: at least 1 real edge AND at least 2 distinct node identifiers parsed out of the body. If not, `setFailed(true)`.
- **Post-render size guard.** After `mermaid.render` injects the SVG, read `svg.getBBox()` (or `viewBox`) and if width < 40px or height < 20px, treat as failed and hide. This catches the "mermaid parsed but produced nothing visible" case regardless of source.
- **Neutralize the container when empty.** Move `border` and `bg-background` off the wrapper and onto an inner element that only mounts once render succeeds, so a hidden/failed diagram never paints a bar.

### 3. No changes to the system prompt this turn
The DIAGRAMS block already forbids `classDef`/`style`/`%%{init}%%`. Adding more prompt text now would just dilute other rules; the render-side guard is the reliable fix.

## Risks

- **Cost / latency.** `gemini-2.5-flash` costs more and is a touch slower per token than flash-lite. On the chat volume of `/student/chat` this is noticeable in the monthly bill but not in per-message UX. Mitigation: keep the model swap scoped to `supabase/functions/chat/index.ts`; other edge functions (practice questions, diagnostics, etc.) stay on whatever they use.
- **Prompt-following drift.** Flash and flash-lite obey instructions slightly differently. The existing long system prompt was tuned against flash-lite; flash may be *more* willing to add diagrams (good) but also more verbose (mildly worse). No code change needed, just something to watch after deploy.
- **Rate limits / 429s.** Flash has a lower RPM ceiling on the Gateway than flash-lite. The chat function already has retry-on-429 in the client (`TeacherChat.tsx` / `AIChat.tsx`), so this degrades gracefully rather than failing hard.
- **Stricter mermaid guard hides legitimate one-node diagrams.** A valid `graph LR; A[Only Node]` with no edges would now be hidden. Acceptable trade-off — a single-node "diagram" isn't a diagram, and the model can easily add an edge.
- **`getBBox()` on freshly-injected SVG can throw** in some layout timings. Wrap in try/catch and treat exceptions as "assume it rendered fine" so we never hide a valid diagram due to a measurement error.
- **Not a root-cause fix for the model emitting empty diagrams.** If flash also emits stripped-to-nothing mermaid, we hide it — the student sees the text explanation with no picture. Follow-up (out of scope): server-side detect empty mermaid blocks and ask the model to redo just the diagram.

## Out of scope
- Migrating other edge functions off flash-lite.
- Adding a server-side "did the model produce a valid diagram?" retry loop.
- Rendering real raster images via an image-gen model.
