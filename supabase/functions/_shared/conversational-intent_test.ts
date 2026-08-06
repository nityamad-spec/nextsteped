import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isConversationalFiller } from "./conversational-intent.ts";

const FILLER = [
  "ok", "Okay!", "sounds good", "What's next?", "thanks a lot!", "got it",
  "cool", "yes", "please continue", "go on", "hi", "makes sense", "ok thanks",
];

const REAL = [
  "what is RAG?",
  "explain loops",
  "What's next in week 3 of the syllabus?",
  "why does my loop never stop",
  "Give me an example of a decision tree",
  "```py\nprint(1)\n```",
  "Can you summarise chapter 4 of the textbook for me please",
];

Deno.test("filler phrases are detected", () => {
  for (const f of FILLER) assertEquals(isConversationalFiller(f), true, f);
});

Deno.test("real questions are not filler", () => {
  for (const q of REAL) assertEquals(isConversationalFiller(q), false, q);
});

Deno.test("empty input is not filler", () => {
  assertEquals(isConversationalFiller(""), false);
  assertEquals(isConversationalFiller(undefined), false);
});
