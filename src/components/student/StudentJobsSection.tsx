import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, IndianRupee, Loader2, MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { TIER_LABEL, type JobTier } from "@/lib/jobCoverage";

type Job = {
  id: string; title: string; company: string; location: string; is_remote: boolean;
  package: string | null; apply_url: string; tier: JobTier; skills: { skill: string; level: string }[]; last_seen_at: string;
};

const TIER_STYLE: Record<JobTier, string> = {
  accessible: "border-primary/40 bg-primary/5 text-primary",
  moderate: "border-warning/40 bg-warning/5 text-warning",
  competitive: "border-destructive/40 bg-destructive/5 text-destructive",
};
const TIER_HINT: Record<JobTier, string> = {
  accessible: "Fresher-friendly, high-volume hiring",
  moderate: "Typical entry-level bar",
  competitive: "Large applicant pools or a high bar",
};

/** Live entry-level jobs the professor refreshed for this course. Read-only. */
const StudentJobsSection = ({ courseId, onBack }: { courseId: string; onBack: () => void }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<JobTier | "all">("all");

  useEffect(() => {
    let alive = true;
    void supabase.from("course_jobs")
      .select("id, title, company, location, is_remote, package, apply_url, tier, skills, last_seen_at")
      .eq("course_id", courseId).order("first_seen_at", { ascending: false })
      .then(({ data }) => {
        if (!alive) return;
        setJobs(((data ?? []) as any[]).map((j) => ({ ...j, skills: Array.isArray(j.skills) ? j.skills : [] })));
        setLoading(false);
      });
    return () => { alive = false; };
  }, [courseId]);

  const shown = useMemo(() => (filter === "all" ? jobs : jobs.filter((j) => j.tier === filter)), [jobs, filter]);
  const updated = jobs.reduce<string | null>((a, j) => (!a || j.last_seen_at > a ? j.last_seen_at : a), null);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <Button variant="ghost" size="sm" className="gap-2" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Resources</Button>
      <div>
        <h1 className="font-heading text-3xl font-bold">Jobs</h1>
        <p className="mt-1 text-muted-foreground">
          Entry-level openings for your target role in India or remote and open to India, picked by your professor.
          {updated && ` Updated ${formatDistanceToNow(new Date(updated), { addSuffix: true })}.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "accessible", "moderate", "competitive"] as const).map((t) => (
          <Button key={t} size="sm" variant={filter === t ? "default" : "outline"} onClick={() => setFilter(t)}>
            {t === "all" ? `All (${jobs.length})` : `${TIER_LABEL[t]} (${jobs.filter((j) => j.tier === t).length})`}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading jobs…</div>
      ) : shown.length === 0 ? (
        <Card><CardContent className="py-10 text-center">
          <p className="font-medium">No jobs yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Your professor hasn't shared openings for this course yet. Check back soon.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((j) => (
            <Card key={j.id}>
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">{j.title}</p>
                    <p className="text-sm text-muted-foreground">{j.company || "Company not listed"}</p>
                  </div>
                  <Badge variant="outline" className={TIER_STYLE[j.tier]} title={TIER_HINT[j.tier]}>{TIER_LABEL[j.tier]}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{j.location || (j.is_remote ? "Remote" : "Location not listed")}</span>
                  <span className="inline-flex items-center gap-1"><IndianRupee className="h-3.5 w-3.5" />{j.package || "Package not listed"}</span>
                </div>
                {j.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {j.skills.slice(0, 6).map((s) => <Badge key={s.skill} variant="secondary" className="font-normal">{s.skill}</Badge>)}
                  </div>
                )}
                <div className="mt-auto pt-1">
                  <Button size="sm" className="gap-2" asChild>
                    <a href={j.apply_url} target="_blank" rel="noreferrer">Apply <ExternalLink className="h-3.5 w-3.5" /></a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentJobsSection;
