/**
 * rag-intent_test — routing rules for document-level ("meta") questions.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectRagIntent,
  isSyllabusAdminQuestion,
  parseWeekNumber,
} from "./rag-intent.ts";

Deno.test("syllabus questions route to syllabus_meta", () => {
  for (const q of [
    "summarise the syllabus",
    "What's in the Syllabus?",
    "how is grading done in this course",
    "what is the marks split",
    "what textbooks do I need",
    "what is the attendance policy",
  ]) {
    const i = detectRagIntent(q);
    assertEquals(i.kind, "syllabus_meta", q);
  }
});

Deno.test("lesson plan questions route to lesson_plan_meta", () => {
  for (const q of [
    "what's the lesson plan",
    "show me the course outline",
    "what is the class schedule",
  ]) {
    assertEquals(detectRagIntent(q).kind, "lesson_plan_meta", q);
  }
});

Deno.test("week-scoped questions extract the number and win over other intents", () => {
  const a = detectRagIntent("what is covered in unit 2");
  assertEquals(a.kind, "week_scoped");
  assertEquals(a.kind === "week_scoped" && a.week, 2);

  const b = detectRagIntent("lesson plan for week four");
  assertEquals(b.kind, "week_scoped");
  assertEquals(b.kind === "week_scoped" && b.week, 4);

  const c = detectRagIntent("Module-11 topics?");
  assertEquals(c.kind === "week_scoped" && c.week, 11);
});

Deno.test("ordinary content questions stay on hybrid top-K", () => {
  for (const q of ["what is a VPC", "explain recursion", ""]) {
    assertEquals(detectRagIntent(q).kind, "content", q);
  }
});

Deno.test("parseWeekNumber rejects out-of-range and unrelated numbers", () => {
  assertEquals(parseWeekNumber("week 99"), null);
  assertEquals(parseWeekNumber("I have 3 questions"), null);
  assertEquals(parseWeekNumber("week 0"), null);
});

Deno.test("isSyllabusAdminQuestion covers admin phrasing without the word syllabus", () => {
  assertEquals(isSyllabusAdminQuestion("what are the prerequisites"), true);
  assertEquals(isSyllabusAdminQuestion("office hours?"), true);
  assertEquals(isSyllabusAdminQuestion("explain gradient descent"), false);
});
