# Testing

- Failing tests, lint failures, and typecheck failures are **reported to the user, not auto-fixed**. Wait for user approval before changing code in response to a failure.
- Run frontend tests with `bun x vitest run`.
- Run Deno tests inside `supabase/functions/` with `deno test --allow-env --allow-net`.

## RAG pipeline (backend only)

- `supabase/functions/_shared/rag-retrieve_test.ts` covers the prompt formatter (citation label, empty-context fallback, page range collapsing).
- The `ingest-rag-document` chunker and OCR gating rely on external services (pdfjs, Lovable AI Gateway) and are validated via integration smoke tests, not unit tests.
