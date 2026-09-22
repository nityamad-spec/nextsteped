// Setup step: "DSA Questions" — bulk-generates the course-wide daily-practice
// (Daily DSA) coding question bank for employment-pathway courses. Placed
// between Lesson Plan and Diagnostic Qs; skippable, and auto-skipped when the
// course isn't an employment pathway, lacks coding access, or has no coding
// weeks (students' Daily DSA card reads only the published bank).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Eye,
  Loader2,
  Pencil,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { useCourseType } from "@/hooks/useCourseType";
import { supabase } from "@/integrations/supabase/client";
import SetupModuleNav from "@/components/SetupModuleNav";
import CodingExerciseDialog from "@/components/teacher/CodingExerciseDialog";
import {
  CODING_LANGUAGES,
  exerciseMissingFields,
  languageLabel,
  summariseValidation,
} from "@/lib/codingExercises";
import {
  deleteDailyDsaQuestion,
  fetchDailyDsaQuestions,
  generateDailyDsaBank,
  runDailyDsaQuestionValidation,
  setDailyDsaBankPublished,
  updateDailyDsaQuestion,
  type DailyDsaGenerationProgress,
  type DailyDsaQuestion,
} from "@/lib/dailyDsaQuestions";
import { markStepCompleted, markStepOpened } from "@/lib/setupProgress";

const COUNT_OPTIONS = [10, 20, 30, 40] as const;

