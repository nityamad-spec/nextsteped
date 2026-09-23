// Full edit dialog for a single coding exercise — every generated field is
// editable before publishing, including the teacher-only reference solution
// and hidden test cases.

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PlayCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useToast } from "@/hooks/use-toast";
import {
  CODING_LANGUAGES,
  CODING_VALIDATION_CHECKS,
  exerciseMissingFields,
  regenerateBlockedReason,
  regenerateReferenceSolution,
  runExerciseValidation,
  summariseRegen,
  updateExercise,
  type CodingExercise,
  type ExerciseDraft,
  type ReferenceRegenResult,
  type RegenProgress,
  type ValidationProgress,
  type ValidationReport,
} from "@/lib/codingExercises";
import {
  canRunTests,
  runReferenceAgainstTestCases,
  summariseTestRun,
  testRunBlockedReason,
  type TestRunProgress,
  type TestRunResult,
} from "@/lib/codingExerciseTestRun";

interface CodingExerciseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: CodingExercise | null;
  onSaved: () => void;
  /**
   * Review mode: ordered ids being reviewed + current position. When provided,
   * the dialog shows "Exercise i of N" chrome with Prev/Next navigation and
   * mark-reviewed actions. Omit for standalone edit mode.
   */
  reviewIds?: string[];
  reviewIndex?: number;
  onReviewNavigate?: (index: number) => void;
  /**
   * Persistence overrides for banks other than `coding_exercises` (e.g. the
   * Daily DSA bank). Default to the coding_exercises-backed helpers.
   */
  saveDraft?: (id: string, draft: ExerciseDraft, opts?: { markReviewed?: boolean }) => Promise<void>;
  validateDraft?: (id: string, onProgress: (p: ValidationProgress) => void) => Promise<ValidationReport>;
  /**
   * Optional concept tag control (e.g. the Daily DSA bank, where tags drive
   * mastery credit). Rendered under the title row; independent of Save.
   */
  conceptPicker?: {
    options: { id: string; label: string }[];
    value: string | null;
    onChange: (conceptId: string | null) => void;
  };
}

const emptyDraft: ExerciseDraft = {
  title: "",
  problem_statement: "",
  language: "python",
  input_spec: "",
  output_spec: "",
  constraints: null,
  examples: [],
  starter_code: "",
  standard_test_cases: [],
  reference_solution: "",
  hidden_test_cases: [],
};

