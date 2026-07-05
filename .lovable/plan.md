
# Add Mermaid diagrams to the student chat

Let the AI tutor answer with visual diagrams (flowcharts, sequence, class, state) when they help explain a concept, rendered inline in `/student/chat`.

## Scope

- Route: `/student/chat` (student-facing AI chat only). Teacher chat unchanged.
- Diagram types allowed: **flowchart, sequenceDiagram, classDiagram, stateDiagram** (safe subset).
- Trigger: **model decides** when a diagram helps.
- Fallback: if a diagram fails to render, **hide it silently** and rely on the surrounding text answer.

## Changes

### 1. Install Mermaid
Add `mermaid` as a client dependency.

### 2. Update the chat edge function prompt
File: `supabase/functions/chat/index.ts`

Extend the system prompt with a short "Diagrams" section instructing the model that:
- When a diagram would clarify the answer (process, flow, hierarchy, sequence, state), it may output a fenced ```` ```mermaid ```` block.
- Only these diagram types are allowed: `flowchart`, `sequenceDiagram`, `classDiagram`, `stateDiagram`. Nothing else.
- Keep diagrams small (< ~15 nodes) and always pair them with a brief text explanation, since the diagram may not render on every device.
- Never put LaTeX/math inside a Mermaid block.

No changes to model, tools, or streaming.

### 3. Render Mermaid on the client
File: existing student chat message renderer (the same component being updated for LaTeX/KaTeX under the current in-flight plan).

- Initialize Mermaid once (`mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: matches app theme })`).
- In the markdown renderer's `code` component, detect `language === 'mermaid'`:
  - Render a `<MermaidDiagram code={...} />` component.
  - Inside it: on mount / when code changes, call `await mermaid.parse(code)` then `mermaid.render(uniqueId, code)` and inject the returned SVG.
  - Wrap in `try/catch`. On any parse or render error → render `null` (silent hide, per user choice). Log to console for debugging.
- Style the diagram container: full width of the assistant bubble, horizontal scroll on overflow, respects light/dark theme via a `theme` re-init when the app theme changes.

### 4. Verification
- Ask the tutor a question that invites a flowchart (e.g. "Explain the Python function call flow"). Confirm a diagram renders.
- Ask a normal question. Confirm no diagrams appear and text answers still stream normally.
- Force a broken diagram (temporarily) to confirm the fallback hides the block cleanly.
- Confirm LaTeX still renders correctly alongside Mermaid (no interference between the two markdown handlers).

## Technical notes

- Mermaid is client-only (uses the DOM). Import it lazily inside the diagram component so it doesn't bloat the initial student bundle.
- Use `securityLevel: 'strict'` to prevent any HTML/script injection from model output.
- Give each rendered diagram a unique DOM id (e.g. `mermaid-${useId()}`) — Mermaid requires unique ids per render.
- Do not persist rendered SVGs; re-render from the stored markdown source on each mount. Chat history storage is unchanged.
