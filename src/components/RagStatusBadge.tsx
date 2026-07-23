import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RagStatus } from "@/hooks/useRagStatus";

interface Props {
  status: RagStatus;
  /** If true, treats an unknown status as "Indexing…" for freshly uploaded
   *  PDFs where the ingest row hasn't landed yet. */
  assumeInFlight?: boolean;
}

/**
 * Small badge summarizing RAG ingestion state for a course material file.
 * Shared by ContentLibrary and the setup-page FileUploadZone.
 */
export default function RagStatusBadge({ status, assumeInFlight }: Props) {
  const effective: RagStatus =
    status ?? (assumeInFlight ? "processing" : null);

  if (effective === "processing" || effective === "pending") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Indexing…
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
