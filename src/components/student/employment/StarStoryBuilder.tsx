import { useState } from "react";
import { ArrowRight, Sparkles, Loader2, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStarStories } from "@/hooks/useStarStories";
import { CAREER_READINESS_EMPTY_NOTICE, type CrQaPair } from "@/lib/careerReadinessContent";
import {
  MOST_TESTED_THEMES,
  STAR_COMPLETION_THRESHOLD,
  STAR_TARGET_STORIES,
  STAR_THEMES,
  writtenLabel,
  type StarStory,
} from "@/lib/starStories";

interface Props {
  targetRole?: string | null;
  courseId: string | null;
  /** Professor-set prompts; empty means the section isn't set up yet. */
  commonPrompts: CrQaPair[];
  onGoToPractice: () => void;
}

type Draft = {
  id: string | null;
  title: string;
  themes: string[];
  situation: string;
  task: string;
  action: string;
  result: string;
};

const emptyDraft = (): Draft => ({
  id: null,
  title: "",
  themes: [],
  situation: "",
  task: "",
  action: "",
  result: "",
});

const toDraft = (s: StarStory): Draft => ({
  id: s.id,
  title: s.title,
  themes: s.themes,
  situation: s.situation,
  task: s.task,
  action: s.action,
  result: s.result,
});

const SECTIONS = [
  { key: "situation", label: "Situation" },
  { key: "task", label: "Task" },
  { key: "action", label: "Action" },
  { key: "result", label: "Result" },
] as const;

const PLACEHOLDERS: Record<string, string> = {
  situation: "Set the scene in 1–2 sentences. Where were you, and what was hard?",
  task: "What were you responsible for?",
  action: 'What did you actually do? Mostly "I", not "we". 3–5 sentences.',
  result: "What changed? Use a number wherever you can.",
};

/**
 * Career Readiness "Prepare" step: a STAR story builder.
 * Stories are saved to the student's account, scoped to the course.
 */
