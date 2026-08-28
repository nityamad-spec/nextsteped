import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { useCourseType } from "@/hooks/useCourseType";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import SetupModuleNav from "@/components/SetupModuleNav";
import { markStepCompleted, markStepOpened, clearStepCompleted } from "@/lib/setupProgress";

export type SoftSkillActivity = { title: string; body?: string };

export type SoftSkillModule = {
  id: string;
  course_id: string;
  position: number;
  title: string;
  summary: string;
  outcomes: string[];
  activities: SoftSkillActivity[];
  published: boolean;
};

const listToText = (arr: string[]) => arr.join("\n");
const textToList = (text: string) =>
  text.split("\n").map((s) => s.trim()).filter(Boolean);

const SoftSkillsSetup = () => {
  const { user } = useAuth();
  const courseId = useTeacherCourseId();
  const { ready: typeReady, isEmployment } = useCourseType(courseId);
  const [modules, setModules] = useState<SoftSkillModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => {
    if (user && courseId) {
      void markStepOpened(user.id, "soft-skills", courseId, { source: "SoftSkillsSetup.open" });
    }
  }, [user, courseId]);

  useEffect(() => {
    const load = async () => {
      if (!courseId) {
        setModules([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from("course_soft_skills")
        .select("*")
        .eq("course_id", courseId)
        .order("position", { ascending: true });
      setModules(
        (data ?? []).map((row: any) => ({
          id: row.id,
          course_id: row.course_id,
          position: row.position ?? 0,
          title: row.title ?? "",
          summary: row.summary ?? "",
          outcomes: Array.isArray(row.outcomes) ? row.outcomes : [],
          activities: Array.isArray(row.activities) ? (row.activities as SoftSkillActivity[]) : [],
          published: !!row.published,
        })),
      );
      setLoading(false);
    };
    void load();
  }, [courseId]);

  const patchModule = (id: string, patch: Partial<SoftSkillModule>) =>
    setModules((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const patchActivity = (moduleId: string, index: number, patch: Partial<SoftSkillActivity>) =>
    setModules((prev) =>
      prev.map((m) =>
        m.id === moduleId
          ? { ...m, activities: m.activities.map((a, i) => (i === index ? { ...a, ...patch } : a)) }
          : m,
      ),
    );

  const addModule = async () => {
    if (!courseId) {
      toast({ title: "Select a course first", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase
      .from("course_soft_skills")
      .insert({
        course_id: courseId,
        position: modules.length,
        title: "Untitled module",
        summary: "",
        outcomes: [],
        activities: [] as any,
        published: false,
      })
      .select("*")
      .single();
    if (error || !data) {
      toast({ title: "Could not add module", description: error?.message, variant: "destructive" });
      return;
    }
    const row = data as any;
    const mod: SoftSkillModule = {
      id: row.id,
      course_id: row.course_id,
      position: row.position ?? modules.length,
      title: row.title ?? "",
      summary: row.summary ?? "",
      outcomes: Array.isArray(row.outcomes) ? row.outcomes : [],
      activities: Array.isArray(row.activities) ? row.activities : [],
      published: !!row.published,
    };
    setModules((prev) => [...prev, mod]);
    setExpanded((prev) => [...prev, mod.id]);
  };

  const deleteModule = async (id: string) => {
    const { error } = await supabase.from("course_soft_skills").delete().eq("id", id);
    if (error) {
      toast({ title: "Could not delete module", description: error.message, variant: "destructive" });
      return;
    }
    setModules((prev) => prev.filter((m) => m.id !== id));
  };

  const moveModule = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= modules.length) return;
    setModules((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((m, i) => ({ ...m, position: i }));
    });
  };

  const saveAll = async () => {
    if (!courseId) return;
    setSaving(true);
    for (let i = 0; i < modules.length; i++) {
      const m = modules[i];
      const { error } = await supabase
        .from("course_soft_skills")
        .update({
          position: i,
          title: m.title,
          summary: m.summary,
          outcomes: m.outcomes,
          activities: m.activities as any,
          published: m.published,
        })
        .eq("id", m.id);
      if (error) {
        setSaving(false);
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        return;
      }
    }
    if (user) {
      const anyPublished = modules.some((m) => m.published);
      if (anyPublished) {
        void markStepCompleted(user.id, "soft-skills", courseId, { source: "SoftSkillsSetup.save" });
      } else {
        void clearStepCompleted(user.id, "soft-skills", courseId, { source: "SoftSkillsSetup.save" });
      }
    }
    setSaving(false);
    toast({ title: "Soft Skills saved" });
  };

  const publishedCount = modules.filter((m) => m.published).length;

  // Soft Skills only exists for employment-pathway courses.
  if (typeReady && !isEmployment) {
    return <Navigate to="/teacher/setup" replace />;
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Soft Skills</h1>
        <p className="text-muted-foreground mt-1">
          Employment pathway only. Author workplace-readiness modules. Published modules appear as a
          Soft Skills unit in your students' Learning Path.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Modules
            <Badge variant="outline" className="ml-2 text-[10px]">
              {publishedCount} published
            </Badge>
          </CardTitle>
          <Button size="sm" className="gap-2" onClick={() => void addModule()}>
            <Plus className="h-4 w-4" /> New module
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading modules…
            </div>
          ) : modules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No modules yet. Add one to get started — e.g. Communication, Collaboration,
              Professionalism, Interview Readiness.
            </p>
          ) : (
            modules.map((m, index) => {
              const open = expanded.includes(m.id);
              return (
                <div key={m.id} className="rounded-lg border">
                  <div className="flex items-center gap-3 p-4">
                    <span className="font-mono text-xs text-muted-foreground w-6">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{m.title || "Untitled module"}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.summary || "No summary"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Published</span>
                      <Switch
                        checked={m.published}
                        onCheckedChange={(v) => patchModule(m.id, { published: v })}
                      />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => moveModule(index, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => moveModule(index, 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => void deleteModule(m.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setExpanded((prev) =>
                          prev.includes(m.id) ? prev.filter((i) => i !== m.id) : [...prev, m.id],
                        )
                      }
                    >
                      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>

                  {open && (
                    <div className="space-y-4 border-t p-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Title</label>
                        <Input
                          value={m.title}
                          onChange={(e) => patchModule(m.id, { title: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Summary</label>
                        <Input
                          value={m.summary}
                          onChange={(e) => patchModule(m.id, { summary: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Learning outcomes (one per line)</label>
                        <Textarea
                          rows={3}
                          value={listToText(m.outcomes)}
                          onChange={(e) => patchModule(m.id, { outcomes: textToList(e.target.value) })}
                        />
                      </div>

                      <Separator />

                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">Activities</div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() =>
                            patchModule(m.id, {
                              activities: [...m.activities, { title: "New activity" }],
                            })
                          }
                        >
                          <Plus className="h-4 w-4" /> Add activity
                        </Button>
                      </div>

                      {m.activities.map((a, ai) => (
                        <div key={ai} className="rounded-md border p-3 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {ai + 1}
                            </span>
                            <Input
                              className="flex-1"
                              placeholder="Activity title"
                              value={a.title}
                              onChange={(e) => patchActivity(m.id, ai, { title: e.target.value })}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                patchModule(m.id, {
                                  activities: m.activities.filter((_, i) => i !== ai),
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          <Textarea
                            rows={2}
                            placeholder="Instructions or prompt for students (optional)"
                            value={a.body ?? ""}
                            onChange={(e) =>
                              patchActivity(m.id, ai, { body: e.target.value || undefined })
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
              {saving ? "Saving…" : "Save modules"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <SetupModuleNav finishMode nextLabel="Save & Finish" onNext={saveAll} />
    </div>
  );
};

export default SoftSkillsSetup;
