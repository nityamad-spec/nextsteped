/**
 * renderCitations
 *
 * Converts inline RAG citation tokens into footnote-style superscripts and a
 * de-duplicated Sources list. Handles two shapes:
 *
 *   1) Prompt-compliant `[[n]]` — the model was given numbered excerpts and
 *      cited them by number. Labels come from `sources` (metadata.sources).
 *   2) Legacy `[[filename #idx]]` / `[filename #idx]` — older stored messages
 *      or new responses where the model ignored the prompt. Labels are
 *      inferred from the token itself (published-plan.json #1 → "Lesson Plan
 *      — Week 1").
 *
 * Same `(file/n, idx)` cited multiple times collapses to one footnote number.
 */

import type { RagSource } from "@/types";

export interface Footnote {
  n: number;
  label: string;
}

export interface RenderedCitations {
  content: string;
  footnotes: Footnote[];
}

const NUMERIC_TOKEN = /\[\[(\d+)\]\]/g;
const LEGACY_TOKEN = /\[\[?([^[\]#\n]+?)\s*#\s*(\d+)\]?\]/g;

function friendlyFromFilename(name: string, idx: number): string {
  const lower = name.toLowerCase();
  if (lower === "published-plan.json" || lower.endsWith("lesson-plan.json")) {
    return idx > 0 ? `Lesson Plan — Week ${idx}` : "Lesson Plan — Overview";
  }
  const stem = name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || name;
  return `${stem} #${idx}`;
}

/**
 * Transform raw content by replacing citation tokens with `<sup>` markers and
 * return the de-duplicated footnote list.
 */
export function renderCitations(
  content: string,
  sources?: RagSource[] | null,
): RenderedCitations {
  if (!content) return { content: "", footnotes: [] };

  const footnotes: Footnote[] = [];
  const keyToN = new Map<string, number>();

  const addFootnote = (key: string, label: string): number => {
    const existing = keyToN.get(key);
    if (existing !== undefined) return existing;
    const n = footnotes.length + 1;
    keyToN.set(key, n);
    footnotes.push({ n, label });
    return n;
  };

  let transformed = content;

  // Pass 1: numeric [[n]] tokens — map through provided `sources`.
  if (sources && sources.length > 0) {
    const byN = new Map(sources.map((s) => [s.n, s]));
    transformed = transformed.replace(NUMERIC_TOKEN, (_m, numStr: string) => {
      const idx = Number(numStr);
      const src = byN.get(idx);
      if (!src) return ""; // strip unknown numeric refs
      const n = addFootnote(`src:${src.n}`, src.label);
      return `<sup>[${n}]</sup>`;
    });
  } else {
    // No sources metadata — leave numeric tokens alone (rare edge case).
    transformed = transformed.replace(NUMERIC_TOKEN, "");
  }

  // Pass 2: legacy [[file #N]] / [file #N] tokens — infer labels.
  transformed = transformed.replace(
    LEGACY_TOKEN,
    (match, fileRaw: string, idxStr: string) => {
      const file = fileRaw.trim();
      // Skip sentinel tokens.
      if (/^(NEEDS_FALLBACK|GENERAL_KNOWLEDGE)$/i.test(file)) return match;
      const idx = Number(idxStr);
      const label = friendlyFromFilename(file, idx);
      const n = addFootnote(`legacy:${file.toLowerCase()}#${idx}`, label);
      return `<sup>[${n}]</sup>`;
    },
  );

  return { content: transformed, footnotes };
}
