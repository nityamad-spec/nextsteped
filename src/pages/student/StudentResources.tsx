import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  ExternalLink,
  FileText,
  IndianRupee,
  Loader2,
  MapPin,
  Star,
  StarHalf,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useEnrolledCourseId } from "@/hooks/useEnrolledCourseId";
import { useCourseType } from "@/hooks/useCourseType";
import { useCourseResources } from "@/hooks/useCourseResources";
import { useCompMatrix } from "@/hooks/useCompMatrix";
import CompensationMatrix from "@/components/student/CompensationMatrix";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  TIER_FILTERS,
  TIER_LABELS,
  difficultyLabel,
  tierBadgeClass,
  type ResourceCompany,
  type ResourceFileRow,
  type ResourceLinkRow,
  type ResourceTier,
} from "@/lib/courseResources";

/** Half-star rating row for the 1–4 DSA difficulty scale. */
function DifficultyStars({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-400">
      {Array.from({ length: 4 }, (_, i) => {
        if (i < full) return <Star key={i} className="h-4 w-4 fill-current" />;
        if (i === full && half) return <StarHalf key={i} className="h-4 w-4 fill-current" />;
        return <Star key={i} className="h-4 w-4 opacity-25" />;
      })}
    </span>
  );
}

const StudentResources = () => {
  const courseId = useEnrolledCourseId();
  const { ready: typeReady, isEmployment } = useCourseType(courseId);
  const { companies, compensation, links, files, loading, isEmpty } = useCourseResources(courseId);
  const {
    roles: compRoles,
    tiers: compTiers,
    cells: compCells,
    lastRun: compLastRun,
    loading: compLoading,
  } = useCompMatrix();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<ResourceTier | "all">("all");

  const section = searchParams.get("section"); // null | "companies" | "compensation"
  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  // Reset the open company when leaving the companies section.
  useEffect(() => {
    if (section !== "companies") setSelectedCompanyId(null);
  }, [section]);

  if (!courseId || !typeReady) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  // Resources is skilling-pathway only.
  if (!isEmployment) return <Navigate to="/student/home" replace />;

  const openSection = (key: "companies" | "compensation") =>
    setSearchParams({ section: key });
  const backToOverview = () => setSearchParams({});

  const linksFor = (id: string): ResourceLinkRow[] => links.filter((l) => l.resource_id === id);
  const filesFor = (id: string): ResourceFileRow[] => files.filter((f) => f.resource_id === id);

  const downloadFile = async (file: ResourceFileRow) => {
    const { data, error } = await supabase.storage
      .from("course-materials")
      .download(file.storage_path);
    if (error || !data) {
      toast({ title: "Could not download file", description: error?.message, variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderAttachments = (resourceId: string) => {
    const ls = linksFor(resourceId);
    const fs = filesFor(resourceId);
    if (ls.length === 0 && fs.length === 0) return null;
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">Links & files</p>
        <div className="flex flex-wrap gap-2">
          {ls.map((l) => (
            <Button key={l.id} variant="outline" size="sm" className="gap-2" asChild>
              <a href={l.url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> {l.label}
              </a>
            </Button>
          ))}
          {fs.map((f) => (
            <Button
              key={f.id}
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void downloadFile(f)}
            >
              <FileText className="h-3.5 w-3.5" /> {f.file_name}
            </Button>
          ))}
        </div>
      </div>
    );
  };

  /* ---------------- Overview ---------------- */
  if (!section) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Resources</h1>
          <p className="mt-1 text-muted-foreground">
            We've put together information on companies you can explore, plus insight into
            compensation for the roles you may be interested in.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading resources…
          </div>
        ) : isEmpty ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="font-medium">No resources added yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your professor hasn't picked any resources for this course yet. Check back soon.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {companies.length > 0 && (
              <button
                onClick={() => openSection("companies")}
                className="group rounded-xl border bg-card p-6 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold">Companies</p>
                      <p className="text-sm text-muted-foreground">
                        {companies.length} {companies.length === 1 ? "company" : "companies"} to
                        explore and target
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            )}
            {compensation.length > 0 && (
              <button
                onClick={() => openSection("compensation")}
                className="group rounded-xl border bg-card p-6 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <IndianRupee className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold">Compensation</p>
                      <p className="text-sm text-muted-foreground">
                        What pay looks like for {compensation.length}{" "}
                        {compensation.length === 1 ? "role" : "roles"}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ---------------- Companies ---------------- */
  if (section === "companies") {
    if (selectedCompany) {
      const c = selectedCompany;
      return (
        <div className="p-6 md:p-8 space-y-6">
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => setSelectedCompanyId(null)}>
            <ArrowLeft className="h-4 w-4" /> All companies
          </Button>

          <div className="flex items-start gap-4">
            <span
              className={`flex h-14 w-14 flex-none items-center justify-center rounded-xl text-xl font-bold text-white ${c.logo_color ?? "bg-primary"}`}
            >
              {c.name.charAt(0)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-2xl font-bold">{c.name}</h1>
                <Badge variant="outline" className={tierBadgeClass(c.tier)}>
                  {TIER_LABELS[c.tier]}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {c.roles.map((r) => (
                  <Badge key={r} variant="secondary" className="text-[10px]">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">About</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {c.description || "No description yet."}
                </p>
                {c.locations && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" /> {c.locations}
                  </p>
                )}
                {c.apply_url && (
                  <Button size="sm" className="gap-2" asChild>
                    <a href={c.apply_url} target="_blank" rel="noreferrer">
                      Careers page <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Interview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {c.dsa_difficulty !== null && (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span className="font-medium">DSA difficulty</span>
                    <span className="flex items-center gap-2">
                      <DifficultyStars value={c.dsa_difficulty} />
                      <span className="text-xs text-muted-foreground">
                        {c.dsa_difficulty}/4 · {difficultyLabel(c.dsa_difficulty)}
                      </span>
                    </span>
                  </div>
                )}
                {c.interview_format && (
                  <div>
                    <p className="font-medium">Typical interview pattern</p>
                    <p className="mt-0.5 text-muted-foreground">{c.interview_format}</p>
                  </div>
                )}
                {c.focus_areas && (
                  <div>
                    <p className="font-medium">What they focus on</p>
                    <p className="mt-0.5 text-muted-foreground">{c.focus_areas}</p>
                  </div>
                )}
                {c.pay_range && (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span className="font-medium">Pay range</span>
                    <span className="font-semibold">{c.pay_range}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {renderAttachments(c.id)}
        </div>
      );
    }

    const filtered =
      tierFilter === "all" ? companies : companies.filter((c) => c.tier === tierFilter);
    return (
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-2" onClick={backToOverview}>
            <ArrowLeft className="h-4 w-4" /> Resources
          </Button>
          <h1 className="font-heading text-2xl font-bold">Companies</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          {TIER_FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={tierFilter === f.key ? "default" : "outline"}
              onClick={() => setTierFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No companies in this tier yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCompanyId(c.id)}
                className="group rounded-xl bg-foreground p-5 text-left text-background transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold text-white ${c.logo_color ?? "bg-primary"}`}
                  >
                    {c.name.charAt(0)}
                  </span>
                  <Badge variant="outline" className={tierBadgeClass(c.tier)}>
                    {TIER_LABELS[c.tier]}
                  </Badge>
                </div>
                <p className="mt-3 font-semibold">{c.name}</p>
                {c.pay_range && <p className="mt-0.5 text-sm opacity-80">{c.pay_range}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.roles.slice(0, 4).map((r) => (
                    <span
                      key={r}
                      className="rounded-full border border-background/25 px-2 py-0.5 text-[10px] uppercase tracking-wide opacity-80"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ---------------- Compensation ---------------- */
  if (section === "compensation") {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-2" onClick={backToOverview}>
            <ArrowLeft className="h-4 w-4" /> Resources
          </Button>
          <h1 className="font-heading text-2xl font-bold">Compensation</h1>
        </div>

        <CompensationMatrix
          roles={compRoles}
          tiers={compTiers}
          cells={compCells}
          lastRun={compLastRun}
          loading={compLoading}
        />
      </div>
    );
  }

  return <Navigate to="/student/resources" replace />;
};

export default StudentResources;