const DsaQuestionsSetup = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const courseId = useTeacherCourseId();
  const { ready: typeReady, isEmployment } = useCourseType(courseId);

  const [loading, setLoading] = useState(true);
  const [relevant, setRelevant] = useState(false);
  const [codingWeeks, setCodingWeeks] = useState<number[]>([]);
  const [questions, setQuestions] = useState<DailyDsaQuestion[]>([]);

  const [count, setCount] = useState<number>(20);
  const [language, setLanguage] = useState<string>("python");
  const [hint, setHint] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<DailyDsaGenerationProgress | null>(null);

  const [editQuestion, setEditQuestion] = useState<DailyDsaQuestion | null>(null);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DailyDsaQuestion | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const reload = useCallback(async () => {
    if (!courseId) return;
    const bank = await fetchDailyDsaQuestions(courseId);
    setQuestions(bank);
  }, [courseId]);

  // Initial load: relevance gate + existing bank.
  useEffect(() => {
    if (!courseId || !typeReady) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: course }, { data: weeks }] = await Promise.all([
          supabase.from("courses").select("coding_access_status").eq("id", courseId).maybeSingle(),
          supabase
            .from("lesson_plan_weeks")
            .select("week_number, is_coding_week")
            .eq("course_id", courseId)
            .order("week_number"),
        ]);
        if (cancelled) return;
        const cw = (weeks ?? []).filter((w) => w.is_coding_week).map((w) => w.week_number);
        setCodingWeeks(cw);
        const ok =
          isEmployment && course?.coding_access_status === "approved" && cw.length > 0;
        setRelevant(ok);
        if (ok) {
          await reload();
          if (user) void markStepOpened(user.id, "dsa-questions", courseId, { source: "DsaQuestionsSetup.load" });
        }
      } catch (err) {
        console.error("[DsaQuestionsSetup] load failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, typeReady, isEmployment, user]);

  // Auto-skip when the step isn't relevant for this course.
  useEffect(() => {
    if (!loading && typeReady && !relevant) {
      navigate("/teacher/setup/diagnostic", { replace: true });
    }
  }, [loading, typeReady, relevant, navigate]);

  const reviewIds = useMemo(() => questions.map((q) => q.id), [questions]);
  const reviewedCount = useMemo(() => questions.filter((q) => !!q.reviewed_at).length, [questions]);
  const published = questions.length > 0 && questions.every((q) => q.published);
  const anyPublished = questions.some((q) => q.published);
  const missingById = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const q of questions) m.set(q.id, exerciseMissingFields(q));
    return m;
  }, [questions]);
  const publishable =
    questions.length > 0 &&
    questions.every((q) => !!q.reviewed_at) &&
    questions.every((q) => (missingById.get(q.id) ?? []).length === 0);

  const handleGenerate = async () => {
    if (!courseId || generating) return;
    setGenerating(true);
    setGenProgress({ stage: "start", generated: 0, weeksDone: 0, totalWeeks: 0 });
    try {
      const result = await generateDailyDsaBank(
        courseId,
        { count, language, hint: hint.trim() || undefined },
        (p) => setGenProgress(p),
      );
      toast({
        title: `Generated ${result.generated} questions`,
        description: "Review each question, then publish the bank so students see it.",
      });
      await reload();
    } catch (err: any) {
      toast({
        title: "Generation failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
      setGenProgress(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDailyDsaQuestion(deleteTarget.id);
      toast({ title: "Question deleted" });
      setDeleteTarget(null);
      await reload();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err?.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handlePublishToggle = async () => {
    if (!courseId) return;
    setPublishing(true);
    try {
      await setDailyDsaBankPublished(courseId, !published);
      toast({
        title: published ? "Bank unpublished" : "Bank published",
        description: published
          ? "Students no longer see these questions in Daily DSA."
          : "Students now get one question per day from this bank.",
      });
      await reload();
    } catch (err: any) {
      toast({ title: "Publish failed", description: err?.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const openReview = (index: number) => {
    setReviewIndex(index);
    setEditQuestion(questions[index] ?? null);
  };

  if (loading || !typeReady) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading DSA question bank…
        </div>
      </div>
    );
  }
  if (!relevant) return null; // redirect effect is firing

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold flex items-center gap-3">
          <Code2 className="h-7 w-7 text-primary" /> Generate DSA Questions
        </h1>
        <p className="text-muted-foreground mt-1">
          Build the daily-practice bank your students solve on their home page — one question per
          day, picked from what they haven't solved yet. Optional: skip it and add questions later.
        </p>
      </div>

      {/* Generation card */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Generate question bank</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Questions are spread across your course's {codingWeeks.length} coding week
            {codingWeeks.length === 1 ? "" : "s"} ({codingWeeks.map((w) => `Week ${w}`).join(", ")}),
            grounded in each week's concepts. New questions are saved as drafts — nothing goes live
            until you publish.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Total questions</Label>
              <Select value={String(count)} onValueChange={(v) => setCount(Number(v))} disabled={generating}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNT_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} questions</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage} disabled={generating}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CODING_LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Guidance for the AI (optional)</Label>
            <Textarea
              value={hint}
              onChange={(e) => setHint(e.target.value.slice(0, 500))}
              placeholder='e.g. "Focus on string parsing and data-cleaning scenarios for data roles."'
              rows={2}
              disabled={generating}
            />
          </div>
          {generating && genProgress && (
            <div className="space-y-1.5">
              <Progress
                value={
                  genProgress.totalWeeks > 0
                    ? (genProgress.weeksDone / genProgress.totalWeeks) * 100
                    : 5
                }
              />
              <p className="text-xs text-muted-foreground">
                {genProgress.totalWeeks > 0
                  ? `Week ${genProgress.weeksDone + 1 > genProgress.totalWeeks ? genProgress.totalWeeks : genProgress.weeksDone + 1} of ${genProgress.totalWeeks} — ${genProgress.generated} questions so far…`
                  : "Starting generation…"}
              </p>
            </div>
          )}
          <Button onClick={handleGenerate} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {questions.length > 0 ? "Generate more questions" : "Generate question bank"}
          </Button>
        </CardContent>
      </Card>

      {/* Bank review list */}
      {questions.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">Question bank ({questions.length})</h2>
                {published ? (
                  <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5">Published</Badge>
                ) : (
                  <Badge variant="outline" className="border-warning/40 text-warning bg-warning/5">Draft</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {reviewedCount} of {questions.length} reviewed
              </p>
            </div>
            <div className="divide-y divide-border rounded-md border border-border">
              {questions.map((q, idx) => {
                const missing = missingById.get(q.id) ?? [];
                const summary = summariseValidation(q.validation_report);
                return (
                  <div key={q.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{q.title}</span>
                        <Badge variant="secondary" className="text-[10px]">Week {q.week_number}</Badge>
                        <Badge variant="outline" className="text-[10px]">{languageLabel(q.language)}</Badge>
                        {q.reviewed_at ? (
                          <Badge variant="outline" className="gap-1 border-primary/40 text-primary text-[10px]">
                            <CheckCircle2 className="h-3 w-3" /> Reviewed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-warning/40 text-warning text-[10px]">
                            <Eye className="h-3 w-3" /> Needs review
                          </Badge>
                        )}
                        {summary?.overall === "fail" && (
                          <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive text-[10px]">
                            <AlertTriangle className="h-3 w-3" /> AI flagged issues
                          </Badge>
                        )}
                        {missing.length > 0 && (
                          <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive text-[10px]">
                            <AlertTriangle className="h-3 w-3" /> Missing: {missing[0]}{missing.length > 1 ? ` +${missing.length - 1}` : ""}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {q.problem_statement.slice(0, 140)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => openReview(idx)} aria-label="Edit question">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(q)} aria-label="Delete question">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-muted-foreground">
                {publishable || published
                  ? "Publishing makes the whole bank available to students' Daily DSA card."
                  : "Every question must be reviewed and complete before publishing."}
              </p>
              <Button
                onClick={handlePublishToggle}
                disabled={publishing || (!published && !publishable)}
                variant={published ? "outline" : "default"}
                className="gap-2"
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {published ? "Unpublish bank" : anyPublished ? "Publish bank" : "Publish bank"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" onClick={() => navigate("/teacher/setup/diagnostic")} className="text-muted-foreground">
          Skip for now
        </Button>
        <div className="flex-1">
          <SetupModuleNav
            nextPath="/teacher/setup/diagnostic"
            nextLabel="Continue"
            onNext={async () => {
              if (user && courseId) {
                await markStepCompleted(user.id, "dsa-questions", courseId, { source: "DsaQuestionsSetup.continue" });
              }
            }}
          />
        </div>
      </div>

      {/* Edit / review dialog (reuses the coding-exercise editor with DSA persistence) */}
      <CodingExerciseDialog
        open={!!editQuestion}
        onOpenChange={(open) => {
          if (!open) {
            setEditQuestion(null);
            setReviewIndex(null);
          }
        }}
        exercise={editQuestion}
        onSaved={() => void reload()}
        reviewIds={reviewIndex !== null ? reviewIds : undefined}
        reviewIndex={reviewIndex !== null ? reviewIndex : undefined}
        onReviewNavigate={
          reviewIndex !== null
            ? (i) => {
                setReviewIndex(i);
                setEditQuestion(questions[i] ?? null);
              }
            : undefined
        }
        saveDraft={updateDailyDsaQuestion}
        validateDraft={runDailyDsaQuestionValidation}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this question?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" will be removed from the bank. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DsaQuestionsSetup;
