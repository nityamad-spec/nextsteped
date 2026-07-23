/**
 * ingest-rag-document
 *
 * Ingests a single uploaded PDF from the `course-materials` storage bucket into
 * `public.rag_chunks` so it can be retrieved by the RAG helper.
 *
 * Trigger:  invoked (fire-and-forget) by the client-side uploader after
 *           `course_material_files` is upserted. Idempotent: existing chunks
 *           for the file are deleted before re-inserting.
 *
 * Steps:
 *   1. Load the file row + mark rag_status = 'processing'.
 *   2. Skip non-PDF files (mark 'skipped').
 *   3. Download the PDF from storage.
 *   4. Extract text per page with pdfjs-dist (legacy build, no worker).
 *   5. For pages with < 20 non-whitespace chars, OCR the page via the Lovable
 *      AI Gateway vision model (google/gemini-2.5-flash) using the raw PDF
 *      page range as a `file` content block (no canvas rasterization — keeps
 *      the function Deno-friendly).
 *   6. Chunk to ~1000 chars with 150-char overlap on paragraph/sentence
 *      boundaries, tracking source page ranges.
 *   7. Embed in batches of <=100 with google/gemini-embedding-001.
 *   8. Bulk insert into rag_chunks.
 *   9. Mark rag_status = 'indexed' + rag_indexed_at.
 *
 * Errors along the way set rag_status='failed' + rag_error and return 500.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EMBED_MODEL = "google/gemini-embedding-001";
const EMBED_MODEL_VERSION = "google/gemini-embedding-001@v1";
const OCR_MODEL = "google/gemini-2.5-flash";
const CHUNK_TARGET = 1000;
const CHUNK_OVERLAP = 150;
const EMBED_BATCH = 100;
const OCR_MIN_CHARS = 20;
// Hard limits — enforced together with client-side (30 MB) and bucket
// (31,457,280 bytes) caps. Anything larger is rejected up front so we
// don't spend embedding budget on files that can't finish reliably.
const MAX_PDF_PAGES = 1500;
// Cap OCR work on huge PDFs: we only OCR the first N low-text pages.
// Beyond that we accept degraded coverage rather than blowing the function
// timeout or AI Gateway request-size budget.
const OCR_MAX_PAGES = 50;

type PageText = { page: number; text: string; source: "pdf_text" | "ocr" };
type Chunk = {
  content: string;
  page_start: number;
  page_end: number;
  source_type: "pdf_text" | "ocr";
};

async function extractPdfPages(bytes: Uint8Array): Promise<PageText[]> {
  // unpdf wraps pdfjs for serverless/Deno — no worker setup required.
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  const perPage = Array.isArray(text) ? text : [text];
  return perPage.map((raw, idx) => ({
    page: idx + 1,
    text: (raw ?? "").replace(/\s+/g, " ").trim(),
    source: "pdf_text" as const,
  }));
}


async function ocrPage(
  pdfBase64: string,
  pageNumber: number,
  apiKey: string,
): Promise<string> {
  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OCR_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are an OCR engine. Transcribe the readable text on the specified PDF page verbatim. Preserve paragraph breaks. Do not summarize, explain, or add commentary. If a page is blank, return an empty string.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Transcribe page ${pageNumber} of the attached PDF verbatim.`,
              },
              {
                type: "file",
                file: {
                  filename: "document.pdf",
                  file_data: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
            ],
          },
        ],
      }),
    },
  );
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OCR failed [${resp.status}]: ${body.slice(0, 300)}`);
  }
  const data = await resp.json();
  return (data.choices?.[0]?.message?.content ?? "").toString().trim();
}

function chunkPages(pages: PageText[]): Chunk[] {
  // Build a running string with page markers so we can attribute chunks to
  // page ranges. Split on paragraph then sentence boundaries.
  const chunks: Chunk[] = [];
  // Concatenate all pages preserving order and mapping char offset -> page.
  let combined = "";
  const offsets: { end: number; page: number; source: "pdf_text" | "ocr" }[] = [];
  for (const p of pages) {
    if (!p.text) continue;
    const withSep = (combined.length ? "\n\n" : "") + p.text;
    combined += withSep;
    offsets.push({ end: combined.length, page: p.page, source: p.source });
  }
  if (!combined.trim()) return chunks;

  const pageAt = (charIdx: number) => {
    for (const o of offsets) if (charIdx <= o.end) return o;
    return offsets[offsets.length - 1];
  };

  // Paragraph split, then re-pack up to CHUNK_TARGET with sentence-boundary
  // fallback and CHUNK_OVERLAP tail.
  const paragraphs = combined.split(/\n{2,}/g);
  let buf = "";
  let bufStart = 0;
  let cursor = 0;

  const flush = () => {
    const trimmed = buf.trim();
    if (!trimmed) return;
    const start = pageAt(bufStart);
    const end = pageAt(bufStart + buf.length);
    // If OCR contributed anywhere in the range, mark chunk as ocr.
    const source = offsets.some(
      (o, i) =>
        o.source === "ocr" &&
        (i === 0 ? 0 : offsets[i - 1].end) <= bufStart + buf.length &&
        o.end >= bufStart,
    )
      ? "ocr"
      : "pdf_text";
    chunks.push({
      content: trimmed,
      page_start: start.page,
      page_end: end.page,
      source_type: source,
    });
  };

  for (const para of paragraphs) {
    const paraStart = cursor;
    cursor += para.length + 2; // +2 for the "\n\n" separator we split on
    if (!para.trim()) continue;
    if (buf.length + para.length + 2 <= CHUNK_TARGET) {
      if (!buf) bufStart = paraStart;
      buf += (buf ? "\n\n" : "") + para;
      continue;
    }
    // Paragraph doesn't fit — flush buf, then split paragraph by sentences.
    flush();
    // Sentence split for the oversize paragraph.
    const sentences = para.match(/[^.!?]+[.!?]+|\S[\s\S]*$/g) ?? [para];
    buf = "";
    bufStart = paraStart;
    for (const s of sentences) {
      const sTrim = s.trim();
      if (!sTrim) continue;
      if (buf.length + sTrim.length + 1 <= CHUNK_TARGET) {
        buf += (buf ? " " : "") + sTrim;
      } else {
        flush();
        // Overlap: keep last CHUNK_OVERLAP chars of the flushed content.
        const overlap = buf.slice(Math.max(0, buf.length - CHUNK_OVERLAP));
        buf = overlap ? overlap + " " + sTrim : sTrim;
        bufStart = paraStart;
      }
    }
  }
  flush();
  return chunks;
}

async function embedBatch(
  texts: string[],
  apiKey: string,
): Promise<number[][]> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Embedding failed [${resp.status}]: ${body.slice(0, 300)}`);
  }
  const data = await resp.json();
  // deno-lint-ignore no-explicit-any
  return (data.data as any[])
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding as number[]);
}

// ---------- Lesson-plan JSON → chunks -------------------------------------

type LessonWeek = {
  week: number;
  topic: string;
  overview: string;
  is_exam_week: boolean;
  concepts: { name: string; brief?: string }[];
  resources: { type: string; title: string; description?: string; url?: string }[];
};

function normalizePlanJson(parsed: unknown): {
  weeks: LessonWeek[];
  overallOutcomes: string;
} {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null;

  let weeks: LessonWeek[] = [];
  let overallOutcomes = "";

  if (Array.isArray(parsed)) {
    // Legacy shape: [{ day, topic, description, resources:[{concept,title,action,type,url}] }]
    weeks = parsed.filter(isObj).map((d: any, idx: number) => {
      const week = Number(d.day ?? idx + 1) || idx + 1;
      const resources = Array.isArray(d.resources)
        ? (d.resources as any[]).filter(isObj).map((r) => ({
            type: String(r.type ?? "resource"),
            title: String(r.title ?? ""),
            description: r.action ? String(r.action) : r.description ? String(r.description) : undefined,
            url: r.url ? String(r.url) : undefined,
          }))
        : [];
      const conceptNames = Array.from(
        new Set(
          (Array.isArray(d.resources) ? (d.resources as any[]) : [])
            .map((r) => (isObj(r) && r.concept ? String(r.concept) : ""))
            .filter(Boolean),
        ),
      );
      return {
        week,
        topic: String(d.topic ?? d.week_name ?? `Week ${week}`),
        overview: String(d.description ?? ""),
        is_exam_week: Boolean(d.is_exam_week),
        concepts: conceptNames.map((name) => ({ name })),
        resources,
      };
    });
  } else if (isObj(parsed) && Array.isArray((parsed as any).weeks)) {
    if (typeof (parsed as any).overall_course_learning_outcomes === "string") {
      overallOutcomes = String((parsed as any).overall_course_learning_outcomes);
    }
    weeks = ((parsed as any).weeks as any[]).filter(isObj).map((w, idx) => {
      const week = Number(w.week ?? idx + 1) || idx + 1;
      return {
        week,
        topic: String(w.week_name || `Week ${week}`),
        overview: String(w.overview ?? ""),
        is_exam_week: Boolean(w.is_exam_week),
        concepts: Array.isArray(w.concepts)
          ? (w.concepts as any[]).filter(isObj).map((c) => ({
              name: String(c.name ?? ""),
              brief: c.brief_description ? String(c.brief_description) : undefined,
            }))
          : [],
        resources: Array.isArray(w.resources)
          ? (w.resources as any[]).filter(isObj).map((r) => ({
              type: String(r.type ?? "resource"),
              title: String(r.title ?? ""),
              description: r.description ? String(r.description) : undefined,
              url: r.url ? String(r.url) : undefined,
            }))
          : [],
      };
    });
  }

  return { weeks, overallOutcomes };
}

function renderWeekChunk(w: LessonWeek): string {
  const lines: string[] = [];
  lines.push(`Week ${w.week} — ${w.topic}${w.is_exam_week ? " (Exam Week)" : ""}`);
  if (w.overview) lines.push(`\nOverview: ${w.overview}`);
  if (w.concepts.length) {
    lines.push(`\nConcepts:`);
    for (const c of w.concepts) {
      lines.push(`- ${c.name}${c.brief ? ` — ${c.brief}` : ""}`);
    }
  }
  if (w.resources.length) {
    lines.push(`\nResources:`);
    for (const r of w.resources) {
      const parts = [r.type, r.title].filter(Boolean).join(" — ");
      const tail = r.description ? ` — ${r.description}` : "";
      const url = r.url ? ` (${r.url})` : "";
      lines.push(`- ${parts}${tail}${url}`);
    }
  }
  return lines.join("\n").trim();
}

async function buildLessonPlanChunks(
  admin: ReturnType<typeof createClient>,
  courseId: string,
  bytes: Uint8Array,
): Promise<Chunk[]> {
  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text);
  const { weeks, overallOutcomes } = normalizePlanJson(parsed);

  const { data: course } = await admin
    .from("courses")
    .select("name, course_code")
    .eq("id", courseId)
    .maybeSingle();

  const header: string[] = [];
  const title = [course?.course_code, course?.name].filter(Boolean).join(" — ");
  header.push(`Course Lesson Plan${title ? `: ${title}` : ""}`);
  if (overallOutcomes) header.push(`\nOverall Course Learning Outcomes:\n${overallOutcomes}`);
  if (weeks.length) {
    header.push(`\nWeek Index:`);
    for (const w of weeks) header.push(`- Week ${w.week}: ${w.topic}${w.is_exam_week ? " (Exam)" : ""}`);
  }

  const chunks: Chunk[] = [
    {
      content: header.join("\n").trim(),
      page_start: 0,
      page_end: 0,
      source_type: "pdf_text",
    },
  ];

  const MAX_WEEK_CHARS = 2000;
  for (const w of weeks) {
    const rendered = renderWeekChunk(w);
    if (rendered.length <= MAX_WEEK_CHARS) {
      chunks.push({
        content: rendered,
        page_start: w.week,
        page_end: w.week,
        source_type: "pdf_text",
      });
      continue;
    }
    // Overflow: split into ~MAX_WEEK_CHARS pieces on line boundaries.
    const lines = rendered.split("\n");
    let buf = "";
    for (const ln of lines) {
      if (buf.length + ln.length + 1 > MAX_WEEK_CHARS && buf) {
        chunks.push({
          content: buf.trim(),
          page_start: w.week,
          page_end: w.week,
          source_type: "pdf_text",
        });
        buf = "";
      }
      buf += (buf ? "\n" : "") + ln;
    }
    if (buf.trim()) {
      chunks.push({
        content: buf.trim(),
        page_start: w.week,
        page_end: w.week,
        source_type: "pdf_text",
      });
    }
  }

  return chunks;
}

// --------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const admin = createClient(supabaseUrl, serviceKey);

  let fileId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    fileId = body.file_id ?? null;
    if (!fileId) {
      return new Response(
        JSON.stringify({ error: "file_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!lovableKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { data: file, error: fileErr } = await admin
      .from("course_material_files")
      .select(
        "id, course_id, teacher_id, storage_path, file_name, folder_type, content_hash, rag_status, rag_indexed_at",
      )
      .eq("id", fileId)
      .maybeSingle();
    if (fileErr) throw fileErr;
    if (!file) throw new Error(`file_id ${fileId} not found`);

    const lowerName = file.file_name.toLowerCase();
    const isJsonPlan =
      lowerName.endsWith(".json") ||
      file.folder_type === "lesson-plan-published";

    if (!lowerName.endsWith(".pdf") && !isJsonPlan) {
      await admin
        .from("course_material_files")
        .update({ rag_status: "skipped", rag_error: null })
        .eq("id", fileId);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "unsupported file type" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Concurrency guard: if a previous run marked this row 'processing' and
    // successfully indexed within the last 60s, skip. If rag_indexed_at is
    // null (e.g. a stuck/failed prior run), allow retry.
    if (file.rag_status === "processing" && file.rag_indexed_at) {
      const ts = new Date(file.rag_indexed_at).getTime();
      if (Date.now() - ts < 60_000) {
        return new Response(
          JSON.stringify({ ok: true, skipped: true, reason: "in_progress" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }


    await admin
      .from("course_material_files")
      .update({ rag_status: "processing", rag_error: null })
      .eq("id", fileId);

    // Download the PDF.
    const { data: blob, error: dlErr } = await admin.storage
      .from("course-materials")
      .download(file.storage_path);
    if (dlErr || !blob) throw dlErr ?? new Error("download returned empty");
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // Content-hash short-circuit: if bytes match what we already indexed,
    // skip extraction/embedding entirely.
    const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
    const contentHash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (
      file.content_hash === contentHash &&
      file.rag_status === "indexed"
    ) {
      await admin
        .from("course_material_files")
        .update({ rag_indexed_at: new Date().toISOString(), rag_error: null })
        .eq("id", fileId);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "unchanged" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build chunks. JSON lesson plan → one chunk per week (plus header);
    // PDF → extract pages, OCR empty ones, then chunkPages().
    let chunks: Chunk[];
    if (isJsonPlan) {
      chunks = await buildLessonPlanChunks(admin, file.course_id, bytes);
    } else {
      const pages = await extractPdfPages(bytes);

      // OCR fallback for empty pages.
      const emptyPageNums = pages
        .filter((p) => p.text.replace(/\s+/g, "").length < OCR_MIN_CHARS)
        .map((p) => p.page);
      if (emptyPageNums.length > 0) {
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const b64 = btoa(bin);
        for (const pageNum of emptyPageNums) {
          try {
            const text = await ocrPage(b64, pageNum, lovableKey);
            const idx = pages.findIndex((p) => p.page === pageNum);
            if (idx >= 0 && text) {
              pages[idx] = { page: pageNum, text, source: "ocr" };
            }
          } catch (e) {
            console.warn(`[ingest-rag] OCR page ${pageNum} failed:`, e);
          }
        }
      }
      chunks = chunkPages(pages);
    }

    if (chunks.length === 0) {
      await admin
        .from("course_material_files")
        .update({
          rag_status: "indexed",
          rag_indexed_at: new Date().toISOString(),
          rag_error: null,
          content_hash: contentHash,
        })
        .eq("id", fileId);
      return new Response(
        JSON.stringify({ ok: true, chunks: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Embed in batches.
    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const slice = chunks.slice(i, i + EMBED_BATCH).map((c) => c.content);
      const vecs = await embedBatch(slice, lovableKey);
      embeddings.push(...vecs);
    }

    // Replace existing chunks for this file.
    await admin.from("rag_chunks").delete().eq("file_id", file.id);

    const rows = chunks.map((c, i) => ({
      course_id: file.course_id,
      file_id: file.id,
      storage_path: file.storage_path,
      file_name: file.file_name,
      folder_type: file.folder_type,
      chunk_index: i,
      page_start: c.page_start,
      page_end: c.page_end,
      content: c.content,
      token_count: Math.round(c.content.length / 4),
      source_type: c.source_type,
      embedding: embeddings[i] as unknown as string,
      model_version: EMBED_MODEL_VERSION,
    }));

    // Insert in modest batches to keep payloads sane.
    const INSERT_BATCH = 50;
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const { error } = await admin
        .from("rag_chunks")
        .insert(rows.slice(i, i + INSERT_BATCH));
      if (error) throw error;
    }

    await admin
      .from("course_material_files")
      .update({
        rag_status: "indexed",
        rag_indexed_at: new Date().toISOString(),
        rag_error: null,
        content_hash: contentHash,
      })
      .eq("id", fileId);

    return new Response(
      JSON.stringify({ ok: true, chunks: chunks.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    // Handle Error, Supabase PostgrestError (plain object), or unknown.
    const anyE = e as { message?: string; error_description?: string; hint?: string; details?: string; code?: string };
    let msg: string;
    if (e instanceof Error) msg = e.message;
    else if (anyE?.message) msg = anyE.message + (anyE.details ? ` (${anyE.details})` : "") + (anyE.code ? ` [${anyE.code}]` : "");
    else if (anyE?.error_description) msg = anyE.error_description;
    else {
      try { msg = JSON.stringify(e); } catch { msg = String(e); }
    }
    console.error("ingest-rag-document error:", msg);

    if (fileId) {
      await admin
        .from("course_material_files")
        .update({ rag_status: "failed", rag_error: msg.slice(0, 500) })
        .eq("id", fileId);
    }
    return new Response(
      JSON.stringify({ error: msg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
