import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Info, Loader2, BookOpen, Trash2, Sparkles, ArrowLeft, Check, Clock,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import SetupModuleNav from "@/components/SetupModuleNav";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { markStepCompleted } from "@/lib/setupProgress";

interface DiagnosticQuestion {
  id: string;
  item_code: string;
  content_text: string;
  format: string;
  difficulty_estimate: number;
  bloom_level: number;
  answer: string;
  options: any;
  topic: string | null;
}

const difficultyLabel = (est: number) => {
  if (est <= 0.33) return "Easy";
  if (est <= 0.66) return "Medium";
  return "Hard";
};

const difficultyColor = (est: number) => {
  if (est <= 0.33) return "bg-emerald-500/10 text-emerald-600 border-emerald-200";
  if (est <= 0.66) return "bg-amber-500/10 text-amber-600 border-amber-200";
  return "bg-destructive/10 text-destructive border-destructive/20";
};

const DiagnosticQuestionsSetup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const courseId = useTeacherCourseId();

  const [questions, setQuestions] = useState<DiagnosticQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [conceptCount, setConceptCount] = useState(0);
  const [adaptiveFilter, setAdaptiveFilter] = useState<string>("Easy");
  const [elapsed, setElapsed] = useState(0);
  const [distribution, setDistribution] = useState<Array<{ unit: string; count: number; quota: number }>>([]);

  type TierRow = {
    tier: "standard" | "easy" | "medium" | "hard";
    status: "pending" | "calling_model" | "validating" | "done" | "failed" | "skipped";
    requested: number;
    accepted: number;
    attempts: number;
    error_code: string | null;
  };
  const [tierRows, setTierRows] = useState<TierRow[]>([]);

  const TIERS = ["standard", "easy", "medium", "hard"] as const;

  // Elapsed timer (used purely for "Xs elapsed" display).
  useEffect(() => {
    if (!generating) { setElapsed(0); return; }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(id);
  }, [generating]);

  // Poll the live progress table while generating. The edge function seeds 4
  // rows per run and updates them at each lifecycle step; we render real state.
  useEffect(() => {
    if (!generating || !courseId) return;
    let cancelled = false;
    const pollOnce = async () => {
      const { data } = await supabase
        .from("diagnostic_generation_runs")
        .select("tier, status, requested, accepted, attempts, error_code, run_id, created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false })
        .limit(8);
      if (cancelled || !data || data.length === 0) return;
      // Latest run_id wins (created within this generation).
      const latestRunId = (data[0] as { run_id: string }).run_id;
      const rows = data
        .filter((r) => (r as { run_id: string }).run_id === latestRunId)
        .map((r) => ({
          tier: r.tier as TierRow["tier"],
          status: r.status as TierRow["status"],
          requested: r.requested as number,
          accepted: r.accepted as number,
          attempts: r.attempts as number,
          error_code: (r.error_code as string | null) ?? null,
        }));
      setTierRows(rows);
    };
    void pollOnce();
    const id = setInterval(pollOnce, 1500);
    return () => { cancelled = true; clearInterval(id); };
  }, [generating, courseId]);

  // Per-tier display derived from real DB state.
  const tierDisplay = (tier: typeof TIERS[number]): { pct: number; label: string; tone: "info" | "success" | "warn" | "error" } => {
    const row = tierRows.find((r) => r.tier === tier);
    if (!row) return { pct: 4, label: "Queued…", tone: "info" };
    const ratio = row.requested > 0 ? row.accepted / row.requested : 0;
    switch (row.status) {
      case "pending":
        return { pct: 6, label: "Queued…", tone: "info" };
      case "calling_model":
        return { pct: Math.max(15, ratio * 60), label: `Calling model${row.attempts > 1 ? ` (attempt ${row.attempts})` : ""}…`, tone: "info" };
      case "validating":
        return { pct: Math.max(60, 60 + ratio * 35), label: `Validating ${row.accepted}/${row.requested}…`, tone: "info" };
      case "done":
        return { pct: 100, label: `Done — ${row.accepted}/${row.requested}`, tone: "success" };
      case "failed":
        return { pct: Math.max(8, ratio * 100), label: row.error_code === "credits_exhausted" ? "Failed — credits exhausted" : `Failed — ${row.accepted}/${row.requested}`, tone: "error" };
      case "skipped":
        return { pct: Math.max(8, ratio * 100), label: "Skipped — deadline exceeded", tone: "warn" };
    }
  };

  const overallPct = tierRows.length === 0
    ? Math.min(15, elapsed * 2) // gentle ramp before first poll lands
    : Math.round(TIERS.reduce((sum, t) => sum + tierDisplay(t).pct, 0) / TIERS.length);



  useEffect(() => {
    const fetchData = async () => {
      if (!courseId) { setLoading(false); return; }

      const [questionsRes, conceptsRes] = await Promise.all([
        supabase
          .from("diagnostic_questions")
          .select("id, item_code, content_text, format, difficulty_estimate, bloom_level, answer, options, topic")
          .eq("course_id", courseId)
          .order("difficulty_estimate"),
        supabase.from("concepts").select("id", { count: "exact" }).eq("course_id", courseId),
      ]);

      if (questionsRes.data) setQuestions(questionsRes.data);
      setConceptCount(conceptsRes.count || 0);
      setLoading(false);
    };
    fetchData();
  }, [courseId]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("diagnostic_questions").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
      return;
    }
    setQuestions(prev => prev.filter(q => q.id !== id));
    toast({ title: "Question removed" });
  };

  const QUOTA: Record<typeof TIERS[number], number> = {
    standard: 10, easy: 10, medium: 10, hard: 10,
  };

  const runGeneration = async (tiers?: typeof TIERS[number][]) => {
    if (!courseId) {
      toast({ title: "No course selected", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const body: { courseId: string; tiers?: string[] } = { courseId };
      if (tiers && tiers.length > 0) body.tiers = tiers;
      const { data, error } = await supabase.functions.invoke("generate-diagnostic-questions", {
        body,
      });

      // Edge function returned non-2xx (e.g. 422 partial)
      if (error) {
        const ctx: any = (error as any).context;
        let parsedBody: any = null;
        try {
          if (ctx?.json) parsedBody = await ctx.json();
          else if (ctx?.text) parsedBody = JSON.parse(await ctx.text());
        } catch { /* ignore */ }
        if (parsedBody?.breakdown) {
          const short = parsedBody.breakdown
            .filter((b: any) => b.accepted < b.requested)
            .map((b: any) => `${b.tier}: ${b.accepted}/${b.requested}`)
            .join(", ");
          toast({
            title: "Generation incomplete",
            description: `Some tiers fell short (${short}). Existing questions were not changed. Try regenerating.`,
            variant: "destructive",
          });
          return;
        }
        throw error;
      }
      if (data?.error) throw new Error(data.error);

      // Refetch
      const { data: refreshed } = await supabase
        .from("diagnostic_questions")
        .select("id, item_code, content_text, format, difficulty_estimate, bloom_level, answer, options, topic")
        .eq("course_id", courseId)
        .order("difficulty_estimate");
      if (refreshed) setQuestions(refreshed);
      if (Array.isArray(data?.distributionByUnit)) setDistribution(data.distributionByUnit);
      // Strict gating: 20 total AND 5 in each tier band before marking complete.
      const tierCounts = (refreshed || []).reduce(
        (acc: Record<string, number>, q: any) => {
          const code = (q.item_code || "").toUpperCase();
          const tier = code.includes("-STANDARD-") ? "standard"
            : code.includes("-EASY-") ? "easy"
            : code.includes("-MEDIUM-") ? "medium"
            : code.includes("-HARD-") ? "hard" : "other";
          acc[tier] = (acc[tier] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
      const allTiersFull =
        tierCounts.standard === 5 &&
        tierCounts.easy === 5 &&
        tierCounts.medium === 5 &&
        tierCounts.hard === 5;
      if (refreshed && refreshed.length === 20 && allTiersFull && user?.id) {
        void markStepCompleted(user.id, "diagnostic", courseId);
      }

      const attemptsSummary = Array.isArray(data?.breakdown)
        ? data.breakdown.map((b: any) => `${b.tier[0].toUpperCase()}:${b.attempts}`).join(" ")
        : "";
      if (data?.partial) {
        toast({
          title: "Partial bank generated",
          description: data?.message || `Some tiers fell short: ${(data?.shortTiers || []).join(", ")}. Regenerate to top up.`,
        });
      } else {
        toast({
          title: tiers ? "Tier regenerated" : "Question bank generated",
          description: data?.message
            ? `${data.message}${attemptsSummary ? ` (attempts ${attemptsSummary})` : ""}`
            : "Diagnostic questions are ready to review.",
        });
      }
    } catch (e: any) {
      toast({
        title: "Generation failed",
        description: e?.message || "Could not generate questions. Try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = () => runGeneration();
  const handleRegenerateTiers = (tiers: typeof TIERS[number][]) => runGeneration(tiers);


  // Partition by item_code tier (STANDARD / EASY / MEDIUM / HARD).
  // Fallback to difficulty buckets for legacy rows that don't follow the tier convention.
  const tierOf = (q: DiagnosticQuestion): "STANDARD" | "EASY" | "MEDIUM" | "HARD" => {
    const code = (q.item_code || "").toUpperCase();
    if (code.includes("-STANDARD-")) return "STANDARD";
    if (code.includes("-EASY-")) return "EASY";
    if (code.includes("-MEDIUM-")) return "MEDIUM";
    if (code.includes("-HARD-")) return "HARD";
    // Legacy fallback by difficulty
    if (q.difficulty_estimate <= 0.33) return "EASY";
    if (q.difficulty_estimate >= 0.75) return "HARD";
    return "MEDIUM";
  };

  const standardQuestions = questions.filter(q => tierOf(q) === "STANDARD");
  const adaptiveQuestions = questions.filter(q => tierOf(q) !== "STANDARD");

  const filteredAdaptive = adaptiveQuestions.filter(
    q => tierOf(q) === adaptiveFilter.toUpperCase(),
  );

  // Concept coverage from questions
  const allTopics = [...new Set(questions.map(q => q.topic).filter(Boolean))] as string[];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading diagnostic setup…</p>
        </div>
      </div>
    );
  }

  const renderQuestionCard = (q: DiagnosticQuestion, index: number) => {
    const opts = Array.isArray(q.options) ? (q.options as string[]) : [];
    const correctIdx = opts.findIndex(opt => opt === q.answer);
    const correctLetter = correctIdx >= 0 ? String.fromCharCode(65 + correctIdx) : null;

    return (
      <div key={q.id} className="rounded-lg border p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground">Q{index + 1}</span>
            <Badge variant="outline" className={`text-[10px] ${difficultyColor(q.difficulty_estimate)}`}>
              {difficultyLabel(q.difficulty_estimate)}
            </Badge>
            <Badge variant="outline" className="text-[10px]">{q.format.toUpperCase()}</Badge>
            {q.topic && <span className="text-[10px] text-muted-foreground">{q.topic}</span>}
          </div>
          <button
            onClick={() => handleDelete(q.id)}
            className="rounded p-1.5 hover:bg-destructive/10 hover:text-destructive shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="text-sm whitespace-pre-wrap">{q.content_text}</p>

        {q.format === "mcq" && opts.length > 0 && (
          <div className="space-y-1 pl-2">
            {opts.map((opt: string, i: number) => {
              const isCorrect = opt === q.answer;
              return (
                <div
                  key={i}
                  className={`flex items-start gap-1.5 text-xs rounded px-1.5 py-0.5 ${
                    isCorrect
                      ? "bg-emerald-500/10 text-emerald-700 font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {isCorrect ? (
                    <Check className="h-3 w-3 mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <span>
                    {String.fromCharCode(65 + i)}. {opt}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-start gap-2 rounded-md bg-emerald-500/5 border border-emerald-500/20 px-2.5 py-1.5">
          <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
          <div className="text-xs">
            <span className="font-semibold text-emerald-700">Correct answer: </span>
            <span className="text-foreground">
              {q.format === "mcq" && correctLetter ? `${correctLetter}. ${q.answer}` : q.answer}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <Button variant="outline" size="sm" onClick={() => navigate("/teacher/setup")} className="gap-2 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Course Setup
        </Button>

        <div className="mb-6 text-center">
          <h1 className="font-heading text-3xl font-bold">
            Diagnostic <span className="text-primary">Assessment</span>
          </h1>
          <p className="text-muted-foreground">Review the auto-generated diagnostic quiz students take when they join your course</p>
        </div>

        {/* What is the diagnostic */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Brain className="h-5 w-5 text-primary" /> What is the Diagnostic?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              The diagnostic assessment is an adaptive quiz that students take when they first join your course. It measures their existing knowledge across course concepts to determine their starting proficiency level.
            </p>
            <div className="rounded-lg bg-muted/30 border p-4 space-y-2">
              <p className="text-sm font-medium">How it works:</p>
              <ul className="text-sm text-muted-foreground space-y-1.5 ml-4 list-disc">
                <li><strong>10 Standard Questions</strong> — Common to all students, covering core concepts at a medium difficulty level</li>
                <li><strong>10 Adaptive Questions</strong> — Based on performance on the standard questions, students are routed to an Easy, Medium, or Hard tier of follow-up questions</li>
                <li>Questions are <strong>randomized</strong> for each student to prevent cheating</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Important notice */}
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">This is a template — not an exhaustive list</p>
            <p>The question bank below is an example set for your review. Questions are AI-generated and randomized for each student, so students will receive different combinations. You can review, remove, or use these as a reference for the types of questions that will appear.</p>
          </div>
        </div>

        {/* Question Bank */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="h-5 w-5 text-primary" /> Question Bank
                </CardTitle>
                <CardDescription className="mt-1">
                  {questions.length > 0
                    ? `${questions.length} sample questions across ${conceptCount} concepts — review and remove any that don't fit.`
                    : `No questions yet. Generate a template based on your ${conceptCount} course concepts.`}
                </CardDescription>
              </div>
              {questions.length > 0 ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={generating || conceptCount === 0} size="sm" variant="outline">
                      {generating ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</>
                      ) : (
                        <><Sparkles className="mr-2 h-4 w-4" /> Regenerate</>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Replace existing questions?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete all current diagnostic questions for this course and generate a fresh set of 20 MCQs. Any edits or manual deletions will be lost. The replacement only happens if generation succeeds for all tiers.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleGenerate}>Regenerate</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button
                  onClick={handleGenerate}
                  disabled={generating || conceptCount === 0}
                  size="sm"
                >
                  {generating ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</>
                  ) : (
                    <><Sparkles className="mr-2 h-4 w-4" /> Generate Question Bank</>
                  )}
                </Button>
              )}
            </div>
            {conceptCount === 0 && (
              <p className="text-xs text-amber-600 mt-2">
                Generate your lesson plan first to extract concepts before building the diagnostic.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Live generation progress */}
            {generating && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-sm font-medium">Generating diagnostic question bank…</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{elapsed}s elapsed</span>
                  </div>
                </div>
                <Progress value={overallPct} className="h-2" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TIERS.map((tier) => {
                    const s = tierDisplay(tier);
                    const toneClass =
                      s.tone === "success" ? "text-emerald-600"
                      : s.tone === "error" ? "text-destructive"
                      : s.tone === "warn" ? "text-amber-600"
                      : "text-muted-foreground";
                    return (
                      <div key={tier} className="rounded-md border bg-background/60 px-3 py-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium capitalize">{tier} tier</span>
                          <span className="text-[10px] text-muted-foreground">{Math.round(s.pct)}%</span>
                        </div>
                        <Progress value={s.pct} className="h-1.5" />
                        <p className={`text-[10px] mt-1 ${toneClass}`}>{s.label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}


            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-muted/20 p-3 text-center">
                <p className="text-lg font-bold text-primary">{questions.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 text-center">
                <p className="text-lg font-bold text-primary">{standardQuestions.length}</p>
                <p className="text-xs text-muted-foreground">Standard</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 text-center">
                <p className="text-lg font-bold text-primary">{adaptiveQuestions.length}</p>
                <p className="text-xs text-muted-foreground">Adaptive</p>
              </div>
            </div>

            {/* Standard Questions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Standard Questions</p>
                  <p className="text-xs text-muted-foreground">Common to all students — covering core concepts</p>
                </div>
                <Badge variant="outline" className="font-mono">{standardQuestions.length} questions</Badge>
              </div>
              {standardQuestions.length > 0 ? (
                <div className="space-y-2">
                  {standardQuestions.map((q, i) => renderQuestionCard(q, i))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <p className="text-xs text-muted-foreground">No standard questions yet</p>
                </div>
              )}
            </div>

            <div className="border-t" />

            {/* Adaptive Questions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Adaptive Tier Questions</p>
                  <p className="text-xs text-muted-foreground">Students receive Easy, Medium, or Hard questions based on standard performance</p>
                </div>
                <Badge variant="outline" className="font-mono">{adaptiveQuestions.length} questions</Badge>
              </div>
              {/* Tier filters */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">View tier:</span>
                {(["Easy", "Medium", "Hard"] as const).map(tier => {
                  const count = adaptiveQuestions.filter(q => tierOf(q) === tier.toUpperCase()).length;
                  return (
                    <button
                      key={tier}
                      onClick={() => setAdaptiveFilter(tier)}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                        adaptiveFilter === tier
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-muted"
                      }`}
                    >
                      {tier} ({count})
                    </button>
                  );
                })}
              </div>
              {filteredAdaptive.length > 0 ? (
                <div className="space-y-2">
                  {filteredAdaptive.map((q, i) => renderQuestionCard(q, i + 5))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <p className="text-xs text-muted-foreground">No {adaptiveFilter} tier questions yet</p>
                </div>
              )}
            </div>

            <div className="border-t" />


            {/* Concept Coverage */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Concept Coverage</p>
              <div className="flex flex-wrap gap-2">
                {allTopics.length > 0 ? allTopics.map(topic => (
                  <Badge key={topic} variant="outline" className="text-xs">{topic}</Badge>
                )) : (
                  <p className="text-xs text-muted-foreground">No concepts detected yet</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Questions are distributed across all major course concepts.</p>
            </div>
          </CardContent>
        </Card>

        <SetupModuleNav nextPath="/teacher/setup/ai-settings" nextLabel="Next: AI Assistant Settings" />
      </div>
    </div>
  );
};

export default DiagnosticQuestionsSetup;
