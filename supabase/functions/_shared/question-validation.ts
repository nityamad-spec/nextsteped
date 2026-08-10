// Shared validation helpers for every question-generating edge function.
//
// This module centralises structural + semantic checks that used to live
// (inconsistently) in each generator. Goals:
//
//   1. Answer / option / explanation / Bloom / difficulty / concept mismatches
//      are caught the same way everywhere.
//   2. No silent coercion. Callers get { ok: false, reason } and can either
//      drop the item or feed the reason back to the model as a retry hint.
//   3. Post-batch quota auditing (per-concept / per-difficulty-bucket) so a
//      generator can top up shortfalls instead of shipping a lopsided batch.
//
// See .lovable/plan.md ("Harden question-generation validators") for the
// design rationale, mapping to previous per-file line numbers, and the list
// of issues each helper addresses.

/* --------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------ */

export type QuestionFormat = "mcq" | "true_false" | "short_answer";

export interface CandidateQuestion {
  content_text?: string;
  question?: string; // some generators use "question" instead of content_text
  format?: string;
  type?: string;
  options?: unknown;
  answer?: unknown;
  explanation?: unknown;
  topic?: unknown;
  difficulty_estimate?: unknown;
  bloom_level?: unknown;
}

export interface NormalizedQuestion {
  content_text: string;
  format: QuestionFormat;
  options: string[]; // ["True","False"] for T/F
  answer: string;
  explanation: string;
  topic: string;
  difficulty_estimate: number;
  bloom_level: number;
}

export type ValidationResult<T = NormalizedQuestion> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

/* --------------------------------------------------------------------------
 * Answer normalisation
 * ------------------------------------------------------------------------ */

/**
 * Deterministic answer recovery for MCQ.
 *
 * Order:
 *   1. Verbatim match.
 *   2. Bare letter A-D (case-insensitive, trailing punctuation OK).
 *   3. Prefix-strip + unicode-quote normalise + case-insensitive exact match.
 *   4. Token-Jaccard best match with min similarity 0.6 AND a unique winner.
 *
 * If step 4 has a tie or best similarity < threshold, we refuse — better to
 * drop the question than silently pick the wrong option. This replaces the
 * fuzzy startsWith recovery in generate-practice-questions (was lines 557-597)
 * which could pick either of two options that share a prefix.
 */
