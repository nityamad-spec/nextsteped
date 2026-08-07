/**
 * chat-grounding_test
 *
 * Integration tests for the RAG grounding + Yes/No fallback branching used by
 * the `chat` edge function.
 */

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildMaterialsGrounding,
  buildSources,
  friendlyLabel,
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
  assertEquals(g.sources, []);
});

Deno.test("fallback: top similarity below the weak floor flags needsFallback", () => {
  const g = buildMaterialsGrounding([
    chunk({ similarity: WEAK_THRESHOLD - 0.01 }),
  ]);
  assertEquals(g.needsFallback, true);
  assertEquals(g.confidence, "none");
});

Deno.test("weak tier: between weak and confident thresholds still answers, flagged", () => {
  const g = buildMaterialsGrounding([
    chunk({ similarity: (WEAK_THRESHOLD + CONFIDENT_THRESHOLD) / 2 }),
  ]);
  assertEquals(g.needsFallback, false);
  assertEquals(g.confidence, "weak");
  assertStringIncludes(g.materialsContext, "do NOT refuse");
  assertEquals(g.materialsContext.includes("[[NEEDS_FALLBACK]]"), false);
  assertEquals(g.sources.length, 1);
});

Deno.test("forceConfident: document-level route answers confidently at any similarity", () => {
  const g = buildMaterialsGrounding(
    [chunk({ similarity: 0 })],
    CONFIDENT_THRESHOLD,
    WEAK_THRESHOLD,
    true,
  );
  assertEquals(g.needsFallback, false);
  assertEquals(g.confidence, "confident");
  assertStringIncludes(g.materialsContext, "[[NEEDS_FALLBACK]]");
});

Deno.test("forceConfident with zero chunks still falls back", () => {
  const g = buildMaterialsGrounding([], CONFIDENT_THRESHOLD, WEAK_THRESHOLD, true);
  assertEquals(g.needsFallback, true);
});

Deno.test("grounded: injects COURSE MATERIALS block with numeric anchors and labels", () => {
  const g = buildMaterialsGrounding([
    chunk({ file_name: "biology.pdf", folder_type: "textbook", chunk_index: 3, page_start: 12, page_end: 13, similarity: 0.81 }),
  ]);
  assertEquals(g.needsFallback, false);
  assertStringIncludes(g.materialsContext, "--- COURSE MATERIALS");
  assertStringIncludes(g.materialsContext, "[[1]] biology, p.12-13");
  assertStringIncludes(g.materialsContext, "Photosynthesis converts light energy");
  assertStringIncludes(g.materialsContext, "numeric token [[n]]");
  assertStringIncludes(g.materialsContext, "[[NEEDS_FALLBACK]]");
  assertEquals(g.sources.length, 1);
  assertEquals(g.sources[0].n, 1);
  assertEquals(g.sources[0].label, "biology, p.12-13");
});

Deno.test("grounded: lesson-plan chunk gets 'Lesson Plan — Week N' label", () => {
  const g = buildMaterialsGrounding([
    chunk({
      file_name: "published-plan.json",
      folder_type: "lesson-plan-published",
      chunk_index: 5,
      page_start: 3,
      page_end: 3,
      similarity: 0.8,
    }),
  ]);
  assertEquals(g.needsFallback, false);
  assertStringIncludes(g.materialsContext, "[[1]] Lesson Plan — Week 3");
  assertEquals(g.sources[0].label, "Lesson Plan — Week 3");
});

Deno.test("grounded: multiple chunks get sequential numeric anchors", () => {
  const g = buildMaterialsGrounding([
    chunk({ file_name: "a.pdf", folder_type: "textbook", similarity: 0.9 }),
    chunk({ id: "c2", file_name: "b.pdf", folder_type: "textbook", page_start: 4, page_end: 4, similarity: 0.75, content: "Second." }),
  ]);
  assertStringIncludes(g.materialsContext, "[[1]] a, p.1");
  assertStringIncludes(g.materialsContext, "[[2]] b, p.4");
  assert(g.sources[0].n === 1 && g.sources[1].n === 2);
});

Deno.test("friendlyLabel: lesson plan overview when page_start is 0", () => {
  const label = friendlyLabel({
    file_name: "published-plan.json",
    folder_type: "lesson-plan-published",
    page_start: 0,
    page_end: 0,
  });
  assertEquals(label, "Lesson Plan — Overview");
});

Deno.test("friendlyLabel: PDF without pages omits page range", () => {
  const label = friendlyLabel({
    file_name: "notes-week1.pdf",
    folder_type: "textbook",
    page_start: null,
    page_end: null,
  });
  assertEquals(label, "notes week1");
});

Deno.test("buildSources: 1-indexes labels in chunk order", () => {
  const sources = buildSources([
    chunk({ file_name: "a.pdf", folder_type: "textbook" }),
    chunk({ id: "c2", file_name: "published-plan.json", folder_type: "lesson-plan-published", page_start: 7, page_end: 7 }),
  ]);
  assertEquals(sources[0].n, 1);
  assertEquals(sources[1].n, 2);
  assertEquals(sources[1].label, "Lesson Plan — Week 7");
});

Deno.test("general knowledge suffix contains opt-in marker", () => {
  assertStringIncludes(GENERAL_KNOWLEDGE_SUFFIX, "[[GENERAL_KNOWLEDGE]]");
});
