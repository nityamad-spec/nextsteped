import { assertStringIncludes, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { diversifyByFolder, formatPrompt, type RagChunk } from "./rag-retrieve.ts";

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

Deno.test("diversifyByFolder reserves slots for each folder type", () => {
  const chunks = [
    chunk({ id: "1", folder_type: "textbook" }),
    chunk({ id: "2", folder_type: "textbook" }),
    chunk({ id: "3", folder_type: "textbook" }),
    chunk({ id: "4", folder_type: "textbook" }),
    chunk({ id: "5", folder_type: "syllabus" }),
    chunk({ id: "6", folder_type: "lesson-plan-published" }),
  ];
  const out = diversifyByFolder(chunks, 4);
  assertEquals(out.length, 4);
  const folders = new Set(out.map((c) => c.folder_type));
  assertEquals(folders.has("syllabus"), true);
  assertEquals(folders.has("lesson-plan-published"), true);
  // Rank order is preserved within the picked set.
  assertEquals(out.map((c) => c.id), ["1", "2", "5", "6"]);
});

Deno.test("diversifyByFolder is a no-op when under the limit", () => {
  const chunks = [chunk({ id: "1" }), chunk({ id: "2" })];
  assertEquals(diversifyByFolder(chunks, 5).length, 2);
});
