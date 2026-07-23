import { assertStringIncludes, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { formatPrompt, type RagChunk } from "./rag-retrieve.ts";

const chunk = (over: Partial<RagChunk> = {}): RagChunk => ({
  id: "id",
  file_id: "f1",
  file_name: "syllabus.pdf",
  folder_type: "syllabus",
  chunk_index: 2,
  page_start: 3,
  page_end: 4,
  content: "Recursion is a function calling itself.",
  similarity: 0.9,
  ...over,
});

Deno.test("formatPrompt includes citation label and instructions", () => {
  const { system, user } = formatPrompt([chunk()], "What is recursion?");
  assertStringIncludes(system, "ONLY the provided context");
  assertStringIncludes(system, "[<file_name> #<chunk_index>]");
  assertStringIncludes(user, "[Source: syllabus.pdf #2, p.3-4]");
  assertStringIncludes(user, "Question: What is recursion?");
});

Deno.test("formatPrompt handles empty context", () => {
  const { user } = formatPrompt([], "hi?");
  assertStringIncludes(user, "no relevant material found");
});

Deno.test("formatPrompt collapses single-page range", () => {
  const { user } = formatPrompt(
    [chunk({ page_start: 5, page_end: 5 })],
    "q",
  );
  assertStringIncludes(user, "p.5]");
  assertEquals(user.includes("p.5-5"), false);
});
