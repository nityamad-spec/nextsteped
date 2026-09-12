import { useMemo, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  COMMON_PROMPTS,
  coveredThemes,
  DEMO_STAR_STORIES,
  MOST_TESTED_THEMES,
  STAR_TARGET_STORIES,
  STAR_THEMES,
  type StarStory,
} from "@/lib/starStories";

interface Props {
  targetRole?: string | null;
}

const emptyStory = (): StarStory => ({
  id: `local-${Date.now()}`,
  title: "",
  themes: [],
  situation: "",
  task: "",
  action: "",
  result: "",
  writtenLabel: "just now",
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
 * Demo content only — stories live in page state and reset on refresh.
 */
const StarStoryBuilder = ({ targetRole }: Props) => {
  const [stories, setStories] = useState<StarStory[]>(DEMO_STAR_STORIES);
  const [draft, setDraft] = useState<StarStory | null>(null);
  const [reviewing, setReviewing] = useState<StarStory | null>(null);
  const [improving, setImproving] = useState(false);

  const covered = useMemo(() => coveredThemes(stories), [stories]);
  const coverageSlots = Array.from({ length: STAR_TARGET_STORIES });

  const updateDraft = (patch: Partial<StarStory>) =>
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

  const saveDraft = () => {
    if (!draft) return;
    const title = draft.title.trim() || "Untitled story";
    setStories((prev) => {
      const next = { ...draft, title };
      const i = prev.findIndex((s) => s.id === draft.id);
      if (i === -1) return [next, ...prev];
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
    setDraft(null);
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
      const improved = (data as { improved?: Partial<StarStory> })?.improved;
      if (!improved) throw new Error("no_result");
      updateDraft({
        title: improved.title ?? draft.title,
        situation: improved.situation ?? draft.situation,
        task: improved.task ?? draft.task,
        action: improved.action ?? draft.action,
        result: improved.result ?? draft.result,
      });
      toast.success("Rewritten — review it before you save.");
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
            Step 2 · Prepare — STAR story builder · {stories.length}/
            {STAR_TARGET_STORIES}
          </p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Prepare 10–12 crisp STAR stories. Each under 2 minutes with concrete
            numbers. Cover: led something, conflict, failure, proud project,
            learned fast, disagreed, missed deadline, delivered under ambiguity.
          </p>
        </div>
        <Button onClick={() => setDraft(emptyStory())}>
          + New STAR story
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Your STAR Stories</p>
            <p className="text-xs text-muted-foreground">
              {stories.length}/{STAR_TARGET_STORIES} stories
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
            {stories.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setReviewing(s)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{s.title}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.themes.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary"
                      >
                        {t}
                      </span>
                    ))}
                    {s.themes.length > 2 && (
                      <span className="px-0.5 text-[11px] text-muted-foreground">
                        +{s.themes.length - 2}
                      </span>
                    )}
                  </div>
                </div>
                <span className="flex-none text-xs text-muted-foreground">
                  {s.writtenLabel}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Themes most-tested for freshers
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {MOST_TESTED_THEMES.map((t) => (
                <span
                  key={t}
                  className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-semibold">Common prompts</p>
          {COMMON_PROMPTS.map((p) => (
            <div key={p.question} className="rounded-lg border p-3">
              <p className="text-sm font-semibold">{p.question}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{p.guidance}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {reviewing && (
            <>
              <DialogHeader>
                <DialogTitle>{reviewing.title}</DialogTitle>
                <DialogDescription>
                  Written {reviewing.writtenLabel}
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
                    setDraft(reviewing);
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
            <DialogTitle>
              {draft && stories.some((s) => s.id === draft.id)
                ? "Edit story"
                : "New story"}
            </DialogTitle>
            <DialogDescription>
              Stories aren't saved to your account yet — they stay until you
              refresh the page.
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
            <Button variant="outline" onClick={improve} disabled={improving}>
              {improving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-4 w-4" />
              )}
              Improve my story
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button onClick={saveDraft}>Save story</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StarStoryBuilder;
