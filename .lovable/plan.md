Root cause

Backend log for the failing request:

```text
AI gateway error: 400 {"error":{"message":"Provider returned error","type":"upstream_error"}}
```

In `supabase/functions/parse-syllabus/index.ts`, every uploaded syllabus file (PDF or DOCX) is wrapped as an OpenAI `image_url` data URL:

```ts
{ type: "image_url", image_url: { url: `data:${mimeType};base64,${fileBase64}` } }
```

The Lovable AI Gateway is a passthrough. `image_url` is only valid for actual images. For PDFs the correct content block is `{"type":"file","file":{"filename":"doc.pdf","file_data":"data:application/pdf;base64,..."}}`. DOCX is not a modality Gemini accepts at all on the chat-completions path. Sending a PDF or DOCX as `image_url` makes the provider return 400, and the edge function re-wraps it as a generic 500 with the message "AI service unavailable. Please try again." surfaced in the UI.

There is also a schema/prompt mismatch: the prompt asks for `units[].sequence`, `units[].label`, `units[].content`, while the tool schema declares `unit_number`, `title`, `topics`. This does not cause the 400 but produces inconsistent parsed output once the call succeeds.

Fix

1. `supabase/functions/parse-syllabus/index.ts`
   - PDFs: send the binary using the `file` content block:
     ```ts
     { type: "file", file: { filename: fileName, file_data: `data:application/pdf;base64,${fileBase64}` } }
     ```
   - Real images (png/jpg/jpeg/gif/bmp/webp): keep `image_url`.
   - DOCX / PPTX / TXT / CSV: do not send to the model as binary. Either require the client to send extracted text via `fileContent`, or return a clear 400 explaining the unsupported binary type so the UI shows a useful error instead of "AI service unavailable".
   - Improve gateway error handling so the 400 body is forwarded to the client instead of being collapsed into a 500.
   - Align the tool schema with the prompt: `units[].sequence` (integer), `units[].label` (string, nullable), `units[].content` (string array). Update the downstream code that consumes the parsed JSON only if it currently reads `unit_number/title/topics`.

2. `src/components/FileUploadZone.tsx`
   - For DOCX syllabus uploads, extract text on the client before invoking `parse-syllabus` and pass it via `fileContent` (the function already supports this branch).
   - For PDF, continue sending `fileBase64` as today; the edge function will now route it correctly.
   - No change to upload/storage behavior or other file flows.

3. Verify
   - Upload a PDF syllabus → no AI gateway 400 in `parse-syllabus` logs → parsed JSON saved to `approved-syllabus.json` → UI status flips to Parsed.
   - Upload a DOCX syllabus → text-extraction path succeeds → same outcome.
   - Trigger an unsupported type → clear 400 message in the UI, not a generic 500.

Technical notes

- The Gateway is a passthrough. The right multimodal block per type is `image_url` for images, `input_audio` for audio, and `file` for PDFs. Anything else must be converted to text on the client first.
- DOCX text extraction on the client can use a small library such as `mammoth` (browser build) — to be added only if you approve the DOCX path; otherwise this plan keeps DOCX out of the AI request and shows a clear error.