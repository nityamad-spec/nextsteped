## Goal

When a student in `/student/chat` asks for an image/diagram, the assistant should offer to "generate a diagram" without ever surfacing the word "Mermaid" (or "textual description vs Mermaid" choices). It should just produce the diagram inline.

## Change

Single edit in `supabase/functions/chat/index.ts`, in the student system prompt "DIAGRAMS" section (lines ~514–523):

- Rename the section header from `DIAGRAMS (Mermaid) — you CAN draw diagrams` to `DIAGRAMS — you CAN draw diagrams`.
- Keep the technical instruction that the fenced code block must use language `mermaid` (the renderer needs this), but add an explicit rule: **never mention the words "Mermaid", "syntax", "rendered", or ask the student to choose between a text description and a diagram. Refer to the output only as "a diagram".**
- Strengthen the existing anti-refusal rule so that for image/picture/visual requests on diagrammable topics, the assistant just produces the diagram directly instead of asking permission or listing format options.
- For genuinely non-diagrammable image requests (e.g. "generate a photo of a cat"), it should briefly say it can produce diagrams for course concepts and offer to draw one, without naming the underlying format.

No changes to the professor prompt, no frontend changes, no changes to the Mermaid renderer component.

## Risks

- Model may still leak the word "Mermaid" occasionally; the prompt rule reduces but can't guarantee elimination.
- Must keep the fenced-block `mermaid` language tag intact or diagrams stop rendering.
- Slightly more aggressive "just draw it" behavior could produce diagrams for requests where prose would be clearer — mitigated by keeping the existing "skip diagrams when prose is clearer" guidance.

## Not doing

- Adding real image generation.
- Touching professor chat, diagram renderer, or any UI.
