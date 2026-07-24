
## Goal

Make the existing OCR pass in `supabase/functions/ingest-rag-document/index.ts` explicitly handle handwriting — scanned notebook pages, whiteboard/blackboard photos, annotated printed PDFs, and handwritten math — without adding a second model call, storage columns, UI badges, or raising the 50-page OCR cap.

## Current state (verified)

- OCR path: `ocrPage()` in `ingest-rag-document/index.ts` (lines 77–124).
- Model: `google/gemini-2.5-flash` via Lovable AI Gateway; PDF page passed as `type: "file"`.
- Triggered only when `text.replace(/\s+/g,"").length < OCR_MIN_CHARS (20)`, capped at first `OCR_MAX_PAGES (50)` low-text pages.
- System prompt: generic "OCR engine, transcribe verbatim". No mention of handwriting, cursive, whiteboard, or math notation. No guidance for uncertain glyphs.

## Change (scope: prompt only)

Rewrite the OCR system + user prompt in `ocrPage()` so Gemini 2.5 Flash treats the page as potentially mixed print + handwriting + board photos + inline math. Everything else — gating, cap, model id, storage schema, chunking, RAG retrieval, UI — stays exactly as today.

### New OCR system prompt (proposed)

> You are an OCR engine for academic course materials. The page may contain printed text, cursive or block handwriting, whiteboard/blackboard photographs, and margin annotations on printed content. Transcribe every readable character verbatim in natural reading order, preserving paragraph and line breaks. For handwritten mathematics, transcribe expressions inline using plain-text math (e.g. `x^2 + 2x = 0`, `∫ f(x) dx`, `sqrt(a^2+b^2)`); do not use LaTeX. If a word or symbol is unclear, transcribe your best guess followed by `[?]`. If a region is fully unreadable, write `[illegible]`. Do not summarize, translate, explain, or add commentary. If the page is blank, return an empty string.

### New user message (proposed)

> Transcribe page N of the attached PDF verbatim, including any handwritten notes, board work, or margin annotations.

### Constraints that stay unchanged

- `OCR_MODEL = "google/gemini-2.5-flash"` — unchanged.
- `OCR_MIN_CHARS = 20`, `OCR_MAX_PAGES = 50` — unchanged.
- Only low-text pages get OCR'd; text-layer pages are untouched.
- No new columns on `rag_chunks` or `course_material_files`.
- No UI change in `/teacher/setup/upload` or Content Library.
- `[?]` and `[illegible]` markers flow into `rag_chunks.content` as plain text; retrieval and citation rendering already handle arbitrary text.

## Verification

1. Deploy the edge function.
2. Manually invoke `ingest-rag-document` against one already-indexed PDF known to contain a low-text page (existing "Introduction of Finite Automata" or a handwritten test upload) and confirm `rag_status` moves through `processing → indexed` with chunk count > 0.
3. Spot-check one resulting chunk in `rag_chunks` for a low-text page to confirm the transcribed text now includes handwriting / math with `[?]` markers where appropriate.
4. Fire one TA chat query grounded to that document and confirm citations still render.

No automated tests are added — the OCR path already lacks unit coverage (external services) per `TESTING.md`, and this is a prompt-only change.

## Risks

- **Hallucinated tokens on truly illegible pages.** The prompt tells the model to prefer `[illegible]` and `[?]` over guessing, but Flash may still fabricate. Mitigation: markers make hallucinations easier to spot in retrieval output; no mitigation beyond prompt wording since we agreed to skip a quality-signal column.
- **Chunk noise from `[?]` / `[illegible]` markers.** These flow into embeddings; a chunk with many markers may retrieve slightly worse. Acceptable — better than silent garbage.
- **Board photos embedded as PDF images.** Gemini reading a rasterized image inside a PDF slice is weaker than reading a first-class image. Since we agreed to keep the current file-slice OCR (no rasterization), whiteboard accuracy will still be worse than dedicated image OCR. If this shows up as a real problem later, revisit the "rasterize + vision" option.
- **50-page cap unchanged.** Handwritten notebooks > 50 low-text pages will be partially indexed. Documented behavior, no change.
- **Cost.** Same number of Flash calls as today (bounded by `OCR_MAX_PAGES`). No expected cost delta.

## Out of scope (explicitly, per your answers)

- Second/stronger OCR pass with Gemini 2.5 Pro fallback.
- Rasterizing PDF pages to images before OCR.
- New `ocr_confidence` / `ocr_source` columns and UI badges.
- Raising `OCR_MAX_PAGES` or making it per-course configurable.