export function normalizeAnswer(
  rawAnswer: unknown,
  options: string[],
): ValidationResult<string> {
  const answer = typeof rawAnswer === "string" ? rawAnswer.trim() : "";
  if (!answer) return { ok: false, reason: "empty answer" };

  // 1) verbatim
  if (options.includes(answer)) return { ok: true, value: answer };

  // 2) letter A-D
  const letterMatch = answer.replace(/[^A-Za-z]/g, "").match(/^[A-Da-d]$/);
  if (letterMatch) {
    const idx = letterMatch[0].toUpperCase().charCodeAt(0) - 65;
    if (options[idx] !== undefined) return { ok: true, value: options[idx] };
  }

  // 3) normalized exact
  const norm = (s: string) =>
    s
      .replace(/^\s*\(?[A-Da-d]\)?[\.\):\-\s]+/, "") // strip "A)", "(B).", "C - "
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\s+/g, " ")
      .replace(/[.!?,;:]+$/, "")
      .trim()
      .toLowerCase();
  const na = norm(answer);
  const nOpts = options.map(norm);
  const exactHits = nOpts
    .map((o, i) => ({ i, hit: o === na && na.length > 0 }))
    .filter((x) => x.hit);
  if (exactHits.length === 1) return { ok: true, value: options[exactHits[0].i] };
  if (exactHits.length > 1) return { ok: false, reason: "answer normalises to multiple options" };

  // 4) token Jaccard with unique winner + threshold
  const scored = nOpts.map((o, i) => ({
    i,
    score: jaccardSimilarity(tokenize(o), tokenize(na)),
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  const THRESHOLD = 0.6;
  if (best && best.score >= THRESHOLD && (!second || best.score - second.score >= 0.15)) {
    return { ok: true, value: options[best.i] };
  }

  return { ok: false, reason: "answer not in options (no confident recovery)" };
}

/* --------------------------------------------------------------------------
 * Structural checks (options, format, stem shape, length parity)
 * ------------------------------------------------------------------------ */

export interface StructuralOptions {
  allowedFormats: QuestionFormat[];
  requireFourOptions?: boolean; // default true for MCQ
  maxContentChars?: number; // default 600
  minContentChars?: number; // default 1
}

/** Reject T/F stems shaped like MCQs and MCQ options with residual "A)" prefixes. */
export function validateStructural(
  q: CandidateQuestion,
  opts: StructuralOptions,
): ValidationResult<{ format: QuestionFormat; content_text: string; options: string[] }> {
  if (!q || typeof q !== "object") return { ok: false, reason: "not an object" };

  const rawFormat = String(q.format ?? q.type ?? "").toLowerCase().replace(/[\s-]/g, "_");
  const format: QuestionFormat | null =
    rawFormat === "mcq" || rawFormat === "multiple_choice" || rawFormat === "multiple_choice_question"
      ? "mcq"
      : rawFormat === "true_false" || rawFormat === "truefalse" || rawFormat === "tf" || rawFormat === "boolean"
        ? "true_false"
        : rawFormat === "short_answer" || rawFormat === "shortanswer"
          ? "short_answer"
          : null;
  if (!format) return { ok: false, reason: `bad format '${rawFormat || "(missing)"}'` };
  if (!opts.allowedFormats.includes(format)) return { ok: false, reason: `format ${format} not allowed` };

  const content = String(q.content_text ?? q.question ?? "").trim();
  const minLen = opts.minContentChars ?? 1;
  const maxLen = opts.maxContentChars ?? 600;
  if (content.length < minLen) return { ok: false, reason: "content_text too short" };
  if (content.length > maxLen) return { ok: false, reason: `content_text > ${maxLen} chars` };

  let options: string[];
  if (format === "mcq") {
    const requireFour = opts.requireFourOptions !== false;
    if (!Array.isArray(q.options)) return { ok: false, reason: "options must be array" };
    options = (q.options as unknown[]).map((o) => String(o ?? "").trim());
    if (requireFour && options.length !== 4) return { ok: false, reason: `mcq needs 4 options, got ${options.length}` };
    if (!requireFour && options.length < 2) return { ok: false, reason: "mcq needs ≥2 options" };
    if (options.some((o) => !o)) return { ok: false, reason: "empty option" };
    if (new Set(options).size !== options.length) return { ok: false, reason: "duplicate options" };

    // Reject leftover "A) …" prefixes inside individual options.
    if (options.some((o) => /^[A-Da-d]\)\s+/.test(o))) {
      return { ok: false, reason: "options still contain letter prefixes (A)/B)/…)" };
    }

    // Length parity anti-cue.
    const lens = options.map((o) => o.length);
    const maxL = Math.max(...lens);
    const minL = Math.min(...lens);
    if (minL > 0 && maxL / minL > 1.6) {
      return { ok: false, reason: `option length imbalance ${minL}->${maxL} (>1.6x)` };
    }
  } else if (format === "true_false") {
    options = ["True", "False"];
    // Reject stems shaped like MCQs (was practice lines 539-550).
    const stemLooksMcq =
      /^\s*(which|what|select|choose|identify|pick|name)\b/i.test(content) ||
      /of the following/i.test(content);
    if (stemLooksMcq) return { ok: false, reason: "true/false stem is shaped like an MCQ" };
  } else {
    options = []; // short_answer
  }

  return { ok: true, value: { format, content_text: content, options } };
}

/* --------------------------------------------------------------------------
 * Short answer
 * ------------------------------------------------------------------------ */

export interface ShortAnswerCandidate {
  answer?: unknown;
  model_answer?: unknown;
  answer_max_words?: unknown;
  options?: unknown;
}

export interface ShortAnswerValue {
  answer: string;
  model_answer: string;
  answer_max_words: number;
}

export interface ShortAnswerOptions {
  /** Question stem — used for the answer-leakage guard. */
  stem?: string;
  maxAnswerWords?: number; // default 30
  minModelAnswerChars?: number; // default 20
  maxModelAnswerChars?: number; // default 1200
  defaultAnswerMaxWords?: number; // default 60
}

/**
 * Single source of truth for short-answer item quality. Every generator
 * (weekly quiz, exam, diagnostic, practice) must call this so the rules
 * cannot drift per-function.
 *
 * Checks:
 *   - concise reference answer present and short enough
 *   - no options attached
 *   - fuller model answer present and within length bounds
 *   - suggested word budget clamped
 *   - model answer agrees with the reference answer (key-term overlap)
 *   - the stem does not restate the answer (leakage guard)
 */
export function validateShortAnswer(
  q: ShortAnswerCandidate,
  opts: ShortAnswerOptions = {},
): ValidationResult<ShortAnswerValue> {
  const maxAnswerWords = opts.maxAnswerWords ?? 30;
  const minModelChars = opts.minModelAnswerChars ?? 20;
  const maxModelChars = opts.maxModelAnswerChars ?? 1200;

  const answer = String(q.answer ?? "").trim();
  if (!answer) return { ok: false, reason: "short_answer requires an answer" };
  const answerWords = answer.split(/\s+/).filter(Boolean).length;
  if (answerWords > maxAnswerWords) {
    return { ok: false, reason: `short_answer reference answer too long (${answerWords} words)` };
  }
  if (Array.isArray(q.options) && (q.options as unknown[]).length > 0) {
    return { ok: false, reason: "short_answer must not carry options" };
  }

  const model_answer = String(q.model_answer ?? "").trim();
  if (!model_answer) return { ok: false, reason: "short_answer requires model_answer" };
  if (model_answer.length < minModelChars) {
    return { ok: false, reason: `model_answer too short (<${minModelChars} chars)` };
  }
  if (model_answer.length > maxModelChars) {
    return { ok: false, reason: `model_answer > ${maxModelChars} chars` };
  }

  const rawMax = Number(q.answer_max_words);
  const answer_max_words = Number.isFinite(rawMax)
    ? Math.min(120, Math.max(20, Math.round(rawMax)))
    : (opts.defaultAnswerMaxWords ?? 60);

  // Model answer must actually support the concise reference answer.
  const refTokens = topAnswerTokens(answer);
  if (refTokens.length > 0) {
    const modelTokens = new Set(tokenize(model_answer, ANSWER_STOP_WORDS));
    const matched = refTokens.filter((t) => modelTokens.has(t)).length;
    const required = refTokens.length <= 2 ? 1 : Math.max(2, Math.ceil(refTokens.length * 0.3));
    if (matched < required) {
      return { ok: false, reason: "model_answer does not support the reference answer" };
    }
  }

  // Leakage: the stem must not restate the answer.
  const stem = String(opts.stem ?? "").trim();
  if (stem && refTokens.length >= 2) {
    const stemTokens = tokenize(stem, ANSWER_STOP_WORDS);
    const contained = containmentSimilarity(refTokens, stemTokens);
    const stemKey = ` ${stemTokens.join(" ")} `;
    const answerKey = ` ${tokenize(answer, ANSWER_STOP_WORDS).join(" ")} `;
    if (contained >= 0.99 || (answerKey.trim() && stemKey.includes(answerKey))) {
      return { ok: false, reason: "question stem restates the reference answer (answer leakage)" };
    }
  }

  return { ok: true, value: { answer, model_answer, answer_max_words } };
}



/** Correct-option length-parity anti-cue (call after normalizeAnswer for MCQ). */
export function validateOptionParity(options: string[], answer: string): ValidationResult<true> {
  if (options.length < 2) return { ok: true, value: true };
  const lens = options.map((o) => o.length);
  const maxLen = Math.max(...lens);
  const avgLen = lens.reduce((s, n) => s + n, 0) / lens.length;
  const strictlyLongest = lens.filter((l) => l === maxLen).length === 1 && answer.length === maxLen;
  if (strictlyLongest && answer.length > avgLen * 1.25) {
    return { ok: false, reason: "correct option is strictly longest and >25% above avg length" };
  }
  return { ok: true, value: true };
}

/* --------------------------------------------------------------------------
 * Concept mapping
 * ------------------------------------------------------------------------ */

/** Match a topic string against a concept map (exact then case-insensitive). */
export function validateConcept(
  rawTopic: unknown,
  conceptByCode: Record<string, unknown>,
): ValidationResult<string> {
  const topic = typeof rawTopic === "string" ? rawTopic.trim() : "";
  if (!topic) return { ok: false, reason: "empty topic" };
  if (topic in conceptByCode) return { ok: true, value: topic };
  const lower = topic.toLowerCase();
  for (const code of Object.keys(conceptByCode)) {
    if (code.toLowerCase() === lower) return { ok: true, value: code };
  }
  return { ok: false, reason: `topic '${topic}' not in allowed concept list` };
}

/* --------------------------------------------------------------------------
 * Bloom + difficulty
 * ------------------------------------------------------------------------ */

export interface BloomOptions {
  min?: number; // default 1
  max?: number; // default 6
  /** If given, additionally require bloom >= this level when difficulty >= 0.7 */
  enforceDifficultyConsistency?: boolean;
  difficulty?: number; // required if enforceDifficultyConsistency
}

export function validateBloom(raw: unknown, opts: BloomOptions = {}): ValidationResult<number> {
  const n = Math.round(Number(raw));
  const min = opts.min ?? 1;
  const max = opts.max ?? 6;
  if (!Number.isInteger(n) || n < min || n > max) {
    return { ok: false, reason: `bloom_level ${raw} out of range [${min},${max}]` };
  }
  if (opts.enforceDifficultyConsistency && typeof opts.difficulty === "number") {
    if (opts.difficulty >= 0.7 && n < 3) {
      return { ok: false, reason: `hard question (difficulty ${opts.difficulty.toFixed(2)}) should be bloom ≥ 3, got ${n}` };
    }
    if (opts.difficulty <= 0.25 && n > 4) {
      return { ok: false, reason: `easy question (difficulty ${opts.difficulty.toFixed(2)}) should be bloom ≤ 4, got ${n}` };
    }
  }
  return { ok: true, value: n };
}

export interface DifficultyOptions {
  /** Expected midpoint. If given, difficulty must fall within midpoint ± band. */
  midpoint?: number;
  band?: number; // default 0.15 when midpoint set
  fallback?: number; // used when raw isn't finite AND no midpoint given (default 0.5)
}

export function validateDifficulty(
  raw: unknown,
  opts: DifficultyOptions = {},
): ValidationResult<number> {
  let d = Number(raw);
  if (!Number.isFinite(d)) {
    if (opts.midpoint !== undefined) return { ok: false, reason: "difficulty not numeric" };
    d = opts.fallback ?? 0.5;
  }
  d = Math.max(0, Math.min(1, d));
  if (opts.midpoint !== undefined) {
    const band = opts.band ?? 0.15;
    if (d < opts.midpoint - band || d > opts.midpoint + band) {
      return { ok: false, reason: `difficulty ${d.toFixed(2)} outside ${opts.midpoint}±${band}` };
    }
  }
  return { ok: true, value: Math.round(d * 100) / 100 };
}

/* --------------------------------------------------------------------------
 * Explanation ↔ answer alignment
 * ------------------------------------------------------------------------ */

const QUESTION_STOP_WORDS = new Set([
  "a","an","and","are","as","at","be","by","can","do","does","for","from","how","in","is","it",
  "of","on","or","should","that","the","their","this","to","what","when","which","why","with",
]);
const ANSWER_STOP_WORDS = new Set([
  ...QUESTION_STOP_WORDS, "about","because","best","correct","describes","means","option","statement",
]);

function stripDiacritics(v: string) {
  return v.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}
function stemToken(token: string) {
  let t = token.toLowerCase();
  if (t.length > 5 && t.endsWith("ies")) t = `${t.slice(0, -3)}y`;
  else if (t.length > 6 && t.endsWith("ing")) t = t.slice(0, -3);
  else if (t.length > 5 && t.endsWith("ed")) t = t.slice(0, -2);
  else if (t.length > 4 && t.endsWith("es")) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith("s") && !/(ss|us|is|ias)$/.test(t)) t = t.slice(0, -1);
  return t;
}
export function tokenize(v: string, stopWords = QUESTION_STOP_WORDS): string[] {
  const normalized = stripDiacritics(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized) return [];
  return normalized.split(/\s+/).map(stemToken).filter((t) => t.length > 2 && !stopWords.has(t));
}
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}
export function containmentSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}
function topAnswerTokens(answer: string): string[] {
  const tokens = tokenize(answer, ANSWER_STOP_WORDS);
  const seen = new Set<string>();
  return tokens.filter((t) => (seen.has(t) ? false : (seen.add(t), true)));
}

