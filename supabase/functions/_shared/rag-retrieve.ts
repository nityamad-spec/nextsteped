/**
 * rag-retrieve
 *
 * Reusable helper for edge functions to fetch relevant chunks from
 * `public.rag_chunks` for a given course + question, plus a prompt formatter
 * that instructs the model to answer only from the provided context.
 *
 * Retrieval modes:
 *  - hybrid top-K (default): Reciprocal Rank Fusion of dense-vector similarity
 *    and Postgres full-text ranking, so exact tokens ("unit 2", "grading")
 *    are found even when the embedding similarity is weak.
 *  - whole-document / week-scoped: direct fetch by folder type (and week) for
 *    document-level questions, bypassing similarity entirely.
 *
 * Auth: callers MUST enforce course membership themselves (this helper runs
 * with service-role privileges to bypass RLS for efficiency). Use
 * `public.is_course_member(course_id, auth.uid())` in the caller before
 * invoking `retrieveContext`.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const EMBED_MODEL = "google/gemini-embedding-001";

/** Default number of fused chunks returned for a content question. */
export const DEFAULT_TOP_K = 8;
/** Minimum slots reserved per folder type so one doc type can't crowd out another. */
export const MIN_PER_FOLDER = 2;
/** Hard cap on chunks returned by a whole-document fetch. */
export const MAX_DOCUMENT_CHUNKS = 40;

export type RagChunk = {
  id: string;
  file_id: string;
  file_name: string;
  folder_type: string | null;
  chunk_index: number;
  page_start: number | null;
  page_end: number | null;
  content: string;
  similarity: number;
  keyword_rank?: number;
  fused_score?: number;
};

export interface RetrieveContextArgs {
  courseId: string;
  query: string;
  topK?: number;
  folderTypes?: string[];
  /** Set false to use the legacy dense-only RPC. */
  hybrid?: boolean;
}

export interface FetchDocumentArgs {
  courseId: string;
  folderTypes: string[];
  /** When set, only chunks whose `page_start` equals this week are returned. */
  week?: number | null;
  maxChunks?: number;
}

function admin() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, serviceKey);
}

async function embedQuery(query: string, apiKey: string): Promise<number[]> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: query }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Embedding failed [${resp.status}]: ${body.slice(0, 300)}`);
  }
  const data = await resp.json();
  return data.data[0].embedding as number[];
}

/**
 * Re-order a fused result list so that every folder type present gets at least
 * `minPerFolder` slots before the remaining slots are filled by rank. Keeps the
 * overall ordering stable within each group.
 */
export function diversifyByFolder<T extends { folder_type: string | null }>(
  chunks: T[],
  limit: number,
  minPerFolder: number = MIN_PER_FOLDER,
): T[] {
  if (chunks.length <= limit) return chunks;

  const byFolder = new Map<string, T[]>();
  for (const c of chunks) {
    const key = c.folder_type ?? "__none__";
    const list = byFolder.get(key);
    if (list) list.push(c);
    else byFolder.set(key, [c]);
  }

  const picked: T[] = [];
  const seen = new Set<T>();
  for (const list of byFolder.values()) {
    for (const c of list.slice(0, minPerFolder)) {
      if (picked.length >= limit) break;
      picked.push(c);
      seen.add(c);
    }
  }
  for (const c of chunks) {
    if (picked.length >= limit) break;
    if (!seen.has(c)) {
      picked.push(c);
      seen.add(c);
    }
  }
  // Restore the original (rank) ordering among the picked set.
  return chunks.filter((c) => seen.has(c)).slice(0, limit);
}

export async function retrieveContext(
  args: RetrieveContextArgs,
): Promise<RagChunk[]> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");

  const db = admin();
  const vec = await embedQuery(args.query, lovableKey);
  const topK = args.topK ?? DEFAULT_TOP_K;
  const useHybrid = args.hybrid !== false;

  if (useHybrid) {
    const { data, error } = await db.rpc("match_rag_chunks_hybrid", {
      _course_id: args.courseId,
      _query_embedding: vec as unknown as string,
      _query_text: args.query,
      _match_count: topK * 2,
      _folder_types: args.folderTypes ?? null,
    });
    if (!error) {
      return diversifyByFolder((data ?? []) as RagChunk[], topK);
    }
    // Hybrid RPC unavailable (e.g. migration not applied yet) — fall through
    // to the dense-only path rather than breaking chat.
    console.warn("match_rag_chunks_hybrid failed, falling back to dense:", error.message);
  }

  const { data, error } = await db.rpc("match_rag_chunks", {
    _course_id: args.courseId,
    _query_embedding: vec as unknown as string,
    _match_count: topK,
    _folder_types: args.folderTypes ?? null,
  });
  if (error) throw error;
  return (data ?? []) as RagChunk[];
}

/**
 * Fetch a whole document (or one week of the lesson plan) directly, with no
 * similarity involved. Used for document-level "meta" questions.
 * Returned chunks carry `similarity: 1` so downstream tiering treats them as
 * confident evidence — we know these are the right pages.
 */
export async function fetchDocumentChunks(
  args: FetchDocumentArgs,
): Promise<RagChunk[]> {
  const db = admin();
  const { data, error } = await db.rpc("fetch_rag_document_chunks", {
    _course_id: args.courseId,
    _folder_types: args.folderTypes,
    _week: args.week ?? null,
    _max_chunks: args.maxChunks ?? MAX_DOCUMENT_CHUNKS,
  });
  if (error) throw error;
  return ((data ?? []) as Omit<RagChunk, "similarity">[]).map((c) => ({
    ...c,
    similarity: 1,
  }));
}

/**
 * Build a system prompt + user prompt pair that grounds the model in the
 * retrieved chunks. The model is told to cite `[<file_name> #<chunk_index>]`
 * and to say "I don't know" if context is insufficient.
 */
export function formatPrompt(
  chunks: RagChunk[],
  question: string,
): { system: string; user: string } {
  const contextBlock = chunks
    .map(
      (c) =>
        `[Source: ${c.file_name} #${c.chunk_index}${
          c.page_start ? `, p.${c.page_start}${c.page_end && c.page_end !== c.page_start ? `-${c.page_end}` : ""}` : ""
        }]\n${c.content}`,
    )
    .join("\n\n---\n\n");

  const system = [
    "You are a course assistant. Answer the user's question using ONLY the provided context excerpts from the course's uploaded materials.",
    "Cite every claim inline using the format [<file_name> #<chunk_index>], matching the source labels shown above each excerpt.",
    'If the context does not contain enough information to answer, respond exactly with: "I don\'t know based on the provided course materials."',
    "Do not use outside knowledge. Do not invent citations.",
  ].join("\n");

  const user = contextBlock
    ? `Context:\n\n${contextBlock}\n\nQuestion: ${question}`
    : `Context: (no relevant material found)\n\nQuestion: ${question}`;

  return { system, user };
}
