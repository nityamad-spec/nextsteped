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
  Plus,
  ShieldCheck,
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
  runExerciseValidation,
  updateExercise,
  type CodingExercise,
  type ExerciseDraft,
  type ValidationProgress,
  type ValidationReport,
} from "@/lib/codingExercises";

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
}: CodingExerciseDialogProps) => {
  const { toast } = useToast();
  const [draft, setDraft] = useState<ExerciseDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);

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
    }
  }, [open, exercise]);

  if (!exercise) return null;

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
      await updateExercise(exercise.id, draft, { markReviewed: opts?.markReviewed });
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
            <Label htmlFor="ce-solution">Reference solution (teachers only)</Label>
            <Textarea
              id="ce-solution"
              value={draft.reference_solution}
              onChange={(e) => set("reference_solution", e.target.value)}
              rows={8}
              className="font-mono text-xs"
            />
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            {renderTestCases(
              "hidden_test_cases",
              "Hidden / edge test cases",
              "Teachers only — never shown to students.",
            )}
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
