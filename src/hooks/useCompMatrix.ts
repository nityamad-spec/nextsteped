import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CompCell, CompRefreshRun, CompRole, CompTier } from "@/lib/compMatrix";

export function useCompMatrix() {
  const [roles, setRoles] = useState<CompRole[]>([]);
  const [tiers, setTiers] = useState<CompTier[]>([]);
  const [cells, setCells] = useState<CompCell[]>([]);
  const [lastRun, setLastRun] = useState<CompRefreshRun | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const [rolesRes, tiersRes, cellsRes, runRes] = await Promise.all([
      supabase.from("comp_roles").select("*").eq("active", true).order("position", { ascending: true }),
      supabase.from("comp_tiers").select("*").order("position", { ascending: true }),
      supabase.from("comp_cells").select("*"),
      supabase
        .from("comp_refresh_runs")
        .select("*")
        .eq("status", "success")
        .order("started_at", { ascending: false })
        .limit(1),
    ]);
    setRoles((rolesRes.data ?? []) as CompRole[]);
    setTiers((tiersRes.data ?? []) as CompTier[]);
    setCells((cellsRes.data ?? []) as CompCell[]);
    setLastRun(((runRes.data ?? [])[0] ?? null) as CompRefreshRun | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    roles,
    tiers,
    cells,
    lastRun,
    loading,
    isEmpty: !loading && (roles.length === 0 || tiers.length === 0),
    refetch,
  };
}