const CodingExerciseDialog = ({
  open,
  onOpenChange,
  exercise,
  onSaved,
  reviewIds,
  reviewIndex,
  onReviewNavigate,
  saveDraft = updateExercise,
  validateDraft = runExerciseValidation,
  conceptPicker,
}: CodingExerciseDialogProps) => {
  const { toast } = useToast();
  const [draft, setDraft] = useState<ExerciseDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationProgress, setValidationProgress] = useState<ValidationProgress | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testProgress, setTestProgress] = useState<TestRunProgress | null>(null);
  const [testResults, setTestResults] = useState<TestRunResult[] | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [openFailure, setOpenFailure] = useState<string | null>(null);
  const [regenRunning, setRegenRunning] = useState(false);
  const [regenProgress, setRegenProgress] = useState<RegenProgress | null>(null);
  const [regenResult, setRegenResult] = useState<ReferenceRegenResult | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);

  const inReview =
    !!reviewIds && typeof reviewIndex === "number" && !!onReviewNavigate;
  const isLastReview = inReview && reviewIndex === reviewIds.length - 1;

  useEffect(() => {
    if (open && exercise) {
      setDraft({
        title: exercise.title,
        problem_statement: exercise.problem_statement,
        language: exercise.language,
        input_spec: exercise.input_spec,
        output_spec: exercise.output_spec,
        constraints: exercise.constraints,
        examples: exercise.examples.map((e) => ({ ...e })),
        starter_code: exercise.starter_code ?? "",
        standard_test_cases: exercise.standard_test_cases.map((t) => ({ ...t })),
        reference_solution: exercise.reference_solution,
        hidden_test_cases: exercise.hidden_test_cases.map((t) => ({ ...t })),
      });
      setReport(exercise.validation_report ?? null);
      setTestResults(null);
      setTestError(null);
      setTestProgress(null);
      setOpenFailure(null);
    }
  }, [open, exercise]);

  if (!exercise) return null;

  const handleValidate = async () => {
    setValidating(true);
    setValidationProgress({
      step: 0,
      total: CODING_VALIDATION_CHECKS.length,
      check: CODING_VALIDATION_CHECKS[0].id,
      label: CODING_VALIDATION_CHECKS[0].label,
    });
    try {
      const next = await validateDraft(exercise.id, (p) => setValidationProgress(p));
      setReport(next);
      onSaved();
      toast({
        title: "Validation complete",
        description: "AI notes are advisory — they don't block publishing.",
      });
    } catch (err: any) {
      toast({
        title: "Validation failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setValidating(false);
      setValidationProgress(null);
    }
  };

  const regenBlocked = regenerateBlockedReason(draft);

  const regenPercent = (p: RegenProgress) => {
    if (p.stage === "writing") return 10;
    if (p.stage === "reviewing") return 90;
    return 20 + Math.round(((p.completed ?? 0) / Math.max(p.total ?? 1, 1)) * 65);
  };

  const handleRegenerate = async () => {
    setRegenRunning(true);
    setRegenError(null);
    setRegenResult(null);
    setRegenProgress({ stage: "writing", label: "Writing solution" });
    try {
      const res = await regenerateReferenceSolution(
        exercise.course_id,
        typeof exercise.week_number === "number" ? exercise.week_number : null,
        draft,
        (p) => setRegenProgress(p),
      );
      setRegenResult(res);
    } catch (err: any) {
      setRegenError(err?.message || "Couldn't regenerate the solution.");
    } finally {
      setRegenRunning(false);
      setRegenProgress(null);
    }
  };

  const testBlockedReason = testRunBlockedReason(draft);

  const handleRunTests = async () => {
    setTestRunning(true);
    setTestError(null);
    setTestResults(null);
    setOpenFailure(null);
    setTestProgress({ completed: 0, total: 0 });
    try {
      const results = await runReferenceAgainstTestCases(draft, (p) => setTestProgress(p));
      setTestResults(results);
      const { passed, total } = summariseTestRun(results);
      toast({
        title: `${passed} of ${total} test cases passed`,
        description:
          passed === total
            ? "The reference solution matches every expected output."
            : "Review the failing cases below — this doesn't block publishing.",
      });
    } catch (err: any) {
      setTestError(err?.message || "Couldn't reach the code execution service.");
    } finally {
      setTestRunning(false);
      setTestProgress(null);
    }
  };

  const set = <K extends keyof ExerciseDraft>(key: K, value: ExerciseDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const setExample = (i: number, key: "input" | "output" | "explanation", value: string) =>
    setDraft((prev) => ({
      ...prev,
      examples: prev.examples.map((ex, j) => (j === i ? { ...ex, [key]: value } : ex)),
    }));

  const setTestCase = (
    listKey: "standard_test_cases" | "hidden_test_cases",
    i: number,
    key: "input" | "expected_output",
    value: string,
  ) =>
    setDraft((prev) => ({
      ...prev,
      [listKey]: prev[listKey].map((t, j) => (j === i ? { ...t, [key]: value } : t)),
    }));

  const handleSave = async (opts?: { markReviewed?: boolean; advance?: boolean }) => {
    setSaving(true);
    try {
      await saveDraft(exercise.id, draft, { markReviewed: opts?.markReviewed });
      const missing = exerciseMissingFields({ ...exercise, ...draft });
      toast({
        title: opts?.markReviewed ? "Exercise reviewed" : "Exercise saved",
        description:
          missing.length > 0
            ? `Still missing before publish: ${missing.join(", ")}.`
            : opts?.markReviewed
              ? "Marked as reviewed."
              : "All required fields are filled — mark the exercise reviewed before publishing.",
      });
      onSaved();
      if (opts?.advance && inReview) {
        if (isLastReview) onOpenChange(false);
        else onReviewNavigate(reviewIndex + 1);
      } else if (!inReview) {
        onOpenChange(false);
      }
    } catch (err: any) {
      toast({
        title: "Failed to save exercise",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const renderTestCases = (
    listKey: "standard_test_cases" | "hidden_test_cases",
    label: string,
    hint: string,
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label>{label}</Label>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => set(listKey, [...draft[listKey], { input: "", expected_output: "" }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>
      {draft[listKey].map((t, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Test case {i + 1}</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              aria-label={`Remove ${label} ${i + 1}`}
              onClick={() => set(listKey, draft[listKey].filter((_, j) => j !== i))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Textarea
            value={t.input}
            onChange={(e) => setTestCase(listKey, i, "input", e.target.value)}
            placeholder="Input"
            className="font-mono text-xs"
            rows={2}
          />
          <Textarea
            value={t.expected_output}
            onChange={(e) => setTestCase(listKey, i, "expected_output", e.target.value)}
            placeholder="Expected output"
            className="font-mono text-xs"
            rows={2}
          />
        </div>
      ))}
      {draft[listKey].length === 0 && (
        <p className="text-xs italic text-muted-foreground">None yet — at least one is required.</p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle>
              {inReview ? "Review coding exercise" : "Edit coding exercise"}
            </DialogTitle>
            {inReview && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Exercise {reviewIndex + 1} of {reviewIds.length}
                </Badge>
                {exercise.reviewed_at ? (
                  <Badge className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 text-xs dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Reviewed
                  </Badge>
                ) : (
                  <Badge className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 text-xs dark:text-amber-400">
                    Needs review
                  </Badge>
                )}
                <div className="flex items-center">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label="Previous exercise"
                    disabled={saving || reviewIndex === 0}
                    onClick={() => onReviewNavigate(reviewIndex - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label="Next exercise"
                    disabled={saving || isLastReview}
                    onClick={() => onReviewNavigate(reviewIndex + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <div className="space-y-1.5">
              <Label htmlFor="ce-title">Title</Label>
              <Input
                id="ce-title"
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select value={draft.language} onValueChange={(v) => set("language", v)}>
                <SelectTrigger aria-label="Programming language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CODING_LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {conceptPicker && (
            <div className="space-y-1.5">
              <Label>Concept tag (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Solving this question nudges the student's mastery of the tagged concept.
                Without a tag the question is mastery-neutral.
              </p>
              <Select
                value={conceptPicker.value ?? "__none__"}
                onValueChange={(v) => conceptPicker.onChange(v === "__none__" ? null : v)}
              >
                <SelectTrigger aria-label="Concept tag">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No concept (mastery-neutral)</SelectItem>
                  {conceptPicker.options.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ce-problem">Problem statement</Label>
            <Textarea
              id="ce-problem"
              value={draft.problem_statement}
              onChange={(e) => set("problem_statement", e.target.value)}
              rows={5}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ce-input-spec">Input specification</Label>
              <Textarea
                id="ce-input-spec"
                value={draft.input_spec}
                onChange={(e) => set("input_spec", e.target.value)}
                rows={3}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ce-output-spec">Output specification</Label>
              <Textarea
                id="ce-output-spec"
                value={draft.output_spec}
                onChange={(e) => set("output_spec", e.target.value)}
                rows={3}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ce-constraints">Constraints (optional)</Label>
            <Textarea
              id="ce-constraints"
              value={draft.constraints ?? ""}
              onChange={(e) => set("constraints", e.target.value)}
              rows={2}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Examples</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => set("examples", [...draft.examples, { input: "", output: "", explanation: "" }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add
              </Button>
            </div>
            {draft.examples.map((ex, i) => (
              <div key={i} className="space-y-1.5 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Example {i + 1}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    aria-label={`Remove example ${i + 1}`}
                    onClick={() => set("examples", draft.examples.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Textarea
                    value={ex.input}
                    onChange={(e) => setExample(i, "input", e.target.value)}
                    placeholder="Input"
                    className="font-mono text-xs"
                    rows={2}
                  />
                  <Textarea
                    value={ex.output}
                    onChange={(e) => setExample(i, "output", e.target.value)}
                    placeholder="Output"
                    className="font-mono text-xs"
                    rows={2}
                  />
                </div>
                <Input
                  value={ex.explanation ?? ""}
                  onChange={(e) => setExample(i, "explanation", e.target.value)}
                  placeholder="Explanation (optional)"
                  className="text-xs"
                />
              </div>
            ))}
            {draft.examples.length === 0 && (
              <p className="text-xs italic text-muted-foreground">None yet — at least one is required.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ce-starter">Starter code (visible to students)</Label>
            <p className="text-xs text-muted-foreground">
              Skeleton the student's code terminal pre-fills with — entry point and TODOs only, no
              solution logic. Leave empty to use the terminal's default template.
            </p>
            <Textarea
              id="ce-starter"
              value={draft.starter_code}
              onChange={(e) => set("starter_code", e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder={"# TODO: implement …"}
            />
          </div>

          {renderTestCases(
            "standard_test_cases",
            "Standard test cases",
            "Visible to students — used to illustrate expected behavior.",
          )}

          <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ce-solution">Reference solution (teachers only)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRegenerate()}
                disabled={regenRunning || saving || validating || testRunning || !!regenBlocked}
              >
                {regenRunning ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" />
                )}
                {regenRunning ? "Regenerating…" : "Regenerate solution"}
              </Button>
            </div>
            <Textarea
              id="ce-solution"
              value={draft.reference_solution}
              onChange={(e) => set("reference_solution", e.target.value)}
              rows={8}
              className="font-mono text-xs"
            />
            {regenBlocked && !regenRunning && (
              <p className="text-xs italic text-muted-foreground">{regenBlocked}</p>
            )}
            {regenRunning && regenProgress && (
              <div className="space-y-1">
                <Progress value={regenPercent(regenProgress)} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  {regenProgress.label}
                  {regenProgress.stage === "running" && regenProgress.total
                    ? ` (${regenProgress.completed ?? 0} of ${regenProgress.total})`
                    : "…"}
                </p>
              </div>
            )}
            {regenError && !regenRunning && (
              <p className="flex items-start gap-2 text-xs text-destructive">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{regenError}</span>
              </p>
            )}
            {regenResult && !regenRunning && (
              <div className="space-y-2 rounded-md border bg-background p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const s = summariseRegen(regenResult);
                      return (
                        <Badge variant={s === "failed" ? "destructive" : s === "verified" ? "default" : "secondary"}>
                          {s === "verified" ? "Verified" : s === "failed" ? "Failed" : "Needs review"}
                        </Badge>
                      );
                    })()}
                    <span className="text-xs">
                      {regenResult.cases.filter((c) => c.passed).length} of {regenResult.cases.length} cases passed
                      {regenResult.attempts > 1 ? " (after one retry)" : ""}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRegenResult(null)}>
                      Discard
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        set("reference_solution", regenResult.solution);
                        setRegenResult(null);
                        setTestResults(null);
                        toast({ title: "Solution applied", description: "Save the exercise to keep it." });
                      }}
                    >
                      Use this solution
                    </Button>
                  </div>
                </div>
                {regenResult.notes && (
                  <p className="text-xs text-muted-foreground">{regenResult.notes}</p>
                )}
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium">Current</p>
                    <pre className="max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
                      {draft.reference_solution || "(empty)"}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium">New</p>
                    <pre className="max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
                      {regenResult.solution}
                    </pre>
                  </div>
                </div>
                <ul className="space-y-1">
                  {regenResult.checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-2 text-xs">
                      {c.status === "pass" ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      ) : c.status === "warning" ? (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      ) : (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                      )}
                      <span>
                        <span className="font-medium">{c.label}:</span> {c.note}
                      </span>
                    </li>
                  ))}
                </ul>
                {regenResult.cases.some((c) => !c.passed) && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Failing cases</p>
                    {regenResult.cases
                      .filter((c) => !c.passed)
                      .map((c) => (
                        <div key={`${c.kind}-${c.index}`} className="rounded border p-2 text-xs">
                          <p className="font-medium capitalize">
                            {c.kind} {c.index} — {c.status}
                          </p>
                          <p className="font-mono whitespace-pre-wrap">Expected: {JSON.stringify(c.expected)}</p>
                          <p className="font-mono whitespace-pre-wrap">Got: {JSON.stringify(c.actual)}</p>
                          {c.message && <p className="font-mono whitespace-pre-wrap text-destructive">{c.message}</p>}
                        </div>
                      ))}
                    <p className="text-xs text-muted-foreground">
                      If a test's expected output is wrong, fix the test case instead of the solution.
                    </p>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Test cases are executed for real; the format checks are an AI review.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            {renderTestCases(
              "hidden_test_cases",
              "Hidden / edge test cases",
              "Teachers only — never shown to students.",
            )}
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Test case check</p>
                <p className="text-xs text-muted-foreground">
                  Runs the reference solution against every standard and hidden test case.
                  Output must match (trailing spaces and newlines are ignored). Results aren't saved and never block publishing.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleRunTests()}
                disabled={testRunning || saving || validating || !canRunTests(draft)}
              >
                {testRunning ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="mr-1.5 h-4 w-4" />
                )}
                {testRunning ? "Running…" : "Run test cases"}
              </Button>
            </div>

            {testBlockedReason && !testRunning && (
              <p className="text-xs italic text-muted-foreground">{testBlockedReason}</p>
            )}

            {testRunning && testProgress && (
              <div className="space-y-1">
                <Progress
                  value={
                    testProgress.total
                      ? Math.round((testProgress.completed / testProgress.total) * 100)
                      : 0
                  }
                  className="h-1.5"
                />
                <p className="text-xs text-muted-foreground">
                  Running test case{" "}
                  {Math.min(testProgress.completed + 1, testProgress.total || 1)} of{" "}
                  {testProgress.total || "…"}
                </p>
              </div>
            )}

            {testError && !testRunning && (
              <p className="flex items-start gap-2 text-xs text-destructive">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{testError}</span>
              </p>
            )}

            {!testRunning && testResults && testResults.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium">
                  {summariseTestRun(testResults).passed} of {testResults.length} passed
                </p>
                {testResults.map((r) => {
                  const key = `${r.kind}-${r.index}`;
                  const label = `${r.kind === "hidden" ? "Hidden" : "Standard"} test case ${r.index}`;
                  return (
                    <div key={key} className="rounded-md border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2 text-xs">
                          {r.passed ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                          )}
                          <span className="truncate font-medium">{label}</span>
                          <span className="text-muted-foreground">{r.status}</span>
                        </span>
                        {!r.passed && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => setOpenFailure(openFailure === key ? null : key)}
                          >
                            {openFailure === key ? "Hide" : "Details"}
                          </Button>
                        )}
                      </div>
                      {!r.passed && openFailure === key && (
                        <div className="mt-2 space-y-1.5 text-xs">
                          <div>
                            <p className="text-muted-foreground">Expected output</p>
                            <pre className="whitespace-pre-wrap rounded bg-muted p-2 font-mono">
                              {r.expected || "(empty)"}
                            </pre>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Actual output</p>
                            <pre className="whitespace-pre-wrap rounded bg-muted p-2 font-mono">
                              {r.actual || "(empty)"}
                            </pre>
                          </div>
                          {r.message && (
                            <div>
                              <p className="text-muted-foreground">Error output</p>
                              <pre className="whitespace-pre-wrap rounded bg-destructive/10 p-2 font-mono text-destructive">
                                {r.message}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">AI quality review</p>
                <p className="text-xs text-muted-foreground">
                  Checks the statement, specs, constraints, examples and test cases. Advisory
                  only — saving an edit clears the report.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleValidate()}
                disabled={validating || saving}
              >
                {validating ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-1.5 h-4 w-4" />
                )}
                {validating ? "Validating…" : "Validate"}
              </Button>
            </div>

            {validating && validationProgress && (
              <div className="space-y-1">
                <Progress
                  value={Math.round(
                    (validationProgress.step / validationProgress.total) * 100,
                  )}
                  className="h-1.5"
                />
                <p className="text-xs text-muted-foreground">
                  Checking {validationProgress.label.toLowerCase()}… (
                  {Math.min(validationProgress.step + 1, validationProgress.total)} of{" "}
                  {validationProgress.total})
                </p>
              </div>
            )}

            {!validating && report?.checks?.length ? (
              <div className="space-y-1">
                {report.checks.map((c) => (
                  <div key={c.id} className="flex items-start gap-2 text-xs">
                    {c.status === "pass" ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    ) : c.status === "warning" ? (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    ) : (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                    )}
                    <span className="min-w-0">
                      <span className="font-medium">{c.label}:</span>{" "}
                      <span className="text-muted-foreground">{c.note}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {inReview ? (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Close
              </Button>
              <Button variant="outline" onClick={() => void handleSave()} disabled={saving}>
                Save
              </Button>
              <Button
                onClick={() => void handleSave({ markReviewed: true, advance: true })}
                disabled={saving}
              >
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {isLastReview ? "Save & mark reviewed" : "Mark reviewed & next"}
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Save exercise
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CodingExerciseDialog;
