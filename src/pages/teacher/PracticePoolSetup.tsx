// Setup step: "Practice Question Pool" (employment / upskilling pathway only).
// The professor pre-generates practice questions (non-coding or runnable
// coding tasks), reviews and approves them. Students' Practice sets are
// served from approved questions only (see serve-practice-set).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Sparkles, Trash2, Undo2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { useCourseType } from "@/hooks/useCourseType";
import { supabase } from "@/integrations/supabase/client";
import SetupModuleNav from "@/components/SetupModuleNav";
import { markStepCompleted, markStepOpened } from "@/lib/setupProgress";
import { planPoolBatches, type PoolKind } from "@/lib/practicePool";

type PoolRow = {
  id: string;
  kind: string;
  format: string;
  concept_code: string | null;
  week_number: number | null;
  bloom_level: number;
  difficulty: number;
  title: string | null;
  question: string;
  options: unknown;
  language: string | null;
  status: string;
  standard_test_cases: unknown;
};
type PrivRow = { question_id: string; answer: string | null; explanation: string | null; hidden_test_cases: unknown };

const COUNT_OPTIONS = [5, 10, 20, 30, 40];

const PracticePoolSetup = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const courseId = useTeacherCourseId();
  const { ready: typeReady, isEmployment } = useCourseType(courseId);

  const [weeks, setWeeks] = useState<{ week_number: number; week_name: string | null }[]>([]);
  const [selectedWeeks, setSelectedWeeks] = useState<Set<number>>(new Set());
  const [kind, setKind] = useState<PoolKind>("non_coding");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState("mixed");
  const [bloomLevel, setBloomLevel] = useState(3);
  const [language, setLanguage] = useState("python");
  const [rows, setRows] = useState<PoolRow[]>([]);
  const [privs, setPrivs] = useState<Record<string, PrivRow>>({});
  const [topups, setTopups] = useState(0);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [filter, setFilter] = useState<"all" | "draft" | "approved">("all");
  const [kindFilter, setKindFilter] = useState<"all" | PoolKind>("all");
  const [editing, setEditing] = useState<{ id: string; question: string; answer: string; explanation: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    const since = new Date(Date.now() - 14 * 864e5).toISOString();
    const [w, q, t] = await Promise.all([
      supabase.from("lesson_plan_weeks").select("week_number, week_name, is_exam_week").eq("course_id", courseId).order("week_number"),
      supabase
        .from("practice_pool_questions")
        .select("id, kind, format, concept_code, week_number, bloom_level, difficulty, title, question, options, language, status, standard_test_cases")
        .eq("course_id", courseId)
        .neq("status", "archived")
        .order("week_number")
        .order("created_at"),
      supabase.from("practice_pool_topups").select("id", { count: "exact", head: true }).eq("course_id", courseId).gte("created_at", since),
    ]);
    const wk = (w.data ?? []).filter((x) => !x.is_exam_week);
    setWeeks(wk);
    setSelectedWeeks((prev) => (prev.size ? prev : new Set(wk.map((x) => x.week_number))));
    const list = (q.data ?? []) as PoolRow[];
    setRows(list);
    setTopups(t.count ?? 0);
    if (list.length) {
      const { data: p } = await supabase
        .from("practice_pool_private")
        .select("question_id, answer, explanation, hidden_test_cases")
        .in("question_id", list.map((r) => r.id));
      setPrivs(Object.fromEntries((p ?? []).map((r) => [r.question_id, r as PrivRow])));
    } else setPrivs({});
    setLoading(false);
  }, [courseId]);

  useEffect(() => {
    if (user && courseId) void markStepOpened(user.id, "practice-pool", courseId, { source: "PracticePoolSetup" });
    void load();
  }, [load, user, courseId]);

  const generate = async () => {
    if (!courseId || selectedWeeks.size === 0) return;
    const batches = planPoolBatches([...selectedWeeks].sort((a, b) => a - b), count, kind);
    setProgress({ done: 0, total: batches.length });
    let created = 0;
    let rejected = 0;
    const reasons = new Set<string>();
    for (let i = 0; i < batches.length; i++) {
      const b = batches[i];
      const { data, error } = await supabase.functions.invoke("generate-practice-pool", {
        body: { courseId, kind, weekNumber: b.week, count: b.count, difficulty, bloomLevel, language },
      });
      if (error || data?.error) {
        let msg = data?.error as string | undefined;
        try { msg = msg || (await (error as any)?.context?.json?.())?.error; } catch { /* ignore */ }
        toast({ title: "Generation stopped", description: msg || "Please try again.", variant: "destructive" });
        break;
      }
      created += data?.created ?? 0;
      rejected += data?.rejected ?? 0;
      (data?.reasons ?? []).forEach((r: string) => reasons.add(r));
      setProgress({ done: i + 1, total: batches.length });
    }
    setProgress(null);
    toast({
      title: `${created} draft question${created === 1 ? "" : "s"} added`,
      description: rejected ? `${rejected} skipped (${[...reasons].join(", ")}).` : "Review and approve them below.",
    });
    void load();
  };

  const setStatus = async (ids: string[], status: "approved" | "draft") => {
    if (!ids.length) return;
    const { error } = await supabase.from("practice_pool_questions").update({ status }).in("id", ids);
    if (error) return toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
    setRows((r) => r.map((x) => (ids.includes(x.id) ? { ...x, status } : x)));
    if (status === "approved" && user && courseId) void markStepCompleted(user.id, "practice-pool", courseId, { source: "PracticePoolSetup" });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("practice_pool_questions").delete().eq("id", id);
    if (error) return toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
    setRows((r) => r.filter((x) => x.id !== id));
  };

  const updateMeta = async (id: string, patch: { difficulty?: number; bloom_level?: number }) => {
    const { error } = await supabase.from("practice_pool_questions").update(patch).eq("id", id);
    if (error) return toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { error: e1 } = await supabase.from("practice_pool_questions").update({ question: editing.question }).eq("id", editing.id);
    const row = rows.find((r) => r.id === editing.id);
    const { error: e2 } =
      row?.kind === "coding"
        ? { error: null }
        : await supabase.from("practice_pool_private").update({ answer: editing.answer, explanation: editing.explanation }).eq("question_id", editing.id);
    if (e1 || e2) return toast({ title: "Couldn't save", description: (e1 || e2)!.message, variant: "destructive" });
    setRows((r) => r.map((x) => (x.id === editing.id ? { ...x, question: editing.question } : x)));
    setPrivs((p) => ({ ...p, [editing.id]: { ...p[editing.id], answer: editing.answer, explanation: editing.explanation } }));
    setEditing(null);
  };

  const visible = useMemo(
    () => rows.filter((r) => (filter === "all" || r.status === filter) && (kindFilter === "all" || r.kind === kindFilter)),
    [rows, filter, kindFilter],
  );
  const coverage = useMemo(() => {
    const m = new Map<string, { nc: number; c: number }>();
    for (const r of rows) {
      if (r.status !== "approved") continue;
      const k = r.concept_code ?? "Untagged";
      const e = m.get(k) ?? { nc: 0, c: 0 };
      if (r.kind === "coding") e.c++; else e.nc++;
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => a[1].nc + a[1].c - (b[1].nc + b[1].c));
  }, [rows]);
  const approvedCount = rows.filter((r) => r.status === "approved").length;
  const drafts = rows.filter((r) => r.status === "draft");

  if (typeReady && !isEmployment) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          The practice question pool is only used by employment (upskilling) pathway courses. Academic courses keep generating practice questions for each student.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Practice Question Pool</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pre-generate the questions students get when they click Practice. Only questions you approve are shown to students, weighted toward each student's weakest topics in the weeks unlocked so far.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Question type</Label>
              <Select value={kind} onValueChange={(v) => {
                const k = v as PoolKind;
                setKind(k);
                // Coding defaults to Medium / Bloom 3 per professor preference.
                if (k === "coding" && difficulty === "mixed") setDifficulty("medium");
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="non_coding">Non-coding (MCQ, True/False, Short answer)</SelectItem>
                  <SelectItem value="coding">Coding exercise (runnable)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>How many</Label>
              <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COUNT_OPTIONS.map((c) => <SelectItem key={c} value={String(c)}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">Mixed</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {kind === "coding" && (
              <div className="space-y-1.5">
                <Label>Bloom's level</Label>
                <Select value={String(bloomLevel)} onValueChange={(v) => setBloomLevel(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6].map((b) => (
                      <SelectItem key={b} value={String(b)}>{b} — {["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"][b - 1]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {kind === "coding" && (
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="python">Python</SelectItem>
                    <SelectItem value="javascript">JavaScript</SelectItem>
                    <SelectItem value="java">Java</SelectItem>
                    <SelectItem value="cpp">C++</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Weeks</Label>
              <button type="button" className="text-xs text-primary" onClick={() =>
                setSelectedWeeks(selectedWeeks.size === weeks.length ? new Set() : new Set(weeks.map((w) => w.week_number)))}>
                {selectedWeeks.size === weeks.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
              {weeks.map((w) => (
                <label key={w.week_number} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedWeeks.has(w.week_number)}
                    onCheckedChange={(c) => {
                      const n = new Set(selectedWeeks);
                      if (c) n.add(w.week_number); else n.delete(w.week_number);
                      setSelectedWeeks(n);
                    }}
                  />
                  <span className="truncate">Week {w.week_number}{w.week_name ? ` — ${w.week_name}` : ""}</span>
                </label>
              ))}
              {!weeks.length && !loading && <p className="text-xs text-muted-foreground">Publish your lesson plan first.</p>}
            </div>
          </div>

          {kind === "coding" && (
            <p className="text-xs text-muted-foreground">
              Every coding task's reference solution is run against all its test cases before it's saved; tasks that fail are skipped. Coding generation is slower.
            </p>
          )}
          {progress ? (
            <div className="space-y-1.5">
              <Progress value={(progress.done / progress.total) * 100} />
              <p className="text-xs text-muted-foreground">Generating… batch {progress.done} of {progress.total}</p>
            </div>
          ) : (
            <Button onClick={generate} disabled={!selectedWeeks.size} className="gap-2">
              <Sparkles className="h-4 w-4" /> Generate {count} draft question{count === 1 ? "" : "s"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Coverage (approved)</h2>
            <span className="text-sm text-muted-foreground">{approvedCount} approved · {drafts.length} drafts</span>
          </div>
          {topups > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                In the last 14 days, {topups} practice set{topups === 1 ? "" : "s"} ran short of approved questions and were topped up with AI-generated questions you haven't reviewed. Add and approve more questions for weak-coverage topics.
              </span>
            </div>
          )}
          {coverage.length ? (
            <div className="flex flex-wrap gap-2">
              {coverage.map(([k, v]) => (
                <Badge key={k} variant="outline" className="gap-1 font-normal">
                  {k}: {v.nc} non-coding · {v.c} coding
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No approved questions yet — until you approve some, students get AI-generated practice.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Drafts</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="non_coding">Non-coding</SelectItem>
            <SelectItem value="coding">Coding</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" disabled={!drafts.length} onClick={() => setStatus(drafts.map((d) => d.id), "approved")} className="gap-1.5">
          <CheckCircle2 className="h-4 w-4" /> Approve all drafts ({drafts.length})
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const p = privs[r.id];
            const opts = Array.isArray(r.options) ? (r.options as string[]) : [];
            const tests = Array.isArray(r.standard_test_cases) ? r.standard_test_cases.length : 0;
            const hidden = Array.isArray(p?.hidden_test_cases) ? (p!.hidden_test_cases as unknown[]).length : 0;
            return (
              <Card key={r.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={r.status === "approved" ? "default" : "secondary"} className="text-[10px]">
                      {r.status === "approved" ? "Approved" : "Draft"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">Week {r.week_number}</Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">{r.format.replace("_", " ")}</Badge>
                    {r.concept_code && <Badge variant="outline" className="text-[10px]">{r.concept_code}</Badge>}
                    <span className="text-[10px] text-muted-foreground">Bloom {r.bloom_level} · difficulty {Number(r.difficulty).toFixed(2)}</span>
                    <div className="flex-1" />
                    {r.status === "draft" ? (
                      <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => setStatus([r.id], "approved")}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => setStatus([r.id], "draft")}>
                        <Undo2 className="h-3.5 w-3.5" /> Unapprove
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit"
                      onClick={() => setEditing({ id: r.id, question: r.question, answer: p?.answer ?? "", explanation: p?.explanation ?? "" })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Delete" onClick={() => setDeleteId(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {r.title && <p className="font-semibold">{r.title}</p>}
                  <p className="whitespace-pre-wrap text-sm">{r.question}</p>
                  {r.kind === "coding" ? (
                    <p className="text-xs text-muted-foreground">
                      {r.language} · {tests} visible + {hidden} hidden test cases · reference solution verified
                    </p>
                  ) : (
                    <>
                      {opts.length > 0 && (
                        <ul className="ml-4 list-disc text-xs text-muted-foreground">
                          {opts.map((o) => <li key={o} className={o === p?.answer ? "font-semibold text-foreground" : ""}>{o}</li>)}
                        </ul>
                      )}
                      <p className="text-xs"><span className="text-muted-foreground">Answer: </span>{p?.answer}</p>
                      {p?.explanation && <p className="text-xs text-muted-foreground">{p.explanation}</p>}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {!visible.length && <p className="p-6 text-center text-sm text-muted-foreground">No questions here yet.</p>}
        </div>
      )}

      <SetupModuleNav nextPath="/teacher/setup/project-lab" nextLabel="Continue" onNext={async () => navigate("/teacher/setup/project-lab")} />

      <AlertDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader><AlertDialogTitle>Edit question</AlertDialogTitle></AlertDialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1"><Label>Question</Label>
                <Textarea value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} className="min-h-[120px]" /></div>
              {rows.find((r) => r.id === editing.id)?.kind !== "coding" && (
                <>
                  <div className="space-y-1"><Label>Answer (MCQ: must match an option exactly)</Label>
                    <Textarea value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Explanation</Label>
                    <Textarea value={editing.explanation} onChange={(e) => setEditing({ ...editing, explanation: e.target.value })} /></div>
                </>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={saveEdit}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this question?</AlertDialogTitle>
            <AlertDialogDescription>It will be removed from the pool. Students' past practice results are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) void remove(deleteId); setDeleteId(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PracticePoolSetup;
