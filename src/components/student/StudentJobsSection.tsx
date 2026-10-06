import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, IndianRupee, Lightbulb, Loader2, MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { STUDENT_TIER, TIER_ORDER, type JobTier } from "@/lib/jobCoverage";
import { cn } from "@/lib/utils";

type Job = {
  id: string; title: string; company: string; location: string; is_remote: boolean;
  package: string | null; apply_url: string; tier: JobTier; skills: { skill: string; level: string }[]; last_seen_at: string;
};

const ACCENT: Record<JobTier, { text: string; bar: string; border: string; soft: string }> = {
  accessible: { text: "text-success", bar: "bg-success", border: "border-l-success", soft: "bg-success/10" },
  moderate: { text: "text-warning", bar: "bg-warning", border: "border-l-warning", soft: "bg-warning/10" },
  competitive: { text: "text-destructive", bar: "bg-destructive", border: "border-l-destructive", soft: "bg-destructive/10" },
};

const Meter = ({ tier }: { tier: JobTier }) => (
  <span className="inline-flex items-end gap-0.5" aria-hidden>
    {[1, 2, 3].map((i) => (
      <span key={i} className={cn("w-1 rounded-sm", i <= STUDENT_TIER[tier].bars ? ACCENT[tier].bar : "bg-muted-foreground/25")} style={{ height: 4 + i * 3 }} />
    ))}
  </span>
);

const JobCard = ({ j }: { j: Job }) => {
  const t = STUDENT_TIER[j.tier];
  const location = j.is_remote ? `Remote${j.location && !/remote/i.test(j.location) ? ` (${j.location})` : " (India)"}` : j.location || "Location not listed";
  return (
    <Card className={cn("border-l-4", ACCENT[j.tier].border)}>
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <span className={cn("inline-flex w-fit items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium", ACCENT[j.tier].soft, ACCENT[j.tier].text)}>
          <Meter tier={j.tier} /> {t.name} · {t.competition}
        </span>
        <div>
          <p className="font-semibold leading-tight">{j.title}</p>
          <p className="text-sm text-muted-foreground">{j.company || "Company not listed"}</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{location}</span>
          <span className="inline-flex items-center gap-1"><IndianRupee className="h-3.5 w-3.5" />{j.package || "Not disclosed"}</span>
        </div>
        {j.skills.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Skills they ask for</p>
            <div className="flex flex-wrap gap-1.5">
              {j.skills.map((s) => (
                <span key={s.skill} className="rounded-md border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{s.skill}, {s.level}</span>
              ))}
            </div>
          </div>
        )}
        <div className="mt-auto pt-1">
          <Button size="sm" className="gap-2" asChild>
            <a href={j.apply_url} target="_blank" rel="noopener noreferrer">View job and apply <ExternalLink className="h-3.5 w-3.5" /></a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

/** Live entry-level jobs the professor refreshed for this course. Read-only. */
const StudentJobsSection = ({ courseId, onBack }: { courseId: string; onBack: () => void }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<JobTier | "all">("all");

  useEffect(() => {
    let alive = true;
    void Promise.all([
      supabase.from("course_jobs")
        .select("id, title, company, location, is_remote, package, apply_url, tier, skills, last_seen_at")
        .eq("course_id", courseId).order("first_seen_at", { ascending: false }),
      supabase.from("courses").select("target_role").eq("id", courseId).maybeSingle(),
    ]).then(([j, c]) => {
      if (!alive) return;
      setJobs(((j.data ?? []) as any[]).map((x) => ({ ...x, skills: Array.isArray(x.skills) ? x.skills : [] })));
      setRole((c.data as any)?.target_role ?? null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [courseId]);

  const byTier = useMemo(() => {
    const m: Record<JobTier, Job[]> = { accessible: [], moderate: [], competitive: [] };
    jobs.forEach((j) => m[j.tier]?.push(j));
    return m;
  }, [jobs]);
  const updated = jobs.reduce<string | null>((a, j) => (!a || j.last_seen_at > a ? j.last_seen_at : a), null);
  const tiers = filter === "all" ? TIER_ORDER : [filter];

  return (
    <div className="space-y-6 p-4 md:p-8">
      <Button variant="ghost" size="sm" className="gap-2" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Resources</Button>
      <div>
        <h1 className="font-heading text-2xl font-bold md:text-3xl">{role ? `Jobs for your ${role} pathway` : "Jobs"}</h1>
        <p className="mt-1 text-muted-foreground">
          Entry-level roles in India, or remote roles open to candidates in India.
          {updated && ` Updated ${formatDistanceToNow(new Date(updated), { addSuffix: true })}.`}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading jobs…</div>
      ) : jobs.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Your professor hasn't set up jobs yet. Check back soon.</CardContent></Card>
      ) : (
        <>
          <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-foreground">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p>Not sure where to start? Begin with the <strong>Apply first</strong> jobs. They ask for the fewest skills and are the most open to freshers.</p>
          </div>

          <div>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
              {(["all", ...TIER_ORDER] as const).map((t) => (
                <Button key={t} size="sm" className="shrink-0 rounded-full" variant={filter === t ? "default" : "outline"} onClick={() => setFilter(t)}>
                  {t === "all" ? `All jobs (${jobs.length})` : `${STUDENT_TIER[t].name} (${byTier[t].length})`}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {filter === "all" ? "Sorted from the best first chance to the biggest stretch." : STUDENT_TIER[filter].desc}
            </p>
          </div>

          {tiers.map((t) => byTier[t].length === 0 ? (filter === "all" ? null : (
            <p key={t} className="text-sm text-muted-foreground">No {STUDENT_TIER[t].name} jobs right now.</p>
          )) : (
            <section key={t} className="space-y-3">
              {filter === "all" && (
                <div>
                  <h2 className={cn("flex flex-wrap items-center gap-2 font-heading text-lg font-semibold", ACCENT[t].text)}>
                    <Meter tier={t} /> {STUDENT_TIER[t].name}
                    <span className="text-sm font-normal text-muted-foreground">· {STUDENT_TIER[t].competition} · {byTier[t].length} {byTier[t].length === 1 ? "job" : "jobs"}</span>
                  </h2>
                  <p className="text-sm text-muted-foreground">{STUDENT_TIER[t].desc}</p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {byTier[t].map((j) => <JobCard key={j.id} j={j} />)}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
};

export default StudentJobsSection;
