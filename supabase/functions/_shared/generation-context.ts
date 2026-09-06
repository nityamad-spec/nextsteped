/**
 * generation-context
 *
 * Shared retrieval step used by every question generator (diagnostic, weekly
 * quiz, practice, exam) so generated items are grounded in the course's own
 * uploaded material instead of the concept name alone.
 *
 * Design goals:
 *  - ONE retrieval per generation run (single embedding + single RPC), reused
 *    across every batch, tier and backfill pass. Callers must build the context
 *    once at the top of the request and pass it down.
 *  - Never fatal: if the course has no indexed material, or retrieval fails,
 *    the returned context is empty and callers fall back to today's behaviour.
 *  - Every excerpt carries a stable label (S1, S2, ...) so the model can name
 *    the source it used, which we resolve back to file/page for the professor.
 */

import {
  fetchDocumentChunks,
  retrieveContext,
  type RagChunk,
} from "./rag-retrieve.ts";

/** Character budget for the whole excerpt block embedded in a prompt. */
export const DEFAULT_CONTEXT_CHAR_BUDGET = 12_000;
/** Upper bound on chunks pulled for a generation run. */
export const MAX_GENERATION_CHUNKS = 24;

export interface SourceRef {
  file_id: string;
  file_name: string;
  page_start: number | null;
  page_end: number | null;
  chunk_index: number;
}

export interface GenerationContext {
  /** Prompt-ready excerpt block; empty string when nothing was retrieved. */
  contextBlock: string;
  /** De-duplicated list of every source behind the block. */
  sources: SourceRef[];
  /** Label ("S1") -> source, for resolving what the model cites. */
  labelToSource: Record<string, SourceRef>;
  /** concept_code -> labels whose excerpt mentions that concept. */
  byConcept: Record<string, string[]>;
  isEmpty: boolean;
}

export const EMPTY_GENERATION_CONTEXT: GenerationContext = {
  contextBlock: "",
  sources: [],
  labelToSource: {},
  byConcept: {},
  isEmpty: true,
};

export interface BuildGenerationContextArgs {
  courseId: string;
  /** Concept codes in play for this generation run. */
  conceptCodes: string[];
  courseName?: string;
  /** Lesson-plan week to additionally pull verbatim (weekly quiz). */
  week?: number | null;
  /** Restrict retrieval to these folder types; defaults to every folder. */
  folderTypes?: string[];
  maxChunks?: number;
  charBudget?: number;
}

function humanConcept(code: string): string {
  return code.replace(/[_-]+/g, " ").trim();
}

