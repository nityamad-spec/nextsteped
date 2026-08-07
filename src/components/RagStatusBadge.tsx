import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RagStatus } from "@/hooks/useRagStatus";

interface Props {
  status: RagStatus;
  /** If true, treats an unknown status as "Indexing…" for freshly uploaded
   *  PDFs where the ingest row hasn't landed yet. */
  assumeInFlight?: boolean;
  /** Pages indexed so far (large PDFs index across several passes). */
  pageCursor?: number | null;
  /** Total pages in the document, once known. */
  totalPages?: number | null;
}

/**
 * Small badge summarizing RAG ingestion state for a course material file.
 * Shared by ContentLibrary and the setup-page FileUploadZone.
 */
export default function RagStatusBadge({
  status,
  assumeInFlight,
  pageCursor,
  totalPages,
}: Props) {
  const effective: RagStatus =
    status ?? (assumeInFlight ? "processing" : null);

  if (effective === "processing" || effective === "pending") {
    const showProgress =
      typeof totalPages === "number" &&
      totalPages > 0 &&
      typeof pageCursor === "number" &&
      pageCursor > 0;
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        {showProgress
          ? `Indexing… ${pageCursor}/${totalPages} pages`
          : "Indexing…"}
      </Badge>
    );
  }

  if (effective === "indexed") {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-emerald-600 border-emerald-200"
      >
        <CheckCircle2 className="h-3 w-3" /> Indexed
      </Badge>
    );
  }
  if (effective === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> Failed
      </Badge>
    );
  }
  if (effective === "skipped") {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        Skipped
      </Badge>
    );
  }
  return null;
}
