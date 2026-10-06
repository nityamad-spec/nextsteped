import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Briefcase, ChevronDown, ChevronRight, ExternalLink, KeyRound, Loader2, RefreshCw, Sparkles, Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SetupModuleNav from "@/components/SetupModuleNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { toast } from "@/hooks/use-toast";
import { extractFunctionError } from "@/lib/extractFunctionError";
import { markStepCompleted } from "@/lib/setupProgress";
import { computeCoverage, TIER_LABEL, type CoverageJob, type SkillLevel } from "@/lib/jobCoverage";

type Source = { id: string; name: string; url: string; source_type: "api" | "feed" | "careers"; active: boolean; has_key: boolean };
type Refresh = { status: string; started_at: string; finished_at: string | null; error: string | null };
type ConceptRow = { id: string; concept_code: string };
type Tag = { concept_id: string; skill: string; level: SkillLevel };

const TYPE_LABEL: Record<Source["source_type"], string> = { api: "Job board API", feed: "RSS or JSON feed", careers: "Company careers page" };
const LEVELS: SkillLevel[] = ["basic", "working", "advanced"];
const COOLDOWN_S = 60;

const tierBadge = (t: string) =>
  t === "accessible" ? "border-primary/40 bg-primary/5 text-primary"
    : t === "competitive" ? "border-destructive/40 bg-destructive/5 text-destructive"
    : "border-warning/40 bg-warning/5 text-warning";

