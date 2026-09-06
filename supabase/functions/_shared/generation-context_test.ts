import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  EMPTY_GENERATION_CONTEXT,
  fitToBudget,
  renderGenerationContext,
  resolveSourceRefs,
} from "./generation-context.ts";
import type { RagChunk } from "./rag-retrieve.ts";

const chunk = (over: Partial<RagChunk> = {}): RagChunk => ({
  id: "c1",
  file_id: "f1",
  file_name: "week3-slides.pdf",
  folder_type: "teaching-materials",
  chunk_index: 4,
  page_start: 12,
  page_end: 12,
  content: "Recursion base cases prevent infinite recursion.",
  similarity: 0.8,
  ...over,
});

Deno.test("renderGenerationContext labels excerpts and maps concepts", () => {
  const ctx = renderGenerationContext(
    [chunk(), chunk({ id: "c2", file_name: "notes.pdf", content: "Loops iterate." })],
    ["recursion_base_cases", "loops"],
  );
  assertEquals(ctx.isEmpty, false);
  assertStringIncludes(ctx.contextBlock, "[S1 | week3-slides.pdf, p.12");
  assertStringIncludes(ctx.contextBlock, "[S2 | notes.pdf");
  assertEquals(ctx.byConcept["recursion_base_cases"], ["S1"]);
  assertEquals(ctx.sources.length, 2);
  assertEquals(ctx.labelToSource["S1"].file_name, "week3-slides.pdf");
});

Deno.test("renderGenerationContext returns empty context with no chunks", () => {
  assertEquals(renderGenerationContext([], ["x"]).isEmpty, true);
});

Deno.test("fitToBudget truncates the longest excerpts first", () => {
  const chunks = [
    chunk({ id: "a", content: "x".repeat(1000) }),
    chunk({ id: "b", content: "y".repeat(300) }),
  ];
  const out = fitToBudget(chunks, 800);
  assertEquals(out[1].content.length, 300);
  assertEquals(out[0].content.length < 1000, true);
  assertEquals(out.reduce((n, c) => n + c.content.length, 0) <= 810, true);
});

Deno.test("fitToBudget is a no-op under budget", () => {
  const chunks = [chunk()];
  assertEquals(fitToBudget(chunks, 10_000), chunks);
});

Deno.test("resolveSourceRefs maps known labels and drops unknown ones", () => {
  const ctx = renderGenerationContext([chunk(), chunk({ id: "c2", chunk_index: 9 })], []);
  assertEquals(resolveSourceRefs("S2", ctx)?.[0].chunk_index, 9);
  assertEquals(resolveSourceRefs("s1, S99", ctx)?.length, 1);
  assertEquals(resolveSourceRefs("nonsense", ctx), null);
  assertEquals(resolveSourceRefs(undefined, ctx), null);
  assertEquals(resolveSourceRefs("S1", EMPTY_GENERATION_CONTEXT), null);
});
