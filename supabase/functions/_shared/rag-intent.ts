/**
 * rag-intent
 *
 * Lightweight, dependency-free detection of *document-level* ("meta") questions
 * about a course's uploaded materials.
 *
 * Why this exists: questions like "summarise the syllabus", "what's the lesson
 * plan" or "what topics are covered in unit 2" share almost no vocabulary with
 * the *body* of the documents that answer them, so pure dense-vector retrieval
 * scores them below any sensible similarity floor and the assistant refuses.
 * When we can tell *which document* answers the question we fetch it directly
 * and skip the similarity gate entirely.
 *
 * Pure functions only — unit-tested in `rag-intent_test.ts`.
 */

export const SYLLABUS_FOLDERS = ["syllabus"];
export const LESSON_PLAN_FOLDERS = ["lesson-plan-published", "lesson-plans"];

export type RagIntent =
  /** Whole-syllabus question: summary, grading, attendance, policies, textbooks. */
  | { kind: "syllabus_meta"; folderTypes: string[] }
  /** Whole lesson-plan question: outline, schedule, "what's the lesson plan". */
  | { kind: "lesson_plan_meta"; folderTypes: string[] }
  /** Scoped to a specific week/unit number of the lesson plan. */
  | { kind: "week_scoped"; week: number; folderTypes: string[] }
  /** Ordinary content question — use hybrid top-K retrieval. */
  | { kind: "content" };

const SYLLABUS_WORD = /\bsyllabus|syllabi\b/i;
const LESSON_PLAN_WORD =
  /\b(lesson\s*plan|course\s*(outline|plan|schedule|structure)|class\s*schedule|weekly\s*plan|teaching\s*plan)\b/i;

/**
 * Administrative topics that live in the syllabus but rarely appear as course
 * "concepts" — these must never be treated as off-topic or content questions.
 */
const SYLLABUS_ADMIN =
  /\b(grading|grade\s*(breakdown|split|distribution|weight)|marks?\s*(split|distribution|breakdown)|assessment\s*(policy|scheme|weight)|attendance|late\s*(policy|submission)|academic\s*integrity|plagiarism\s*policy|prerequisites?|textbooks?|reading\s*list|reference\s*books?|office\s*hours|credit\s*hours?|course\s*(objectives?|outcomes?)|learning\s*outcomes?|evaluation\s*(scheme|criteria))\b/i;

/** "unit 2", "Unit-2", "week 4", "wk 4", "module 3", "week four". */
const WEEK_NUMBER =
  /\b(?:unit|week|wk|module)\s*[-–—:#]?\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen)\b/i;

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16,
};

/** Parse a week/unit/module number out of a query. Returns null when absent. */
export function parseWeekNumber(query: string): number | null {
  const m = WEEK_NUMBER.exec(query ?? "");
  if (!m) return null;
  const raw = m[1].toLowerCase();
  const n = /^\d+$/.test(raw) ? Number(raw) : WORD_NUMBERS[raw];
  if (!Number.isFinite(n) || n < 1 || n > 60) return null;
  return n;
}

/** True when the message is an administrative/syllabus-policy question. */
export function isSyllabusAdminQuestion(query: string): boolean {
  const q = query ?? "";
  return SYLLABUS_WORD.test(q) || SYLLABUS_ADMIN.test(q);
}

/**
 * Classify a user message into a retrieval route. Regex-first: no model call,
 * so it adds no latency and no gateway cost to the chat path.
 */
export function detectRagIntent(query: string): RagIntent {
  const q = (query ?? "").trim();
  if (!q) return { kind: "content" };

  const week = parseWeekNumber(q);
  if (week !== null) {
    return { kind: "week_scoped", week, folderTypes: LESSON_PLAN_FOLDERS };
  }

  if (SYLLABUS_WORD.test(q) || SYLLABUS_ADMIN.test(q)) {
    return { kind: "syllabus_meta", folderTypes: SYLLABUS_FOLDERS };
  }

  if (LESSON_PLAN_WORD.test(q)) {
    return { kind: "lesson_plan_meta", folderTypes: LESSON_PLAN_FOLDERS };
  }

  return { kind: "content" };
}
