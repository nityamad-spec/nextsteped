// Coding-exercise section for a coding/lab week on the lesson-plan editor.
// Mirrors the weekly-quiz pattern: the week row is upserted before generation
// (the edge function reads it), generation streams NDJSON with heartbeat
// frames, and generated exercises land as unpublished drafts for review.

import { useCallback, useEffect, useState } from "react";
import { Code2, Loader2, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CodingExerciseDialog from "@/components/teacher/CodingExerciseDialog";
import {
  CODING_LANGUAGES,
  deleteExercise,
  exerciseMissingFields,
  fetchWeekExercises,
  languageLabel,
  setWeekExercisesPublished,
  type CodingExercise,
} from "@/lib/codingExercises";

/** Minimal shape of the lesson-plan week this section belongs to. */
export interface CodingSectionWeek {
  week: number;
  week_name: string;
  overview: string;
  is_exam_week: boolean;
  exam_type?: "midterm" | "final" | null;
  is_coding_week: boolean;
  locked: boolean;
  concepts: any[];
  resources: any[];
}

interface CodingExercisesSectionProps {
  courseId: string;
  week: CodingSectionWeek;
  codingApproved: boolean;
}

const MAX_PER_RUN = 5;

const CodingExercisesSection = ({ courseId, week, codingApproved }: CodingExercisesSectionProps) => {
  const { toast } = useToast();
  const [exercises, setExercises] = useState<CodingExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [quantity, setQuantity] = useState("2");
  const [language, setLanguage] = useState("python");
  const [hint, setHint] = useState("");
  const [editing, setEditing] = useState<CodingExercise | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CodingExercise | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Review session: ordered unreviewed exercise ids + current position. Ids are
  // looked up against the live `exercises` list so navigation shows fresh data.
  const [reviewIds, setReviewIds] = useState<string[] | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);

  const load = useCallback(async (): Promise<CodingExercise[]> => {
    try {
      const rows = await fetchWeekExercises(courseId, week.week);
      setExercises(rows);
      return rows;
    } catch (err) {
      console.error("Coding exercises load error:", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [courseId, week.week]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  /** Opens the review dialog over all unreviewed exercises. Returns false when none need review. */
  const openReview = (rows: CodingExercise[], startId?: string): boolean => {
    const unreviewed = rows.filter((e) => !e.reviewed_at);
    if (unreviewed.length === 0) return false;
    const ids = unreviewed.map((e) => e.id);
    setReviewIds(ids);
    setReviewIndex(startId ? Math.max(0, ids.indexOf(startId)) : 0);
    return true;
  };

  const closeReview = () => {
    setReviewIds(null);
    setReviewIndex(0);
  };

  const reviewExercise = reviewIds
    ? (exercises.find((e) => e.id === reviewIds[reviewIndex]) ?? null)
    : null;

  const handleGenerate = async () => {
    const count = Math.max(1, Math.min(MAX_PER_RUN, Math.round(Number(quantity) || 1)));
    if (week.concepts.length === 0) {
      toast({
        title: "No concepts",
        description: "Add at least one concept to this week first.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      // Ensure the lesson-plan week row exists in DB (edge function reads from
      // it). Local plan may not yet be published, so upsert this week first.
      const { error: upsertErr } = await supabase.from("lesson_plan_weeks").upsert(
        {
          course_id: courseId,
          week_number: week.week,
          week_name: week.week_name || `Week ${week.week}`,
          overview: week.overview || "",
          is_exam_week: !!week.is_exam_week,
          exam_type: week.is_exam_week ? (week.exam_type ?? null) : null,
          is_coding_week: true,
          locked: !!week.locked,
          concepts: week.concepts || [],
          resources: week.resources || [],
        },
        { onConflict: "course_id,week_number" },
      );
      if (upsertErr) throw upsertErr;

      // NDJSON stream (heartbeat frames defeat the Edge Runtime idle timeout);
      // final frame is {type:"result"|"error"}.
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-coding-exercises`;
      const resp = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        },
        body: JSON.stringify({
          course_id: courseId,
          week_number: week.week,
          count,
          language,
          hint: hint.trim() || undefined,
        }),
      });
      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => "");
        throw new Error(text || `HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finalFrame: { type: string; status?: number; payload?: any; message?: string } | null = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let frame: any;
          try {
            frame = JSON.parse(line);
          } catch {
            continue;
          }
          if (frame?.type === "heartbeat" || frame?.type === "progress") continue;
          if (frame?.type === "result" || frame?.type === "error") finalFrame = frame;
        }
      }
      if (!finalFrame) throw new Error("Exercise generation was interrupted");
      if (finalFrame.type === "error") throw new Error(finalFrame.message || "Exercise generation failed");
      const payload = finalFrame.payload ?? {};
      if (payload?.error) throw new Error(payload.error);

      const generated = Number(payload?.generated ?? 0);
      await load();
      toast({
        title: "Coding exercises generated",
        description: `${generated} new draft exercise${generated === 1 ? "" : "s"} added to Week ${week.week}. Review and publish when ready.`,
      });
    } catch (err: any) {
      toast({
        title: "Failed to generate exercises",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteExercise(confirmDelete.id);
      setExercises((prev) => prev.filter((e) => e.id !== confirmDelete.id));
      toast({ title: "Exercise deleted" });
      setConfirmDelete(null);
    } catch (err: any) {
      toast({
        title: "Failed to delete exercise",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const allPublished = exercises.length > 0 && exercises.every((e) => e.published);

  const handlePublishToggle = async () => {
    const target = !allPublished;
    if (target) {
      const incomplete = exercises
        .map((e) => ({ e, missing: exerciseMissingFields(e) }))
        .filter((x) => x.missing.length > 0);
      if (incomplete.length > 0) {
        toast({
          title: "Exercises incomplete",
          description: `${incomplete.length} exercise${incomplete.length === 1 ? " is" : "s are"} missing required fields (e.g. ${incomplete[0].e.title || "untitled"}: ${incomplete[0].missing.join(", ")}). Edit and complete them before publishing.`,
          variant: "destructive",
        });
        return;
      }
    }
    setPublishing(true);
    try {
      await setWeekExercisesPublished(courseId, week.week, target);
      await load();
      toast({
        title: target ? "Exercises published" : "Exercises unpublished",
        description: target
          ? `Week ${week.week} exercises are now visible to students (once the week itself is visible).`
          : `Week ${week.week} exercises are hidden from students again.`,
      });
    } catch (err: any) {
      toast({
        title: "Failed to update publish state",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <Code2 className="h-4 w-4 text-primary" />
          Coding exercises
          {exercises.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {exercises.length} exercise{exercises.length === 1 ? "" : "s"}
            </span>
          )}
        </h4>
        {exercises.length > 0 && (
          <Badge variant={allPublished ? "default" : "outline"} className="text-[10px]">
            {allPublished ? "Published" : "Draft"}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`ce-qty-${week.week}`} className="text-xs text-muted-foreground">
            Quantity
          </Label>
          <Input
            id={`ce-qty-${week.week}`}
            type="number"
            min={1}
            max={MAX_PER_RUN}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-20"
            disabled={generating}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Language</Label>
          <Select value={language} onValueChange={setLanguage} disabled={generating}>
            <SelectTrigger aria-label="Exercise language" className="w-36">
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
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor={`ce-hint-${week.week}`} className="text-xs text-muted-foreground">
            Guidance (optional)
          </Label>
          <Input
            id={`ce-hint-${week.week}`}
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="e.g. focus on file parsing"
            maxLength={500}
            disabled={generating}
          />
        </div>
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={generating || !codingApproved}
          title={codingApproved ? undefined : "Coding exercises require admin-approved coding access"}
        >
          {generating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {generating ? "Generating…" : "Generate exercises"}
        </Button>
      </div>
      {!codingApproved && (
        <p className="text-xs text-muted-foreground">
          Coding access for this course isn't approved — generation is disabled, but existing
          exercises stay editable.
        </p>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading exercises…</p>
      ) : exercises.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">
          No exercises yet. Generated exercises appear here as drafts for your review.
        </p>
      ) : (
        <div className="space-y-2">
          {exercises.map((ex) => {
            const missing = exerciseMissingFields(ex);
            return (
              <div
                key={ex.id}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {ex.title || "Untitled exercise"}
                    </p>
                    <Badge variant="secondary" className="text-[10px]">
                      {languageLabel(ex.language)}
                    </Badge>
                    {!ex.published && (
                      <Badge variant="outline" className="text-[10px]">
                        Draft
                      </Badge>
                    )}
                  </div>
                  {missing.length > 0 && (
                    <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                      Missing: {missing.join(", ")}
                    </p>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  aria-label={`Edit ${ex.title || "exercise"}`}
                  onClick={() => setEditing(ex)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-destructive"
                  aria-label={`Delete ${ex.title || "exercise"}`}
                  onClick={() => setConfirmDelete(ex)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}

          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              variant={allPublished ? "outline" : "default"}
              onClick={handlePublishToggle}
              disabled={publishing}
            >
              {publishing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {allPublished ? "Unpublish exercises" : "Publish exercises"}
            </Button>
          </div>
        </div>
      )}

      <CodingExerciseDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        exercise={editing}
        onSaved={() => void load()}
      />

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this exercise?</DialogTitle>
            <DialogDescription>
              "{confirmDelete?.title || "Untitled exercise"}" and its reference solution and test
              cases will be permanently deleted. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default CodingExercisesSection;