export interface ExplanationCheckInput {
  format: QuestionFormat;
  options: string[]; // ["True","False"] for T/F
  answer: string;
  explanation: string;
}

/**
 * Semantic explanation ↔ answer check.
 *
 *   - Non-empty and reasonable length.
 *   - T/F: contradiction detector ("this is false" while answer is "True").
 *   - MCQ: (a) rejects explanations that literally name-drop a wrong letter
 *          ("the correct option is B") when B isn't the answer, and
 *          (b) requires the explanation to share more key tokens with the
 *          correct answer than with any distractor.
 */
export function validateExplanation(q: ExplanationCheckInput): ValidationResult<string> {
  const explanation = q.explanation.trim();
  if (!explanation) return { ok: false, reason: "empty explanation" };
  if (explanation.length < 15) return { ok: false, reason: "explanation too short (<15 chars)" };

  if (q.format === "true_false") {
    const lower = explanation.toLowerCase();
    if (q.answer === "True"
      && /\bfalse\b|\bincorrect\b|\bnot true\b/.test(lower)
      && !/\bnot false\b/.test(lower)) {
      return { ok: false, reason: "T/F explanation contradicts 'True' answer" };
    }
    if (q.answer === "False"
      && /\btrue\b|\bcorrect\b/.test(lower)
      && !/\bnot true\b|\bincorrect\b/.test(lower)) {
      return { ok: false, reason: "T/F explanation contradicts 'False' answer" };
    }
    return { ok: true, value: explanation };
  }

  if (q.format === "mcq" && q.options.length > 0) {
    // (a) letter name-drop check.
    const answerIdx = q.options.indexOf(q.answer);
    const letters = ["A", "B", "C", "D", "E"];
    const letterMatches = [...explanation.matchAll(/\b(?:option|choice|answer)\s+([A-Ea-e])\b/gi)];
    for (const m of letterMatches) {
      const namedIdx = m[1].toUpperCase().charCodeAt(0) - 65;
      if (namedIdx !== answerIdx && namedIdx < q.options.length) {
        return {
          ok: false,
          reason: `explanation names option ${letters[namedIdx]} but correct is ${letters[answerIdx] ?? "?"}`,
        };
      }
    }

    // (b) token overlap check.
    const answerTokens = topAnswerTokens(q.answer);
    if (answerTokens.length > 0) {
      const explanationTokens = new Set(tokenize(explanation, ANSWER_STOP_WORDS));
      const matched = answerTokens.filter((t) => explanationTokens.has(t)).length;
      const required = answerTokens.length <= 2 ? 1 : Math.max(2, Math.ceil(answerTokens.length * 0.3));
      if (matched < required) {
        return { ok: false, reason: "explanation does not reference enough key terms from correct answer" };
      }
      for (const opt of q.options) {
        if (opt === q.answer) continue;
        const wrong = topAnswerTokens(opt);
        if (wrong.length === 0) continue;
        const wrongMatches = wrong.filter((t) => explanationTokens.has(t)).length;
        const wrongRequired = wrong.length <= 2 ? wrong.length : Math.ceil(wrong.length * 0.6);
        if (wrongMatches >= wrongRequired && matched < wrongMatches) {
          return { ok: false, reason: "explanation supports a distractor more than the correct answer" };
        }
      }
    }
  }

  return { ok: true, value: explanation };
}

