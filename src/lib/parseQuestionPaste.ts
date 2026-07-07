// Deterministic parser for pasted question blocks used by the Exam Mode
// "Paste question" helper. Accepts a single MCQ or True/False block in the
// common formats professors copy from docs and returns structured fields.

export type ParsedQuestion = {
  question: string;
  options: string[];
  correctIndex: number | null;
  detectedType: "MCQ" | "TF";
};

export type ParseResult =
  | { ok: true; value: ParsedQuestion }
  | { ok: false; error: string };

const OPTION_RE =
  /^\s*(?:\(\s*([A-Da-d1-4])\s*\)|([A-Da-d1-4]))\s*[\.\):\-]\s*(.+?)\s*$/;
const ANSWER_LINE_RE =
  /^\s*(?:answer|ans|correct)\s*[:\-]\s*(?:\(?\s*)([A-Da-d1-4])\s*\)?\s*$/i;
const INLINE_CORRECT_RE = /\s*(\*|\[correct\]|\(correct\)|✓)\s*$/i;

function letterOrNumberToIndex(tok: string): number | null {
  const t = tok.trim().toUpperCase();
  if (t >= "A" && t <= "D") return t.charCodeAt(0) - 65;
  if (t >= "1" && t <= "4") return parseInt(t, 10) - 1;
  return null;
}

export function parseQuestionBlock(raw: string): ParseResult {
  if (!raw || !raw.trim()) return { ok: false, error: "Paste is empty." };

  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { ok: false, error: "Need a question line and at least one option." };
  }

  const questionParts: string[] = [];
  const options: { index: number; text: string; markedCorrect: boolean }[] = [];
  let answerFromLine: number | null = null;
  let seenFirstOption = false;

  for (const line of lines) {
    const ansMatch = line.match(ANSWER_LINE_RE);
    if (ansMatch) {
      const idx = letterOrNumberToIndex(ansMatch[1]);
      if (idx != null) answerFromLine = idx;
      continue;
    }

    const optMatch = line.match(OPTION_RE);
    if (optMatch) {
      const token = optMatch[1] ?? optMatch[2];
      const idx = letterOrNumberToIndex(token);
      let text = optMatch[3];
      let markedCorrect = false;
      const inline = text.match(INLINE_CORRECT_RE);
      if (inline) {
        markedCorrect = true;
        text = text.replace(INLINE_CORRECT_RE, "").trim();
      }
      if (idx != null && text.length > 0) {
        options.push({ index: idx, text, markedCorrect });
        seenFirstOption = true;
        continue;
      }
    }

    if (!seenFirstOption) {
      questionParts.push(line);
    }
    // Lines after options that aren't answer lines or options are ignored.
  }

  const question = questionParts.join(" ").replace(/\s+/g, " ").trim();
  if (!question) return { ok: false, error: "Could not find the question text." };
  if (options.length === 0) {
    return { ok: false, error: "Could not find any options (start each option with A) B) C) D) or 1. 2. 3. 4.)." };
  }

  // Place options into positions by their detected index; fall back to order.
  const bySlot: string[] = [];
  let inlineCorrect: number | null = null;
  const usedSequential = options.every((o, i) => o.index === i);
  if (usedSequential) {
    for (const o of options) {
      bySlot.push(o.text);
      if (o.markedCorrect && inlineCorrect == null) inlineCorrect = bySlot.length - 1;
    }
  } else {
    // Sort by declared index
    const sorted = [...options].sort((a, b) => a.index - b.index);
    for (const o of sorted) {
      bySlot[o.index] = o.text;
      if (o.markedCorrect && inlineCorrect == null) inlineCorrect = o.index;
    }
    // Fill any gaps with empty strings so downstream logic sees positions.
    for (let i = 0; i < bySlot.length; i++) if (bySlot[i] == null) bySlot[i] = "";
  }

  // True/False detection when exactly 2 options and they're True/False.
  const isTF =
    bySlot.length === 2 &&
    /^(true|t)$/i.test(bySlot[0]) &&
    /^(false|f)$/i.test(bySlot[1]);

  if (!isTF && bySlot.length !== 4) {
    return {
      ok: false,
      error: `Expected 4 options for MCQ (got ${bySlot.length}). Use A) B) C) D) on separate lines.`,
    };
  }

  const correctIndex = answerFromLine ?? inlineCorrect ?? null;

  return {
    ok: true,
    value: {
      question,
      options: bySlot,
      correctIndex,
      detectedType: isTF ? "TF" : "MCQ",
    },
  };
}
