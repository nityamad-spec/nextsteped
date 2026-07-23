import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RagStatus =
  | "pending"
  | "processing"
  | "indexed"
  | "failed"
  | "skipped"
  | null;

export interface RagStatusEntry {
  status: RagStatus;
  error: string | null;
}

const IN_FLIGHT: RagStatus[] = ["pending", "processing", null];

/**
 * Poll `course_material_files.rag_status` for the given storage paths.
 * Polling only runs while at least one file is still in-flight
 * (pending/processing/unknown). Returns a map path -> {status, error}.
 */
export function useRagStatus(
  storagePaths: string[],
  opts?: { intervalMs?: number; enabled?: boolean },
): Record<string, RagStatusEntry> {
  const [map, setMap] = useState<Record<string, RagStatusEntry>>({});
  const enabled = opts?.enabled ?? true;
  const intervalMs = opts?.intervalMs ?? 3000;
  const key = storagePaths.slice().sort().join("|");

  useEffect(() => {
    if (!enabled || storagePaths.length === 0) return;
    let cancelled = false;

    const fetchOnce = async () => {
      const { data, error } = await supabase
        .from("course_material_files")
        .select("storage_path, rag_status, rag_error")
        .in("storage_path", storagePaths);
      if (cancelled || error || !data) return;
      const next: Record<string, RagStatusEntry> = {};
      for (const row of data) {
        next[row.storage_path] = {
          status: (row.rag_status ?? null) as RagStatus,
          error: (row.rag_error ?? null) as string | null,
        };
      }
      // Preserve any paths not yet in DB as unknown/null.
      for (const p of storagePaths) {
        if (!next[p]) next[p] = { status: null, error: null };
      }
      setMap(next);
    };

    void fetchOnce();
    const id = setInterval(() => {
      // Stop polling if nothing is in flight anymore.
      const inFlight = storagePaths.some((p) => {
        const s = map[p]?.status ?? null;
        return IN_FLIGHT.includes(s);
      });
      if (!inFlight && Object.keys(map).length > 0) {
        // Still re-poll occasionally to catch late updates for freshly
        // added rows we haven't seen yet.
        const anyMissing = storagePaths.some((p) => !(p in map));
        if (!anyMissing) return;
      }
      void fetchOnce();
    }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, intervalMs]);

  return map;
}

export function isRagInFlight(status: RagStatus): boolean {
  return status === "pending" || status === "processing" || status === null;
}