/* --------------------------------------------------------------------------
 * Deduplication
 * ------------------------------------------------------------------------ */

export interface DedupItem {
  content_text: string;
  answer: string;
  topic: string;
}

function normalizedQuestionKey(v: string) {
  return tokenize(v).join(" ");
}
function questionSimilarity(a: DedupItem, b: DedupItem): number {
  const aT = tokenize(a.content_text), bT = tokenize(b.content_text);
  const stemJ = jaccardSimilarity(aT, bT);
  const stemC = containmentSimilarity(aT, bT);
  const ansJ = jaccardSimilarity(tokenize(a.answer), tokenize(b.answer));
  const sameTopic = a.topic === b.topic ? 0.08 : 0;
  return Math.max(stemJ, stemC * 0.85, stemJ * 0.75 + ansJ * 0.2 + sameTopic);
}
export function isLikelyDuplicate(a: DedupItem, b: DedupItem): boolean {
  const kA = normalizedQuestionKey(a.content_text);
  const kB = normalizedQuestionKey(b.content_text);
  if (kA && kA === kB) return true;
  if (questionSimilarity(a, b) >= 0.72) return true;
  const ansOverlap = jaccardSimilarity(tokenize(a.answer), tokenize(b.answer));
  const stemC = containmentSimilarity(tokenize(a.content_text), tokenize(b.content_text));
  return a.topic === b.topic && stemC >= 0.62 && ansOverlap >= 0.35;
}

