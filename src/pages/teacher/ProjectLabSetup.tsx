import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  FlaskConical,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import SetupModuleNav from "@/components/SetupModuleNav";
import { markStepCompleted, markStepOpened, clearStepCompleted } from "@/lib/setupProgress";
import {
  PROJECT_LAB_TEMPLATES,
  emptyLab,
  type ProjectLab,
  type ProjectLabStep,
} from "@/config/projectLabTemplates";

const listToText = (arr: string[]) => arr.join("\n");
const textToList = (text: string) =>
  text.split("\n").map((s) => s.trim()).filter(Boolean);

const ProjectLabSetup = () => {
  const { user } = useAuth();
  const courseId = useTeacherCourseId();
  const [labs, setLabs] = useState<ProjectLab[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => {
    if (user && courseId) {
      void markStepOpened(user.id, "project-lab", courseId, { source: "ProjectLabSetup.open" });
    }
  }, [user, courseId]);

  useEffect(() => {
    const load = async () => {
      if (!courseId) {
        setLabs([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from("course_project_labs")
        .select("*")
        .eq("course_id", courseId)
        .order("position", { ascending: true });
      setLabs(
        (data ?? []).map((row: any) => ({
          id: row.id,
          course_id: row.course_id,
          position: row.position ?? 0,
          title: row.title ?? "",
          summary: row.summary ?? "",
          tags: Array.isArray(row.tags) ? row.tags : [],
          mission: row.mission ?? "",
          caution: row.caution ?? null,
          learnings: Array.isArray(row.learnings) ? row.learnings : [],
          steps: Array.isArray(row.steps) ? (row.steps as ProjectLabStep[]) : [],
          published: !!row.published,
        })),
      );
      setLoading(false);
    };
    void load();
  }, [courseId]);

  const patchLab = (id: string, patch: Partial<ProjectLab>) =>
    setLabs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const patchStep = (labId: string, index: number, patch: Partial<ProjectLabStep>) =>
    setLabs((prev) =>
      prev.map((l) =>
        l.id === labId
          ? { ...l, steps: l.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) }
          : l,
      ),
    );

  const addLab = async (draft = emptyLab(), fromTemplate = false) => {
    if (!courseId) {
      toast({ title: "Select a course first", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase
      .from("course_project_labs")
      .insert({
        course_id: courseId,
        position: labs.length,
        title: draft.title || "Untitled lab",
        summary: draft.summary,
        tags: draft.tags,
        mission: draft.mission,
        caution: draft.caution,
        learnings: draft.learnings,
        steps: draft.steps as any,
        published: fromTemplate ? draft.published : false,
      })
      .select("*")
      .single();
    if (error || !data) {
      toast({ title: "Could not add lab", description: error?.message, variant: "destructive" });
      return;
    }
    const lab = { ...(data as any), steps: (data as any).steps ?? [] } as ProjectLab;
    setLabs((prev) => [...prev, lab]);
    setExpanded((prev) => [...prev, lab.id]);
  };

  const deleteLab = async (id: string) => {
    const { error } = await supabase.from("course_project_labs").delete().eq("id", id);
    if (error) {
      toast({ title: "Could not delete lab", description: error.message, variant: "destructive" });
      return;
    }
    setLabs((prev) => prev.filter((l) => l.id !== id));
  };

  const duplicateLab = async (lab: ProjectLab) => {
    await addLab({ ...lab, title: `${lab.title} (copy)`, published: false }, false);
  };

  const moveLab = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= labs.length) return;
    setLabs((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((l, i) => ({ ...l, position: i }));
    });
  };

  const moveStep = (labId: string, index: number, delta: number) =>
    setLabs((prev) =>
      prev.map((l) => {
        if (l.id !== labId) return l;
        const target = index + delta;
        if (target < 0 || target >= l.steps.length) return l;
        const steps = [...l.steps];
        [steps[index], steps[target]] = [steps[target], steps[index]];
        return { ...l, steps };
      }),
    );

  const saveAll = async () => {
    if (!courseId) return;
    setSaving(true);
    for (let i = 0; i < labs.length; i++) {
      const lab = labs[i];
      const { error } = await supabase
        .from("course_project_labs")
        .update({
          position: i,
          title: lab.title,
          summary: lab.summary,
          tags: lab.tags,
          mission: lab.mission,
          caution: lab.caution,
          learnings: lab.learnings,
          steps: lab.steps as any,
          published: lab.published,
        })
        .eq("id", lab.id);
      if (error) {
        setSaving(false);
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        return;
      }
    }
    if (user) {
      const anyPublished = labs.some((l) => l.published);
      if (anyPublished) {
        void markStepCompleted(user.id, "project-lab", courseId, { source: "ProjectLabSetup.save" });
      } else {
        void clearStepCompleted(user.id, "project-lab", courseId, { source: "ProjectLabSetup.save" });
      }
    }
    setSaving(false);
    toast({ title: "Project Lab saved" });
  };

  const publishedCount = labs.filter((l) => l.published).length;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Project Lab</h1>
        <p className="text-muted-foreground mt-1">
          Optional. Author hands-on labs for your students. Only published labs appear in the
          student Project Lab tab — if nothing is published, the tab is hidden entirely.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-primary" />
            Labs
            <Badge variant="outline" className="ml-2 text-[10px]">
              {publishedCount} published
            </Badge>
          </CardTitle>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="h-4 w-4" /> Add starter lab
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {PROJECT_LAB_TEMPLATES.map((t) => (
                  <DropdownMenuItem key={t.title} onClick={() => void addLab(t, true)}>
                    {t.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="gap-2" onClick={() => void addLab()}>
              <Plus className="h-4 w-4" /> New lab
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading labs…
            </div>
          ) : labs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No labs yet. Add a starter lab or create your own.
            </p>
          ) : (
            labs.map((lab, index) => {
              const open = expanded.includes(lab.id);
              return (
                <div key={lab.id} className="rounded-lg border">
                  <div className="flex items-center gap-3 p-4">
                    <span className="font-mono text-xs text-muted-foreground w-6">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {lab.title || "Untitled lab"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {lab.summary || "No summary"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Published</span>
                      <Switch
                        checked={lab.published}
                        onCheckedChange={(v) => patchLab(lab.id, { published: v })}
                      />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => moveLab(index, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => moveLab(index, 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => void duplicateLab(lab)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => void deleteLab(lab.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setExpanded((prev) =>
                          prev.includes(lab.id) ? prev.filter((i) => i !== lab.id) : [...prev, lab.id],
                        )
                      }
                    >
                      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>

                  {open && (
                    <div className="space-y-4 border-t p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium">Title</label>
                          <Input
                            value={lab.title}
                            onChange={(e) => patchLab(lab.id, { title: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium">Tags (comma separated)</label>
                          <Input
                            value={lab.tags.join(", ")}
                            onChange={(e) =>
                              patchLab(lab.id, {
                                tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Summary</label>
                        <Input
                          value={lab.summary}
                          onChange={(e) => patchLab(lab.id, { summary: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Mission</label>
                        <Textarea
                          rows={3}
                          value={lab.mission}
                          onChange={(e) => patchLab(lab.id, { mission: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium">Caution note (optional)</label>
                          <Textarea
                            rows={2}
                            value={lab.caution ?? ""}
                            onChange={(e) => patchLab(lab.id, { caution: e.target.value || null })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium">
                            What you'll learn (one per line)
                          </label>
                          <Textarea
                            rows={2}
                            value={listToText(lab.learnings)}
                            onChange={(e) => patchLab(lab.id, { learnings: textToList(e.target.value) })}
                          />
                        </div>
                      </div>

                      <Separator />

                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">Instructions</div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() =>
                            patchLab(lab.id, { steps: [...lab.steps, { title: "New step" }] })
                          }
                        >
                          <Plus className="h-4 w-4" /> Add step
                        </Button>
                      </div>

                      {lab.steps.map((step, si) => (
                        <div key={si} className="rounded-md border p-3 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {si + 1}
                            </span>
                            <Input
                              className="flex-1"
                              placeholder="Step title"
                              value={step.title}
                              onChange={(e) => patchStep(lab.id, si, { title: e.target.value })}
                            />
                            <Button variant="ghost" size="icon" onClick={() => moveStep(lab.id, si, -1)}>
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => moveStep(lab.id, si, 1)}>
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                patchLab(lab.id, { steps: lab.steps.filter((_, i) => i !== si) })
                              }
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>

                          <Textarea
                            rows={2}
                            placeholder="Step description (optional)"
                            value={step.body ?? ""}
                            onChange={(e) => patchStep(lab.id, si, { body: e.target.value || undefined })}
                          />

                          <div className="grid gap-2 md:grid-cols-2">
                            <Input
                              placeholder="Link label (optional)"
                              value={step.link?.label ?? ""}
                              onChange={(e) =>
                                patchStep(lab.id, si, {
                                  link: e.target.value || step.link?.href
                                    ? { label: e.target.value, href: step.link?.href ?? "" }
                                    : undefined,
                                })
                              }
                            />
                            <Input
                              placeholder="https://…"
                              value={step.link?.href ?? ""}
                              onChange={(e) =>
                                patchStep(lab.id, si, {
                                  link: e.target.value || step.link?.label
                                    ? { label: step.link?.label ?? "Open link", href: e.target.value }
                                    : undefined,
                                })
                              }
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">Prompt blocks (one per line)</label>
                            <Textarea
                              rows={2}
                              value={listToText((step.prompts ?? []).map((p) => p.text))}
                              onChange={(e) => {
                                const texts = textToList(e.target.value);
                                patchStep(lab.id, si, {
                                  prompts: texts.length
                                    ? texts.map((text, i) => ({
                                        label: step.prompts?.[i]?.label,
                                        text,
                                      }))
                                    : undefined,
                                });
                              }}
                            />
                          </div>

                          <div className="grid gap-2 md:grid-cols-2">
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium">
                                Tiles — "Title | description" per line
                              </label>
                              <Textarea
                                rows={2}
                                value={listToText(
                                  (step.tiles ?? []).map((t) =>
                                    t.body ? `${t.title} | ${t.body}` : t.title,
                                  ),
                                )}
                                onChange={(e) => {
                                  const rows = textToList(e.target.value).map((line) => {
                                    const [title, ...rest] = line.split("|");
                                    return {
                                      title: title.trim(),
                                      body: rest.join("|").trim() || undefined,
                                    };
                                  });
                                  patchStep(lab.id, si, { tiles: rows.length ? rows : undefined });
                                }}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium">Checklist (one per line)</label>
                              <Textarea
                                rows={2}
                                value={listToText(step.checks ?? [])}
                                onChange={(e) => {
                                  const checks = textToList(e.target.value);
                                  patchStep(lab.id, si, { checks: checks.length ? checks : undefined });
                                }}
                              />
                            </div>
                          </div>

                          <Input
                            placeholder="Footnote (optional)"
                            value={step.footnote ?? ""}
                            onChange={(e) =>
                              patchStep(lab.id, si, { footnote: e.target.value || undefined })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div className="flex justify-end">
            <Button onClick={() => void saveAll()} disabled={saving || loading}>
              {saving ? "Saving…" : "Save labs"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <SetupModuleNav finishMode nextLabel="Save & Finish" onNext={saveAll} />
    </div>
  );
};

export default ProjectLabSetup;