const StarStoryBuilder = ({ targetRole, courseId, onGoToPractice }: Props) => {
  const { stories, loading, create, update, remove } = useStarStories(courseId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reviewing, setReviewing] = useState<StarStory | null>(null);
  const [improving, setImproving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const coverageSlots = Array.from({ length: STAR_TARGET_STORIES });
  const complete = stories.length >= STAR_COMPLETION_THRESHOLD;

  const updateDraft = (patch: Partial<Draft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  const toggleTheme = (theme: string) => {
    if (!draft) return;
    const has = draft.themes.includes(theme);
    updateDraft({
      themes: has
        ? draft.themes.filter((t) => t !== theme)
        : [...draft.themes, theme],
    });
  };

  const saveDraft = async () => {
    if (!draft) return;
    const input = {
      title: draft.title.trim() || "Untitled story",
      themes: draft.themes,
      situation: draft.situation,
      task: draft.task,
      action: draft.action,
      result: draft.result,
    };
    setSaving(true);
    const ok = draft.id ? await update(draft.id, input) : await create(input);
    setSaving(false);
    if (ok) {
      toast.success("Story saved.");
      setDraft(null);
    }
  };

  const deleteDraft = async () => {
    if (!draft?.id) return;
    const ok = await remove(draft.id);
    setConfirmDelete(false);
    if (ok) {
      toast.success("Story deleted.");
      setDraft(null);
    }
  };

  const improve = async () => {
    if (!draft) return;
    const filled = [draft.situation, draft.task, draft.action, draft.result]
      .join("")
      .trim();
    if (!filled) {
      toast.error("Write a rough version first, then I'll tighten it.");
      return;
    }
    setImproving(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "improve-star-story",
        {
          body: {
            title: draft.title,
            themes: draft.themes,
            situation: draft.situation,
            task: draft.task,
            action: draft.action,
            result: draft.result,
            role: targetRole ?? "",
          },
        },
      );
      if (error) throw error;
      const improved = (data as { improved?: Partial<Draft> })?.improved;
      if (!improved) throw new Error("no_result");
      updateDraft({
        title: improved.title ?? draft.title,
        situation: improved.situation ?? draft.situation,
        task: improved.task ?? draft.task,
        action: improved.action ?? draft.action,
        result: improved.result ?? draft.result,
      });
      toast.success("Rewritten — save it to keep the changes.");
    } catch {
      toast.error("Couldn't improve the story right now. Try again shortly.");
    } finally {
      setImproving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-black dark:text-white">
            Step 2 · Prepare — STAR story builder
          </p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Prepare 10–12 crisp STAR stories. Each under 2 minutes with concrete
            numbers. Cover: led something, conflict, failure, proud project,
            learned fast, disagreed, missed deadline, delivered under ambiguity.
          </p>
        </div>
        <Button onClick={() => setDraft(emptyDraft())} disabled={!courseId}>
          + New STAR story
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Your STAR Stories</p>
            <p className="text-xs text-muted-foreground">
              {stories.length} of {STAR_TARGET_STORIES} stories
            </p>
          </div>
          <div className="flex gap-1.5">
            {coverageSlots.map((_, i) => (
              <div
                key={i}
                className={`h-2.5 flex-1 rounded-sm ${
                  i < stories.length ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
          <div className="space-y-1.5 pt-1">
            {loading ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                Loading your stories…
              </p>
            ) : stories.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                No stories yet. Write your first one — start with a project
                you're proud of.
              </p>
            ) : (
              stories.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setReviewing(s)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{s.title}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.themes.map((t) => (
                        <span
                          key={t}
                          className="rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="flex-none text-xs text-muted-foreground">
                    {writtenLabel(s.updatedAt)}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="border-t pt-3">
            <p className="text-xs font-semibold tracking-wider text-primary">
              Themes most-tested for freshers:
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {MOST_TESTED_THEMES.map((t) => (
                <span
                  key={t}
                  className="rounded-md border border-primary/40 bg-white px-2 py-0.5 text-xs font-semibold text-primary"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-common-prompts">
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-semibold">Common prompts</p>
          {COMMON_PROMPTS.map((p) => (
            <div key={p.question} className="rounded-lg border border-common-prompts-border bg-white p-3">
              <p className="text-sm font-semibold">{p.question}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{p.guidance}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold text-primary">
              {complete ? "Prepare step complete" : "Ready to practice?"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {complete
                ? `You've written ${stories.length} stories. Keep going toward 10–12, or head to Practice now.`
                : `Complete at least ${STAR_COMPLETION_THRESHOLD} STAR stories before heading to Practice — ${stories.length} of ${STAR_COMPLETION_THRESHOLD} done. Final goal: 10–12 stories.`}
            </p>
          </div>
          <Button onClick={onGoToPractice} className="flex-none">
            Go to Practice
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {reviewing && (
            <>
              <DialogHeader>
                <DialogTitle>{reviewing.title}</DialogTitle>
                <DialogDescription>
                  Written {writtenLabel(reviewing.updatedAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap gap-1.5">
                {reviewing.themes.map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {SECTIONS.map((sec) => (
                  <div key={sec.key}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                      {sec.label}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {reviewing[sec.key] || "—"}
                    </p>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setReviewing(null)}>
                  Close
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft(toDraft(reviewing));
                    setReviewing(null);
                  }}
                >
                  Edit story
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit story" : "New story"}</DialogTitle>
            <DialogDescription>
              Saved to your account — it'll be here next time you sign in.
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-xs font-semibold">Title</p>
                <Input
                  value={draft.title}
                  onChange={(e) => updateDraft({ title: e.target.value })}
                  placeholder="Shipped an ML pipeline under a 2-week deadline"
                />
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold">Themes</p>
                <div className="flex flex-wrap gap-1.5">
                  {STAR_THEMES.map((t) => {
                    const on = draft.themes.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTheme(t)}
                        className={`rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors ${
                          on
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted/60"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {SECTIONS.map((sec) => (
                <div key={sec.key}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">
                    {sec.label}
                  </p>
                  <Textarea
                    rows={3}
                    value={draft[sec.key]}
                    placeholder={PLACEHOLDERS[sec.key]}
                    onChange={(e) => updateDraft({ [sec.key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={improve} disabled={improving}>
                {improving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" />
                )}
                Improve my story
              </Button>
              {draft?.id && (
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button onClick={saveDraft} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Save story
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this story?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from your account permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep story</AlertDialogCancel>
            <AlertDialogAction onClick={deleteDraft}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StarStoryBuilder;