const JobsSetup = () => {
  const { user } = useAuth();
  const courseId = useTeacherCourseId();
  const [sources, setSources] = useState<Source[]>([]);
  const [jobs, setJobs] = useState<CoverageJob[]>([]);
  const [lastRun, setLastRun] = useState<Refresh | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [now, setNow] = useState(Date.now());

  // add form
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<Source["source_type"]>("api");
  const [apiKey, setApiKey] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!courseId) return;
    const [s, j, r, ok] = await Promise.all([
      supabase.from("course_job_sources").select("id, name, url, source_type, active, has_key").eq("course_id", courseId).order("created_at"),
      supabase.from("course_jobs").select("id, title, company, tier, skills").eq("course_id", courseId),
      supabase.from("course_job_refreshes").select("status, started_at, finished_at, error").eq("course_id", courseId).order("started_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("course_job_refreshes").select("finished_at").eq("course_id", courseId).eq("status", "succeeded").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setSources((s.data ?? []) as Source[]);
    setJobs(((j.data ?? []) as any[]).map((x) => ({ ...x, skills: Array.isArray(x.skills) ? x.skills : [] })));
    setLastRun((r.data as Refresh) ?? null);
    setLastSuccess((ok.data as any)?.finished_at ?? null);
  }, [courseId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const cooldownLeft = lastRun ? Math.max(0, COOLDOWN_S - Math.floor((now - new Date(lastRun.started_at).getTime()) / 1000)) : 0;
  const activeCount = sources.filter((s) => s.active).length;

  const refresh = async () => {
    if (!courseId) return;
    if (activeCount === 0) {
      toast({ title: "No active sources", description: "Turn on at least one job source first.", variant: "destructive" });
      return;
    }
    setRefreshing(true);
    setProgress(5);
    const tick = setInterval(() => setProgress((p) => Math.min(92, p + 3)), 1000);
    const { data, error } = await supabase.functions.invoke("refresh-course-jobs", { body: { course_id: courseId } });
    clearInterval(tick);
    setProgress(100);
    if (error) {
      toast({ title: "Refresh failed", description: await extractFunctionError(error, "Refresh failed"), variant: "destructive" });
    } else {
      const d = data as any;
      toast({
        title: "Jobs refreshed",
        description: `${d.live} jobs live · ${d.added} new · ${d.removed} removed${d.warnings?.length ? ` · ${d.warnings.length} source(s) could not be reached` : ""}.`,
      });
      if (user) void markStepCompleted(user.id, "jobs", courseId, { source: "JobsSetup.refresh" });
    }
    await load();
    setRefreshing(false);
    setProgress(0);
  };

  const addSource = async () => {
    setUrlError(null);
    const raw = url.trim();
    let parsed: URL | null = null;
    try { parsed = new URL(raw); } catch { /* invalid */ }
    if (!parsed) return setUrlError("Enter a valid link.");
    if (parsed.protocol !== "https:") return setUrlError("Only https links are allowed.");
    if (sources.some((s) => s.url === parsed!.toString())) return setUrlError("This source is already added.");
    setAdding(true);
    const { error } = await supabase.functions.invoke("manage-job-sources", {
      body: { action: "add", course_id: courseId, url: raw, name: name.trim() || null, source_type: type, api_key: apiKey || null },
    });
    setAdding(false);
    if (error) return setUrlError(await extractFunctionError(error, "Could not add source"));
    setUrl(""); setName(""); setApiKey(""); setType("api");
    await load();
  };

  const removeSource = async (id: string) => {
    const { error } = await supabase.functions.invoke("manage-job-sources", { body: { action: "remove", course_id: courseId, source_id: id } });
    if (error) toast({ title: "Could not remove", description: await extractFunctionError(error), variant: "destructive" });
    await load();
  };

  const toggleSource = async (s: Source, active: boolean) => {
    setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, active } : x)));
    const { error } = await supabase.from("course_job_sources").update({ active }).eq("id", s.id);
    if (error) { toast({ title: "Could not update", description: error.message, variant: "destructive" }); void load(); }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-3xl font-bold">Jobs</h1>
            <Badge className="text-[10px]">New</Badge>
          </div>
          <p className="text-muted-foreground mt-1">Choose where jobs come from, check your curriculum against what employers ask for, and refresh what students see.</p>
          <p className="text-sm text-muted-foreground mt-2">
            {lastSuccess ? `Last refreshed ${formatDistanceToNow(new Date(lastSuccess), { addSuffix: true })}` : "Never refreshed"} · {jobs.length} jobs live for students
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" asChild>
            <a href="/student/resources?section=jobs" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> See student view</a>
          </Button>
          <Button className="gap-2" onClick={refresh} disabled={refreshing || cooldownLeft > 0 || !courseId}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {refreshing ? "Refreshing…" : cooldownLeft > 0 ? `Refresh in ${cooldownLeft}s` : "Refresh jobs"}
          </Button>
        </div>
      </div>

      {refreshing && (
        <Card><CardContent className="py-4 space-y-2">
          <p className="text-sm">Searching sources and checking each new listing. This can take up to a minute…</p>
          <Progress value={progress} />
        </CardContent></Card>
      )}
      {!refreshing && lastRun?.status === "failed" && lastRun.error && (
        <p className="text-sm text-destructive">Last refresh failed: {lastRun.error}</p>
      )}

      <Tabs defaultValue="sources">
        <TabsList>
          <TabsTrigger value="sources">Job sources</TabsTrigger>
          <TabsTrigger value="coverage">Curriculum coverage</TabsTrigger>
        </TabsList>

        <TabsContent value="sources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sources</CardTitle>
              <CardDescription>{activeCount} of {sources.length} sources active. Sources apply to this course only.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {sources.length === 0 && <p className="text-sm text-muted-foreground">No sources yet.</p>}
              {sources.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <Checkbox checked={s.active} onCheckedChange={(v) => void toggleSource(s, v === true)} aria-label={`Active: ${s.name}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.url}</p>
                  </div>
                  <Badge variant="outline">{TYPE_LABEL[s.source_type]}</Badge>
                  {s.has_key && <Badge variant="secondary" className="gap-1"><KeyRound className="h-3 w-3" /> Key saved</Badge>}
                  <Button variant="ghost" size="sm" className="gap-1 text-destructive" onClick={() => void removeSource(s.id)}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add a source</CardTitle>
              <CardDescription>Sources must allow automated access. API keys are stored securely and never shown again.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="src-url">Link *</Label>
                <Input id="src-url" placeholder="https://…" value={url} onChange={(e) => { setUrl(e.target.value); setUrlError(null); }} />
                {urlError && <p className="text-xs text-destructive">{urlError}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="src-name">Name (optional)</Label>
                <Input id="src-name" placeholder="Defaults to the site's domain" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as Source["source_type"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABEL) as Source["source_type"][]).map((k) => <SelectItem key={k} value={k}>{TYPE_LABEL[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="src-key">API key (optional)</Label>
                <Input id="src-key" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Button onClick={addSource} disabled={adding || !url.trim()} className="gap-2">
                  {adding && <Loader2 className="h-4 w-4 animate-spin" />} Add source
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coverage">
          {courseId && <CoveragePanel courseId={courseId} jobs={jobs} />}
        </TabsContent>
      </Tabs>

      <SetupModuleNav finishMode />
    </div>
  );
};

/* ---------------- Curriculum coverage ---------------- */

const CoveragePanel = ({ courseId, jobs }: { courseId: string; jobs: CoverageJob[] }) => {
  const [pulled, setPulled] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [concepts, setConcepts] = useState<ConceptRow[]>([]);
  const [weeks, setWeeks] = useState<{ week_number: number; week_name: string; concepts: any }[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState(false);
  const [openJobs, setOpenJobs] = useState<Set<string>>(new Set());

  const pull = async () => {
    setPulling(true);
    const [c, w, t] = await Promise.all([
      supabase.from("concepts").select("id, concept_code").eq("course_id", courseId).order("created_at"),
      supabase.from("lesson_plan_weeks").select("week_number, week_name, concepts").eq("course_id", courseId).order("week_number"),
      supabase.from("concept_skill_tags").select("concept_id, skill, level").eq("course_id", courseId),
    ]);
    setConcepts((c.data ?? []) as ConceptRow[]);
    setWeeks((w.data ?? []) as any[]);
    setTags((t.data ?? []) as Tag[]);
    setPulled(true);
    setPulling(false);
  };

  const suggest = async () => {
    setSuggesting(true);
    const { data, error } = await supabase.functions.invoke("suggest-concept-skills", { body: { course_id: courseId } });
    setSuggesting(false);
    if (error) return toast({ title: "Could not suggest tags", description: await extractFunctionError(error), variant: "destructive" });
    toast({ title: "Skill tags suggested", description: `${(data as any)?.added ?? 0} concepts tagged. Review and edit below.` });
    await pull();
  };

  const saveTag = async (conceptId: string, patch: Partial<Tag>) => {
    const cur = tags.find((t) => t.concept_id === conceptId);
    const next = { concept_id: conceptId, skill: patch.skill ?? cur?.skill ?? "", level: patch.level ?? cur?.level ?? "basic" } as Tag;
    setTags((prev) => [...prev.filter((t) => t.concept_id !== conceptId), next]);
    setChecked(false);
    if (!next.skill.trim()) {
      await supabase.from("concept_skill_tags").delete().eq("concept_id", conceptId);
      return;
    }
    const { error } = await supabase.from("concept_skill_tags").upsert({ ...next, skill: next.skill.trim(), course_id: courseId }, { onConflict: "concept_id" });
    if (error) toast({ title: "Could not save tag", description: error.message, variant: "destructive" });
  };

  const modules = useMemo(() => {
    const byName = new Map(concepts.map((c) => [c.concept_code.toLowerCase().trim(), c]));
    const used = new Set<string>();
    const mods = weeks.map((w) => {
      const list: ConceptRow[] = [];
      for (const item of Array.isArray(w.concepts) ? w.concepts : []) {
        const n = (typeof item === "string" ? item : item?.name ?? item?.concept ?? item?.title ?? "").toLowerCase().trim();
        const c = byName.get(n);
        if (c && !list.includes(c)) { list.push(c); used.add(c.id); }
      }
      return { key: `w${w.week_number}`, label: `Week ${w.week_number}: ${w.week_name}`, concepts: list };
    }).filter((m) => m.concepts.length);
    const rest = concepts.filter((c) => !used.has(c.id));
    if (rest.length) mods.push({ key: "other", label: "Not in a lesson-plan week", concepts: rest });
    return mods;
  }, [concepts, weeks]);

  const tagBy = new Map(tags.map((t) => [t.concept_id, t]));
  const untagged = concepts.filter((c) => !tagBy.get(c.id)?.skill).length;
  const skillCount = new Set(tags.filter((t) => t.skill).map((t) => t.skill.toLowerCase())).size;
  const result = useMemo(() => (checked ? computeCoverage(jobs, tags.filter((t) => t.skill)) : null), [checked, jobs, tags]);

  const toggle = (set: Set<string>, k: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set);
    n.has(k) ? n.delete(k) : n.add(k);
    fn(n);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Step 1 · Pull curriculum</CardTitle>
          <CardDescription>Load your modules and concepts with the skill and level each one teaches.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={pull} disabled={pulling} variant={pulled ? "outline" : "default"} className="gap-2">
            {pulling && <Loader2 className="h-4 w-4 animate-spin" />} {pulled ? "Pull again" : "Pull curriculum"}
          </Button>
          {pulled && (
            <>
              <div className="flex flex-wrap gap-6 text-sm">
                <span><strong>{modules.length}</strong> modules</span>
                <span><strong>{concepts.length}</strong> concepts</span>
                <span><strong>{skillCount}</strong> skills</span>
              </div>
              {untagged > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
                  <span>{untagged} concept{untagged === 1 ? " has" : "s have"} no skill tag yet. Let AI suggest a skill and level for each, then edit any you disagree with.</span>
                  <Button size="sm" onClick={suggest} disabled={suggesting} className="gap-2">
                    {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Suggest skill tags
                  </Button>
                </div>
              )}
              <div className="space-y-2">
                {modules.map((m) => (
                  <div key={m.key} className="rounded-lg border">
                    <button className="flex w-full items-center gap-2 p-3 text-left text-sm font-medium" onClick={() => toggle(open, m.key, setOpen)}>
                      {open.has(m.key) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {m.label}
                      <span className="ml-auto text-xs text-muted-foreground">{m.concepts.length} concepts</span>
                    </button>
                    {open.has(m.key) && (
                      <div className="space-y-2 border-t p-3">
                        {m.concepts.map((c) => {
                          const t = tagBy.get(c.id);
                          return (
                            <div key={c.id} className="grid items-center gap-2 sm:grid-cols-[1fr_200px_130px]">
                              <span className="text-sm">{c.concept_code}</span>
                              <Input
                                defaultValue={t?.skill ?? ""}
                                key={`${c.id}-${t?.skill ?? ""}`}
                                placeholder="Skill (e.g. SQL)"
                                className="h-8"
                                onBlur={(e) => { if (e.target.value !== (t?.skill ?? "")) void saveTag(c.id, { skill: e.target.value }); }}
                              />
                              <Select value={t?.level ?? "basic"} onValueChange={(v) => void saveTag(c.id, { level: v as SkillLevel })} disabled={!t?.skill}>
                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Step 2 · Check coverage</CardTitle>
          <CardDescription>Compare the skills your current jobs require against what the curriculum teaches.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Button onClick={() => setChecked(true)} disabled={!pulled} className="gap-2"><Briefcase className="h-4 w-4" /> Check coverage</Button>
          {result && result.total === 0 && <p className="text-sm text-muted-foreground">No jobs yet. Refresh jobs first.</p>}
          {result && result.total > 0 && (
            <>
              <div className="flex flex-wrap items-end gap-6">
                <div>
                  <p className="text-4xl font-bold">{result.overallPct}%</p>
                  <p className="text-sm text-muted-foreground">{result.fullyCovered} of {result.total} jobs fully covered</p>
                </div>
                <div className="grid flex-1 gap-2 sm:grid-cols-3">
                  {result.byTier.map((t) => (
                    <div key={t.tier} className={`rounded-lg border p-3 ${tierBadge(t.tier)}`}>
                      <p className="text-xs font-medium">{TIER_LABEL[t.tier]}</p>
                      <p className="text-xl font-semibold">{t.jobs ? `${t.pct}%` : "—"}</p>
                      <p className="text-xs opacity-80">{t.jobs} jobs</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Skills to add or deepen</p>
                {result.gaps.length === 0 ? <p className="text-sm text-muted-foreground">No gaps. Every required skill is covered.</p> : (
                  <ol className="space-y-1.5">
                    {result.gaps.map((g, i) => (
                      <li key={g.skill} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                        <span className="w-5 text-muted-foreground">{i + 1}.</span>
                        <span className="flex-1 font-medium">{g.skill}</span>
                        <Badge variant="outline" className={g.kind === "Not taught" ? "border-destructive/40 text-destructive" : "border-warning/40 text-warning"}>{g.kind}</Badge>
                        <span className="w-20 text-right text-xs text-muted-foreground">{g.jobs} job{g.jobs === 1 ? "" : "s"}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {result.covered.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold">Covered skills</p>
                  <div className="flex flex-wrap gap-1.5">{result.covered.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-semibold">Per-job breakdown</p>
                <div className="space-y-2">
                  {result.perJob.map((p) => (
                    <div key={p.job.id} className="rounded-lg border">
                      <button className="flex w-full items-center gap-2 p-3 text-left text-sm" onClick={() => toggle(openJobs, p.job.id, setOpenJobs)}>
                        {openJobs.has(p.job.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span className="font-medium">{p.job.title}</span>
                        <span className="text-muted-foreground">· {p.job.company}</span>
                        <Badge variant="outline" className={`ml-2 ${tierBadge(p.job.tier)}`}>{TIER_LABEL[p.job.tier]}</Badge>
                        <span className="ml-auto font-semibold">{Math.round(p.score * 100)}%</span>
                      </button>
                      {openJobs.has(p.job.id) && (
                        <div className="space-y-1 border-t p-3 text-sm">
                          {p.rows.length === 0 && <p className="text-muted-foreground">No skills listed.</p>}
                          {p.rows.map((r) => (
                            <div key={r.skill} className="flex items-center gap-2">
                              <span className="flex-1">{r.skill}</span>
                              <span className="text-xs text-muted-foreground capitalize">needs {r.required}{r.taught ? ` · taught ${r.taught}` : ""}</span>
                              <Badge variant="outline" className={r.status === "covered" ? "border-primary/40 text-primary" : r.status === "partial" ? "border-warning/40 text-warning" : "border-destructive/40 text-destructive"}>
                                {r.status === "covered" ? "Covered" : r.status === "partial" ? "Partly" : "Missing"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default JobsSetup;
