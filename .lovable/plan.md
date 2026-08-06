# Fix Mermaid diagrams failing on /student/chat

## What's actually happening

The diagram isn't "not generating" — it renders, then gets thrown away. The console shows a Mermaid parse error on the AI-authored diagram:

```text
Parse error on line 4:
...t[Generated Content (Text, Image, etc.)]
Expecting 'SQE', ... got 'PS'
```

Mermaid cannot handle unquoted parentheses/commas inside a node label. `C[Generated Content (Text, Image, etc.)]` is invalid; `C["Generated Content (Text, Image, etc.)"]` is valid. The model writes labels like this often.

When parsing fails, `MermaidDiagram` sets `failed` and returns `null` — but react-markdown still renders the surrounding `<pre>`, which is why the chat shows an empty dark bar instead of a diagram or the raw code.

## Fix

1. **Label auto-quoting in `src/components/MermaidDiagram.tsx`** (added to the existing `sanitizeMermaid` step): wrap the text inside node shape brackets in double quotes when it isn't already quoted and contains characters Mermaid's parser chokes on — `(`, `)`, `,`, `:`, `&`, `#`. Covers `[...]`, `(...)`, `{...}`, `([...])`, `[[...]]`, and edge labels `|...|`. Escape any inner `"` as `#quot;`.
2. **Graceful failure instead of a black bar**: when the diagram can't be rendered, show the Mermaid source in a normal code block rather than returning `null`, so nothing renders as an empty dark strip. Also render the `<pre>` wrapper only for non-mermaid code in `AIChat.tsx`'s `markdownComponents`, so a mermaid block never leaves an empty shell.
3. **Prompt guidance in `supabase/functions/chat/index.ts`**: add one line to the diagram instructions telling the model to always double-quote node labels and avoid parentheses/commas outside quotes. Reduces how often the client-side repair has to kick in.

## Technical notes

- Repair happens before `mermaid.parse`, so the existing `ALLOWED` / `hasEnoughStructure` gates and the post-render size guard are unchanged.
- Quoting is skipped for labels already starting and ending with `"`.
- Unit tests for the sanitizer: parenthesised label, comma label, already-quoted label (unchanged), plain label (unchanged).

## Risk

- Over-quoting could break markdown-style labels that intentionally use backticks or `<br/>`; those stay valid inside quotes in Mermaid, so impact is low.
- Some parse failures come from other malformed syntax (bad edge types, stray `end`). Those still fall back to the code block instead of a blank bar.
