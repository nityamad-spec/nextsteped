import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  ResourceCompany,
  ResourceCompensation,
  ResourceFileRow,
  ResourceKind,
  ResourceLinkRow,
} from "@/lib/courseResources";

const toCompany = (row: any): ResourceCompany => ({
  id: row.id,
  name: row.name ?? "",
  description: row.description ?? null,
  tier: (row.tier ?? "mid_tier") as ResourceCompany["tier"],
  roles: Array.isArray(row.roles) ? row.roles : [],
  pay_range: row.pay_range ?? null,
  interview_format: row.interview_format ?? null,
  focus_areas: row.focus_areas ?? null,
  dsa_difficulty: row.dsa_difficulty ?? null,
  locations: row.locations ?? null,
  apply_url: row.apply_url ?? null,
  logo_color: row.logo_color ?? null,
  position: row.position ?? 0,
});

const toCompensation = (row: any): ResourceCompensation => ({
  id: row.id,
  role_title: row.role_title ?? "",
  base_range: row.base_range ?? null,
  bonus_range: row.bonus_range ?? null,
  equity_range: row.equity_range ?? null,
  total_range: row.total_range ?? null,
  notes: row.notes ?? null,
  position: row.position ?? 0,
});

async function fetchLibrary() {
  const [companiesRes, compensationRes, linksRes, filesRes] = await Promise.all([
    supabase.from("resource_companies").select("*").order("position", { ascending: true }),
    supabase.from("resource_compensation").select("*").order("position", { ascending: true }),
    supabase.from("resource_links").select("*"),
    supabase.from("resource_files").select("*"),
  ]);
  return {
    companies: (companiesRes.data ?? []).map(toCompany),
    compensation: (compensationRes.data ?? []).map(toCompensation),
    links: (linksRes.data ?? []) as ResourceLinkRow[],
    files: (filesRes.data ?? []) as ResourceFileRow[],
  };
}

/** Full global library — used by the professor picker and the admin manager. */
export function useResourceLibrary() {
  const [companies, setCompanies] = useState<ResourceCompany[]>([]);
  const [compensation, setCompensation] = useState<ResourceCompensation[]>([]);
  const [links, setLinks] = useState<ResourceLinkRow[]>([]);
  const [files, setFiles] = useState<ResourceFileRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const lib = await fetchLibrary();
    setCompanies(lib.companies);
    setCompensation(lib.compensation);
    setLinks(lib.links);
    setFiles(lib.files);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { companies, compensation, links, files, loading, refetch };
}

/** Resources a professor picked for a course — used by the student page. */
export function useCourseResources(courseId: string | null) {
  const [companies, setCompanies] = useState<ResourceCompany[]>([]);
  const [compensation, setCompensation] = useState<ResourceCompensation[]>([]);
  const [links, setLinks] = useState<ResourceLinkRow[]>([]);
  const [files, setFiles] = useState<ResourceFileRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!courseId) {
      setCompanies([]);
      setCompensation([]);
      setLinks([]);
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: picks } = await supabase
      .from("course_resource_picks")
      .select("resource_type, resource_id")
      .eq("course_id", courseId);

    const idsFor = (kind: ResourceKind) =>
      (picks ?? []).filter((p: any) => p.resource_type === kind).map((p: any) => p.resource_id);

    const companyIds = idsFor("company");
    const compensationIds = idsFor("compensation");
    const allIds = [...companyIds, ...compensationIds];

    const [companiesRes, compensationRes, linksRes, filesRes] = await Promise.all([
      companyIds.length
        ? supabase.from("resource_companies").select("*").in("id", companyIds).order("position", { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      compensationIds.length
        ? supabase.from("resource_compensation").select("*").in("id", compensationIds).order("position", { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      allIds.length
        ? supabase.from("resource_links").select("*").in("resource_id", allIds)
        : Promise.resolve({ data: [] as any[] }),
      allIds.length
        ? supabase.from("resource_files").select("*").in("resource_id", allIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    setCompanies((companiesRes.data ?? []).map(toCompany));
    setCompensation((compensationRes.data ?? []).map(toCompensation));
    setLinks((linksRes.data ?? []) as ResourceLinkRow[]);
    setFiles((filesRes.data ?? []) as ResourceFileRow[]);
    setLoading(false);
  }, [courseId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    companies,
    compensation,
    links,
    files,
    loading,
    isEmpty: !loading && companies.length === 0 && compensation.length === 0,
    refetch,
  };
}
