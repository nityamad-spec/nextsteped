import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  EMPTY_CAREER_READINESS,
  MOCK_ACCENTS,
  MOCK_ICONS,
  parseMockTypes,
  parsePairs,
  parseRounds,
  parseSkills,
  parseCareerReadinessRow,
  SEED_MOCK_TYPES,
  SEED_PROMPTS,
  SEED_ROUNDS,
  SEED_TESTED_QUESTIONS,
  SEED_TESTED_SKILLS,
  type CareerReadinessContent,
  type CrMockType,
  type CrQaPair,
  type CrInterviewRound,
} from "@/lib/careerReadinessContent";

type Section = "understand" | "prepare" | "practice";

interface Props {
  courseId: string | null;
}

const sectionLabel: Record<Section, string> = {
  understand: "Understand",
  prepare: "Prepare",
  practice: "Practice (Mock Interview Lab)",
};

/**
 * Professor editor for the student Career Readiness steps.
 * One card per student step, each with an AI draft button, free editing, and a
 * publish switch. Nothing reaches students until the section is saved as published.
 */
const CareerReadinessEditor = ({ courseId }: Props) => {
  const [state, setState] = useState<CareerReadinessContent>(EMPTY_CAREER_READINESS);
  const [loading, setLoading] = useState(true);
  const [drafting, setDrafting] = useState<Section | null>(null);
  const [saving, setSaving] = useState<Section | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!courseId) {
        setState(EMPTY_CAREER_READINESS);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from("course_career_readiness")
        .select("*")
        .eq("course_id", courseId)
        .maybeSingle();
      if (cancelled) return;
      setState(parseCareerReadinessRow(data));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const patch = (p: Partial<CareerReadinessContent>) => setState((s) => ({ ...s, ...p }));

  const draft = async (section: Section) => {
    if (!courseId) return;
    setDrafting(section);
    try {
      const { data, error } = await supabase.functions.invoke("generate-career-readiness-content", {
        body: { course_id: courseId, section },
      });
      if (error) throw error;
      const d = (data as any)?.draft ?? {};
      if (section === "understand") {
        patch({
          interviewRounds: parseRounds(d.interview_rounds),
          testedQuestions: parsePairs(d.tested_questions),
          testedSkills: parseSkills(d.tested_skills),
        });
      } else if (section === "prepare") {
        patch({ commonPrompts: parsePairs(d.common_prompts) });
      } else {
        patch({ mockTypes: parseMockTypes(d.mock_types) });
      }
      toast({ title: "Draft ready", description: "Review and edit before publishing." });
    } catch (e: any) {
      toast({
        title: "Could not draft content",
        description: e?.message ?? "Try again shortly.",
        variant: "destructive",
      });
    } finally {
      setDrafting(null);
    }
  };

  const save = async (section: Section) => {
    if (!courseId) return;
    setSaving(section);
    const row: Record<string, unknown> = {
      course_id: courseId,
      interview_rounds: state.interviewRounds,
      tested_questions: state.testedQuestions,
      tested_skills: state.testedSkills,
      common_prompts: state.commonPrompts,
      mock_types: state.mockTypes,
      understand_published: state.understandPublished,
      prepare_published: state.preparePublished,
      practice_published: state.practicePublished,
    };
    const { error } = await supabase
      .from("course_career_readiness")
      .upsert(row as any, { onConflict: "course_id" });
    setSaving(null);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${sectionLabel[section]} saved` });
  };

  const header = (section: Section, published: boolean, onPublish: (v: boolean) => void) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={!courseId || drafting === section}
        onClick={() => draft(section)}
      >
        {drafting === section ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-1.5 h-4 w-4" />
        )}
        Draft with AI
      </Button>
      <div className="flex items-center gap-2">
        <Switch checked={published} onCheckedChange={onPublish} aria-label="Show to students" />
        <span className="text-xs text-muted-foreground">Show to students</span>
      </div>
      <Button size="sm" disabled={!courseId || saving === section} onClick={() => save(section)}>
        {saving === section && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        Save
      </Button>
    </div>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading career readiness content…
        </CardContent>
      </Card>
    );
  }

  const updateRound = (i: number, p: Partial<CrInterviewRound>) =>
    patch({ interviewRounds: state.interviewRounds.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const updatePair = (key: "testedQuestions" | "commonPrompts", i: number, p: Partial<CrQaPair>) =>
    patch({ [key]: state[key].map((r, j) => (j === i ? { ...r, ...p } : r)) } as any);
  const updateMock = (i: number, p: Partial<CrMockType>) =>
    patch({ mockTypes: state.mockTypes.map((m, j) => (j === i ? { ...m, ...p } : m)) });

  return (
    <div className="space-y-4">
      {/* ── Understand ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Understand — role briefing</CardTitle>
          {header("understand", state.understandPublished, (v) => patch({ understandPublished: v }))}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Interview rounds</p>
              <div className="flex gap-2">
                {state.interviewRounds.length === 0 && (
                  <Button variant="ghost" size="sm" onClick={() => patch({ interviewRounds: SEED_ROUNDS })}>
                    Use sample
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    patch({
                      interviewRounds: [...state.interviewRounds, { title: "", description: "", weight: 0 }],
                    })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> Round
                </Button>
              </div>
            </div>
            {state.interviewRounds.length === 0 && (
              <p className="text-xs text-muted-foreground">No rounds yet.</p>
            )}
            {state.interviewRounds.map((r, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <Input
                    value={r.title}
                    placeholder="Round title"
                    onChange={(e) => updateRound(i, { title: e.target.value })}
                  />
                  <Textarea
                    value={r.description}
                    placeholder="What happens in this round"
                    rows={2}
                    onChange={(e) => updateRound(i, { description: e.target.value })}
                  />
                </div>
                <div className="flex items-start gap-2">
                  <Input
                    className="w-20"
                    type="number"
                    min={0}
                    max={100}
                    value={r.weight}
                    onChange={(e) => updateRound(i, { weight: Number(e.target.value) })}
                    aria-label="Weight percent"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete round"
                    onClick={() =>
                      patch({ interviewRounds: state.interviewRounds.filter((_, j) => j !== i) })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">What they're really testing</p>
              <div className="flex gap-2">
                {state.testedQuestions.length === 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => patch({ testedQuestions: SEED_TESTED_QUESTIONS })}
                  >
                    Use sample
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    patch({ testedQuestions: [...state.testedQuestions, { question: "", guidance: "" }] })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> Question
                </Button>
              </div>
            </div>
            {state.testedQuestions.map((q, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border p-3">
                <div className="flex-1 space-y-2">
                  <Input
                    value={q.question}
                    placeholder="Question"
                    onChange={(e) => updatePair("testedQuestions", i, { question: e.target.value })}
                  />
                  <Textarea
                    value={q.guidance}
                    rows={2}
                    placeholder="What a strong answer does"
                    onChange={(e) => updatePair("testedQuestions", i, { guidance: e.target.value })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete question"
                  onClick={() =>
                    patch({ testedQuestions: state.testedQuestions.filter((_, j) => j !== i) })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Most-tested skills</p>
            <Input
              value={state.testedSkills.join(", ")}
              placeholder="Problem-solving, Communication, Ownership"
              onChange={(e) =>
                patch({
                  testedSkills: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
            {state.testedSkills.length === 0 && (
              <Button variant="ghost" size="sm" onClick={() => patch({ testedSkills: SEED_TESTED_SKILLS })}>
                Use sample
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Comma separated. Company-specific notes stay as they are on the student page.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Prepare ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Prepare — common prompts</CardTitle>
          {header("prepare", state.preparePublished, (v) => patch({ preparePublished: v }))}
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-end gap-2">
            {state.commonPrompts.length === 0 && (
              <Button variant="ghost" size="sm" onClick={() => patch({ commonPrompts: SEED_PROMPTS })}>
                Use sample
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => patch({ commonPrompts: [...state.commonPrompts, { question: "", guidance: "" }] })}
            >
              <Plus className="mr-1 h-4 w-4" /> Prompt
            </Button>
          </div>
          {state.commonPrompts.length === 0 && (
            <p className="text-xs text-muted-foreground">No prompts yet.</p>
          )}
          {state.commonPrompts.map((p, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border p-3">
              <div className="flex-1 space-y-2">
                <Input
                  value={p.question}
                  placeholder="Prompt"
                  onChange={(e) => updatePair("commonPrompts", i, { question: e.target.value })}
                />
                <Textarea
                  value={p.guidance}
                  rows={2}
                  placeholder="Guidance for students"
                  onChange={(e) => updatePair("commonPrompts", i, { guidance: e.target.value })}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete prompt"
                onClick={() => patch({ commonPrompts: state.commonPrompts.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Practice ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Practice — mock interview types</CardTitle>
          {header("practice", state.practicePublished, (v) => patch({ practicePublished: v }))}
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-end gap-2">
            {state.mockTypes.length === 0 && (
              <Button variant="ghost" size="sm" onClick={() => patch({ mockTypes: SEED_MOCK_TYPES })}>
                Use sample
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                patch({
                  mockTypes: [
                    ...state.mockTypes,
                    {
                      id: `mock-${state.mockTypes.length + 1}`,
                      title: "",
                      minutes: 45,
                      description: "",
                      icon: MOCK_ICONS[state.mockTypes.length % MOCK_ICONS.length],
                      accent: MOCK_ACCENTS[state.mockTypes.length % MOCK_ACCENTS.length],
                      target: 8,
                      prompt: { question: "", followUp: "" },
                    },
                  ],
                })
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Mock type
            </Button>
          </div>
          {state.mockTypes.length === 0 && (
            <p className="text-xs text-muted-foreground">No mock types yet.</p>
          )}
          {state.mockTypes.map((m, i) => (
            <div key={m.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <Input
                  value={m.title}
                  placeholder="Mock type title"
                  onChange={(e) => updateMock(i, { title: e.target.value })}
                />
                <Input
                  className="w-24"
                  type="number"
                  min={5}
                  max={180}
                  value={m.minutes}
                  aria-label="Minutes"
                  onChange={(e) => updateMock(i, { minutes: Number(e.target.value) })}
                />
                <Input
                  className="w-24"
                  type="number"
                  min={1}
                  max={50}
                  value={m.target}
                  aria-label="Target mocks"
                  onChange={(e) => updateMock(i, { target: Number(e.target.value) })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete mock type"
                  onClick={() => patch({ mockTypes: state.mockTypes.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Input
                value={m.description}
                placeholder="One-line description"
                onChange={(e) => updateMock(i, { description: e.target.value })}
              />
              <Textarea
                value={m.prompt.question}
                rows={2}
                placeholder="Session question"
                onChange={(e) => updateMock(i, { prompt: { ...m.prompt, question: e.target.value } })}
              />
              <Textarea
                value={m.prompt.followUp}
                rows={2}
                placeholder="Follow-up probe"
                onChange={(e) => updateMock(i, { prompt: { ...m.prompt, followUp: e.target.value } })}
              />
              <p className="text-xs text-muted-foreground">Minutes · target mocks per student</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default CareerReadinessEditor;
