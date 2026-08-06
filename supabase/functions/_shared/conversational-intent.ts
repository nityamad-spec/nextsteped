/**
 * conversational-intent
 *
 * Cheap, dependency-free heuristic that recognises filler / conversational
 * turns ("ok", "sounds good", "what's next", "thanks!") so the chat pipeline
 * can skip RAG grounding and the relevance gate for them.
 *
 * Deliberately conservative: it only returns true on high confidence. Anything
 * longer or topic-bearing falls through to the model classifier.
 */

/** Exact (normalised) filler phrases. */
const FILLER_PHRASES = new Set([
  "ok", "okay", "k", "kk", "okie", "alright", "all right",
  "thanks", "thank you", "thanks a lot", "thank you so much", "ty", "thx",
  "got it", "gotcha", "understood", "i see", "makes sense", "that makes sense",
  "sounds good", "sounds great", "good", "great", "nice", "cool", "awesome",
  "perfect", "excellent", "amazing", "helpful", "that helps", "that helped",
  "yes", "yeah", "yep", "yup", "sure", "ok sure", "no", "nope", "nah",
  "continue", "please continue", "go on", "go ahead", "next", "whats next",
  "what next", "what s next", "and then", "then", "more", "tell me more",
  "hi", "hello", "hey", "hey there", "hi there", "yo", "good morning",
  "good afternoon", "good evening", "how are you", "how are you doing",
  "bye", "goodbye", "see you", "later", "thanks bye",
  "done", "finished", "wait", "one sec", "hmm", "hm", "oh", "ah", "lol",
  "sorry", "my bad", "np", "no problem", "welcome", "you re welcome",
  "start", "lets start", "let s start", "lets go", "let s go", "ready",
]);

/** Content-bearing words that disqualify a short message from being filler. */
const TOPIC_HINT = /\b(what is|what are|how do|how does|why|explain|define|example|code|error|question|quiz|exam|week|chapter|concept|topic|syllabus|assignment|formula|difference)\b/;

/** Normalise for matching: lowercase, strip punctuation/emoji, collapse spaces. */
export function normalizeUtterance(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the message is small talk / filler that should be answered
 * conversationally without RAG retrieval or the off-topic refusal.
 */
export function isConversationalFiller(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const text = String(raw);

  // Code blocks or long messages are never filler.
  if (text.includes("```")) return false;
  if (text.length > 60) return false;

  const norm = normalizeUtterance(text);
  if (!norm) return false;

  if (FILLER_PHRASES.has(norm)) return true;

  const words = norm.split(" ");
  if (words.length > 4) return false;

  // Short but topic-bearing → treat as a real question.
  if (TOPIC_HINT.test(norm)) return false;

  // Short message made entirely of filler tokens (e.g. "ok thanks", "cool got it").
  const FILLER_TOKENS = new Set([
    "ok", "okay", "k", "alright", "thanks", "thank", "you", "ty", "thx",
    "got", "it", "yes", "yeah", "yep", "yup", "sure", "no", "nope", "nah",
    "cool", "nice", "great", "good", "perfect", "awesome", "amazing",
    "hi", "hello", "hey", "bye", "please", "continue", "go", "on", "ahead",
    "next", "more", "then", "and", "done", "sounds", "makes", "sense",
    "understood", "helpful", "helps", "i", "see", "lol", "haha", "wow",
  ]);
  return words.every((w) => FILLER_TOKENS.has(w));
}