/** Return items that are NOT near-duplicates of anything in existing[] or already accepted. */
export function dedupWithin<T extends DedupItem>(
  incoming: T[],
  existing: DedupItem[] = [],
): { kept: T[]; rejected: { item: T; duplicateOf: string }[] } {
  const kept: T[] = [];
  const rejected: { item: T; duplicateOf: string }[] = [];
  const pool: DedupItem[] = [...existing];
  for (const item of incoming) {
    const dup = pool.find((p) => isLikelyDuplicate(p, item));
    if (dup) rejected.push({ item, duplicateOf: dup.content_text.slice(0, 90) });
    else {
      kept.push(item);
      pool.push(item);
    }
  }
  return { kept, rejected };
}

/* --------------------------------------------------------------------------
 * Batch quota auditing
 * ------------------------------------------------------------------------ */

export interface BatchQuotaSpec {
  perConcept: Record<string, number>;
  difficulty?: { easy: number; medium: number; hard: number };
}

export interface QuotaShortfall {
  perConcept: Record<string, number>; // positive = short, negative = surplus
  difficulty?: { easy: number; medium: number; hard: number };
}

function bucketize(d: number): "easy" | "medium" | "hard" {
  if (d < 0.35) return "easy";
  if (d < 0.65) return "medium";
  return "hard";
}