/** Chunks a concept is considered "about" when its words appear in the text. */
function conceptMatches(code: string, content: string): boolean {
  const words = humanConcept(code).toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (words.length === 0) return false;
  const hay = content.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * Trim the chunk list so the rendered block fits the character budget. Longest
 * excerpts are truncated first (rather than dropped) so folder coverage stays
 * intact.
 */
export function fitToBudget(chunks: RagChunk[], budget: number): RagChunk[] {
  const total = chunks.reduce((n, c) => n + c.content.length, 0);
  if (total <= budget) return chunks;

  const order = [...chunks].sort((a, b) => b.content.length - a.content.length);
  const trimmed = new Map<string, string>();
  let running = total;
  for (const c of order) {
    if (running <= budget) break;
    const current = trimmed.get(c.id) ?? c.content;
    const excess = running - budget;
    const keep = Math.max(200, current.length - excess);
    if (keep >= current.length) continue;
    trimmed.set(c.id, current.slice(0, keep).trimEnd() + " …");
    running -= current.length - keep;
  }
  return chunks.map((c) =>
    trimmed.has(c.id) ? { ...c, content: trimmed.get(c.id)! } : c
  );
}

function pageLabel(c: RagChunk): string {
  if (!c.page_start) return "";
  const end = c.page_end && c.page_end !== c.page_start ? `-${c.page_end}` : "";
  return `, p.${c.page_start}${end}`;
}

/** Render the retrieved chunks into the labelled block used by every prompt. */
export function renderGenerationContext(
  chunks: RagChunk[],
  conceptCodes: string[],
  charBudget: number = DEFAULT_CONTEXT_CHAR_BUDGET,
): GenerationContext {
  if (chunks.length === 0) return EMPTY_GENERATION_CONTEXT;

  const fitted = fitToBudget(chunks, charBudget);
  const labelToSource: Record<string, SourceRef> = {};
  const byConcept: Record<string, string[]> = {};
  const sources: SourceRef[] = [];
  const seenSource = new Set<string>();
  const parts: string[] = [];

  fitted.forEach((c, i) => {
    const label = `S${i + 1}`;
    const ref: SourceRef = {
      file_id: c.file_id,
      file_name: c.file_name,
      page_start: c.page_start ?? null,
      page_end: c.page_end ?? null,
      chunk_index: c.chunk_index,
    };
    labelToSource[label] = ref;
    const key = `${ref.file_id}:${ref.chunk_index}`;
    if (!seenSource.has(key)) {
      seenSource.add(key);
      sources.push(ref);
    }

    const related = conceptCodes.filter((code) => conceptMatches(code, c.content));
    for (const code of related) {
      (byConcept[code] ??= []).push(label);
    }

    parts.push(
      `[${label} | ${c.file_name}${pageLabel(c)}${
        related.length ? ` | concepts: ${related.join(", ")}` : ""
      }]\n${c.content}`,
    );
  });

  const contextBlock = [
    "COURSE MATERIAL EXCERPTS — verbatim extracts from this course's own uploaded documents (teaching materials, syllabus, lesson plan).",
    "Use them as the authority for terminology, notation, examples and depth. Never contradict them, and never quote long passages verbatim into a question.",
    "For each question, set \"source_label\" to the label (e.g. S1) of the excerpt you drew on, or omit it when you wrote the question from the concept name alone.",
    "",
    parts.join("\n\n---\n\n"),
  ].join("\n");

  return { contextBlock, sources, labelToSource, byConcept, isEmpty: false };
}

/**
 * Build the grounding context for one generation run. Never throws: retrieval
 * problems degrade to an empty context so generation keeps working.
 */
export async function buildGenerationContext(
  args: BuildGenerationContextArgs,
): Promise<GenerationContext> {
  const conceptCodes = (args.conceptCodes ?? []).filter(Boolean);
  try {
    const query = [
      args.courseName ?? "",
      args.week ? `week ${args.week}` : "",
      conceptCodes.map(humanConcept).join(", "),
    ]
      .filter(Boolean)
      .join(" — ");
    if (!query.trim()) return EMPTY_GENERATION_CONTEXT;

    const maxChunks = Math.max(
      8,
      Math.min(args.maxChunks ?? MAX_GENERATION_CHUNKS, MAX_GENERATION_CHUNKS),
    );

    const chunks = await retrieveContext({
      courseId: args.courseId,
      query,
      topK: maxChunks,
      folderTypes: args.folderTypes,
    });

    let all = chunks;
    if (args.week) {
      try {
        const weekChunks = await fetchDocumentChunks({
          courseId: args.courseId,
          folderTypes: ["lesson-plan-published"],
          week: args.week,
          maxChunks: 4,
        });
        const seen = new Set(chunks.map((c) => c.id));
        all = [...weekChunks.filter((c) => !seen.has(c.id)), ...chunks];
      } catch (_e) {
        // Lesson plan not indexed — the hybrid results alone are fine.
      }
    }

    return renderGenerationContext(
      all.slice(0, MAX_GENERATION_CHUNKS),
      conceptCodes,
      args.charBudget ?? DEFAULT_CONTEXT_CHAR_BUDGET,
    );
  } catch (e) {
    console.warn(
      "[generation-context] retrieval failed, generating without material:",
      e instanceof Error ? e.message : String(e),
    );
    return EMPTY_GENERATION_CONTEXT;
  }
}

/**
 * Resolve the model's `source_label` back to a stored source list.
 * Unknown / missing labels resolve to null (question stays, just ungrounded).
 */
export function resolveSourceRefs(
  label: unknown,
  ctx: GenerationContext,
): SourceRef[] | null {
  if (ctx.isEmpty) return null;
  const raw = typeof label === "string" ? label : "";
  const labels = raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .filter(Boolean);
  const refs: SourceRef[] = [];
  const seen = new Set<string>();
  for (const l of labels) {
    const ref = ctx.labelToSource[l];
    if (!ref) continue;
    const key = `${ref.file_id}:${ref.chunk_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs.length ? refs : null;
}

/** JSON-schema property to merge into each generator's tool definition. */
export const SOURCE_LABEL_SCHEMA_PROPERTY = {
  source_label: {
    type: "string",
    description:
      "Label of the course-material excerpt this question is based on (e.g. \"S1\"). Omit when no excerpt was used.",
  },
} as const;
