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

const ROUND_STYLES = [
  "border-career-round-1-border bg-career-round-1 text-career-round-1-foreground",
  "border-career-round-2-border bg-career-round-2 text-career-round-2-foreground",
  "border-career-round-3-border bg-career-round-3 text-career-round-3-foreground",
  "border-career-round-4-border bg-career-round-4 text-career-round-4-foreground",
] as const;

function roundStyle(index: number): string {
  return ROUND_STYLES[Math.min(index, ROUND_STYLES.length - 1)];
}

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

          {/* Header */}
          <Card className="overflow-hidden">
            <div className="h-1.5 w-full bg-primary" />
            <CardContent className="flex flex-wrap items-start justify-between gap-4 p-6">
              <div className="flex min-w-0 items-start gap-4">
                <span className="flex h-14 w-14 flex-none items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-xl font-bold text-primary">
                  {c.name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-heading text-2xl font-bold">{c.name}</h1>
                    <Badge variant="outline" className={tierBadgeClass(c.tier)}>
                      {TIER_LABELS[c.tier]}
                    </Badge>
                    {c.pay_range && (
                      <span className="text-sm font-semibold text-primary">{c.pay_range}</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.roles.map((r) => (
                      <span
                        key={r}
                        className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                  {c.locations && (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" /> {c.locations}
                    </p>
                  )}
                </div>
              </div>
              {c.apply_url && (
                <Button size="sm" className="gap-2" asChild>
                  <a href={c.apply_url} target="_blank" rel="noreferrer">
                    Careers page <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* About */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">About {c.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                {c.about || c.description || "No description yet."}
              </p>
              {c.focus_areas && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {c.focus_areas.split(",").map((f) => (
                    <span
                      key={f}
                      className="rounded-md border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {f.trim()}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Interview format */}
          {(c.interview_format || c.dsa_difficulty !== null) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Interview format</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {c.interview_format && (
                  <p className="rounded-lg border bg-muted/30 p-3 leading-relaxed">
                    {c.interview_format}
                  </p>
                )}
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
              </CardContent>
            </Card>
          )}

          {/* Rounds */}
          {c.rounds.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">The rounds you'll face</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-4">
                  {c.rounds.map((r, i) => (
                    <li key={i} className={`flex gap-4 rounded-lg border p-4 ${roundStyle(i)}`}>
                      <span
                        className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-current/20 bg-card/75 text-xs font-bold"
                      >
                        {i + 1}
                      </span>
                      <span className="pt-1 text-sm leading-relaxed">{r}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {/* What they look for */}
          {c.look_for && (
            <Card className="border-primary/25 bg-primary/[0.04]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">What they look for</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {c.look_for}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Pro tip */}
          {c.pro_tip && (
            <div className="rounded-lg border border-accent/40 bg-accent/10 p-5 text-foreground">
              <p className="text-sm font-semibold">Pro tip</p>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">{c.pro_tip}</p>
            </div>
          )}

          {renderAttachments(c.id)}

          {c.sources && (
            <p className="text-xs text-muted-foreground">Sources: {c.sources}</p>
          )}
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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCompanyId(c.id)}
                className="group flex min-h-64 flex-col rounded-lg border bg-card p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex min-h-12 items-start justify-between gap-6">
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-lg font-bold text-primary">
                    {c.name.charAt(0)}
                  </span>
                  <Badge variant="outline" className={`mt-1 flex-none ${tierBadgeClass(c.tier)}`}>
                    {TIER_LABELS[c.tier]}
                  </Badge>
                </div>
                <p className="mt-5 font-semibold">{c.name}</p>
                {c.pay_range && (
                  <p className="mt-1 text-sm font-medium text-primary">{c.pay_range}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {c.roles.slice(0, 4).map((r) => (
                    <span
                      key={r}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {r}
                    </span>
                  ))}
                </div>
                <span className="mt-auto flex items-center gap-1 pt-5 text-xs font-medium text-primary">
                  View interview guide
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
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