export function auditBatchQuotas(
  accepted: { topic: string; difficulty_estimate: number }[],
  spec: BatchQuotaSpec,
): QuotaShortfall {
  const gotConcept: Record<string, number> = {};
  for (const q of accepted) gotConcept[q.topic] = (gotConcept[q.topic] ?? 0) + 1;
  const perConcept: Record<string, number> = {};
  for (const [code, want] of Object.entries(spec.perConcept)) {
    perConcept[code] = want - (gotConcept[code] ?? 0);
  }
  let difficulty: QuotaShortfall["difficulty"] | undefined;
  if (spec.difficulty) {
    const got = { easy: 0, medium: 0, hard: 0 };
    for (const q of accepted) got[bucketize(q.difficulty_estimate)]++;
    difficulty = {
      easy: spec.difficulty.easy - got.easy,
      medium: spec.difficulty.medium - got.medium,
      hard: spec.difficulty.hard - got.hard,
    };
  }
  return { perConcept, difficulty };
}

/* --------------------------------------------------------------------------
 * Retry-hint formatter
 * ------------------------------------------------------------------------ */

/** Compact a list of rejection reasons into a hint to feed back to the model. */
export function summarizeRejections(reasons: string[], max = 5): string {
  if (reasons.length === 0) return "";
  const counts = new Map<string, number>();
  for (const r of reasons) {
    // Keep the human prefix, drop content_text quotes.
    const key = r.replace(/:.*$/, "").slice(0, 80);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([k, n]) => `${n}× ${k}`);
  return `Previously rejected: ${top.join("; ")}. Avoid these issues in the next batch.`;
}
