# Fix: model refuses to draw diagrams even though Mermaid rendering works

## What's happening

Mermaid rendering on the client is wired up correctly. The problem is the model's behavior: the current `DIAGRAMS` rule in `supabase/functions/chat/index.ts` (line 513) is:

- Buried as one bullet in a long "STUDENT STYLE" section
- Phrased permissively ("you *may* include ONE small Mermaid diagram")
- Doesn't tell the model that the UI actually renders Mermaid
- Doesn't override the model's default "I can't draw in a text interface" refusal reflex

So for a prompt like *"explain transformer architecture using a graph"*, the model falls back to its baked-in "text-only interface" refusal instead of emitting a ````mermaid` block.

## Change

Edit only `supabase/functions/chat/index.ts`. No client changes — rendering already works.

1. **Promote diagrams to their own top-level section** in `COMMON_RULES` (peer of `MATH FORMATTING`), titled `DIAGRAMS (Mermaid)`.
2. **State the capability plainly** so the model stops refusing:
  - "This chat UI renders Mermaid diagrams. You CAN draw diagrams — never say you can't draw or that this is a text-only interface."
  - "When the student explicitly asks for a diagram / graph / flowchart / chart / visual, you MUST respond with a Mermaid diagram (unless the topic genuinely can't be diagrammed, in which case say so briefly and offer a text alternative)."
  - "When a diagram would clearly help (processes, flows, hierarchies, sequences, state machines, architectures), include one proactively."
3. **Keep existing safety rails**: allowed types only (`flowchart`/`graph`, `sequenceDiagram`, `classDiagram`, `stateDiagram`/`stateDiagram-v2`), under ~15 nodes, short labels, no LaTeX inside Mermaid, always pair with a short text explanation, one diagram per answer, skip when plain text is clearer.
4. **Add a tiny format example** in the prompt so the model knows the exact fence:
  ```
   ```mermaid
   flowchart LR
     A[Input] --> B[Encoder] --> C[Decoder] --> D[Output]
   ```
  ```
5. **Deploy the `chat` edge function** after the edit.

## Verify

Re-ask "explain transformer architecture using a graph" on `/student/chat`. Expected: a rendered Mermaid flowchart plus a short text explanation, and no "I can't draw" phrasing. Also confirm normal non-visual questions still answer in plain prose without forced diagrams.