/**
 * chat-grounding_test
 *
 * Integration tests for the RAG grounding + Yes/No fallback branching used by
 * the `chat` edge function.
 *
 * Covers:
 *   1. Insufficient retrieval (empty or low similarity) → needs_fallback path.
 *   2. Sufficient retrieval → materials context is injected with citations
 *      and grounding rules.
 *   3. General-knowledge opt-in → suffix appended so the response is tagged.
 */

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildMaterialsGrounding,
  GENERAL_KNOWLEDGE_SUFFIX,
  SIM_THRESHOLD,
} from "./chat-grounding.ts";
import type { RagChunk } from "./rag-retrieve.ts";

function chunk(overrides: Partial<RagChunk> = {}): RagChunk {
  return {
    id: "c1",
    file_id: "f1",
    file_name: "syllabus.pdf",
    folder_type: "syllabus",
    chunk_index: 0,
    page_start: 1,
    page_end: 1,
    content: "Photosynthesis converts light energy into chemical energy.",
    similarity: 0.9,
    ...overrides,
  };
}

Deno.test("fallback: empty retrieval flags needsFallback", () => {
  const g = buildMaterialsGrounding([]);
  assertEquals(g.needsFallback, true);
  assertEquals(g.materialsContext, "");
});

Deno.test("fallback: top similarity below threshold flags needsFallback", () => {
  const g = buildMaterialsGrounding([
    chunk({ similarity: SIM_THRESHOLD - 0.01 }),
    chunk({ id: "c2", chunk_index: 1, similarity: 0.4 }),
  ]);
  assertEquals(g.needsFallback, true);
  assertEquals(g.materialsContext, "");
});

Deno.test("fallback: exactly at threshold is treated as grounded", () => {
  const g = buildMaterialsGrounding([chunk({ similarity: SIM_THRESHOLD })]);
  assertEquals(g.needsFallback, false);
  assert(g.materialsContext.length > 0);
});

Deno.test("grounded: injects COURSE MATERIALS block with source label", () => {
  const g = buildMaterialsGrounding([
    chunk({ file_name: "biology.pdf", chunk_index: 3, page_start: 12, page_end: 13, similarity: 0.81 }),
  ]);
  assertEquals(g.needsFallback, false);
  assertStringIncludes(g.materialsContext, "--- COURSE MATERIALS");
  assertStringIncludes(g.materialsContext, "[Source: biology.pdf #3, p.12-13]");
  assertStringIncludes(g.materialsContext, "Photosynthesis converts light energy");
  assertStringIncludes(g.materialsContext, "GROUNDING RULES");
  assertStringIncludes(g.materialsContext, "[[NEEDS_FALLBACK]]");
});

Deno.test("grounded: multiple chunks are separated and single-page label omits range", () => {
  const g = buildMaterialsGrounding([
    chunk({ file_name: "a.pdf", chunk_index: 0, page_start: 1, page_end: 1, similarity: 0.9 }),
    chunk({ id: "c2", file_name: "b.pdf", chunk_index: 2, page_start: 4, page_end: 4, similarity: 0.75, content: "Second." }),
  ]);
  assertEquals(g.needsFallback, false);
  assertStringIncludes(g.materialsContext, "[Source: a.pdf #0, p.1]");
  assertStringIncludes(g.materialsContext, "[Source: b.pdf #2, p.4]");
  assertStringIncludes(g.materialsContext, "\n\n---\n\n");
});

Deno.test("grounded: chunk without page numbers still labels correctly", () => {
  const g = buildMaterialsGrounding([
    chunk({ file_name: "notes.pdf", chunk_index: 7, page_start: null, page_end: null, similarity: 0.8 }),
  ]);
  assertEquals(g.needsFallback, false);
  assertStringIncludes(g.materialsContext, "[Source: notes.pdf #7]");
});

Deno.test("general knowledge suffix contains opt-in marker", () => {
  assertStringIncludes(GENERAL_KNOWLEDGE_SUFFIX, "--- GENERAL KNOWLEDGE MODE ---");
  assertStringIncludes(GENERAL_KNOWLEDGE_SUFFIX, "[[GENERAL_KNOWLEDGE]]");
  assertStringIncludes(GENERAL_KNOWLEDGE_SUFFIX, "explicitly opted in");
});

Deno.test("custom threshold: caller can override SIM_THRESHOLD", () => {
  const chunks = [chunk({ similarity: 0.5 })];
  assertEquals(buildMaterialsGrounding(chunks, 0.6).needsFallback, true);
  assertEquals(buildMaterialsGrounding(chunks, 0.4).needsFallback, false);
});
