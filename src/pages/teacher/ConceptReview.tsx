import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Plus, X, Loader2, Sparkles, Check, RefreshCw, Info, ListOrdered, Lightbulb, Pencil, Briefcase, Layers, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { bumpCacheVersion } from "@/lib/cacheVersion";
import { markStepCompleted } from "@/lib/setupProgress";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function ProgressWithETA({ etaSeconds, label }: { etaSeconds: number; label: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const pct = Math.min(92, (elapsed / etaSeconds) * 90);
  const over = elapsed > etaSeconds;
  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{label}</span>
      </div>
      <Progress value={pct} className="h-2" />
      <p className="text-xs text-muted-foreground">
        {over
          ? `Taking longer than usual… (${fmt(elapsed)})`
          : `Elapsed ${fmt(elapsed)} · Est. ~${etaSeconds}s`}
      </p>
    </div>
  );
}

interface Concept {
  id: string;
  concept_code: string;
  weight: number;
  course_id: string;
}

interface Suggestion {
  name: string;
  rationale: string;
  unit_number?: number;
  unit_title?: string;
  weight_pct?: number;
  weight_rationale?: string;
}

type RecCategory = "industry" | "foundational" | "gap";
interface Recommendation {
  name: string;
  rationale: string;
  category: RecCategory;
  weight_pct?: number;
  weight_rationale?: string;
}

const ConceptReview = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const courseId = useTeacherCourseId();

  const [loading, setLoading] = useState(true);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [newConcept, setNewConcept] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [unitCoverage, setUnitCoverage] = useState<Record<number, { covered: number; total: number; missing: string[] }>>({});
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsRequested, setSuggestionsRequested] = useState(false);
  const [addingUnitKey, setAddingUnitKey] = useState<string | null>(null);

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [recsRequested, setRecsRequested] = useState(false);
  const [editingRecName, setEditingRecName] = useState<string | null>(null);
  const [editingRecValue, setEditingRecValue] = useState("");

  // Editable weight (percent) keyed by concept name
  const [weights, setWeights] = useState<Record<string, number>>({});
  const setWeight = (name: string, pct: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(pct) || 0));
    setWeights((prev) => ({ ...prev, [name]: clamped }));
  };
  const getWeight = (name: string, fallback?: number) =>
    weights[name] ?? (typeof fallback === "number" ? fallback : 0);

  const fetchConcepts = async () => {
    if (!courseId) return;
    const { data, error } = await supabase
      .from("concepts")
      .select("*")
      .eq("course_id", courseId)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Failed to load concepts: " + error.message);
    } else {
      setConcepts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!courseId) {
      setLoading(false);
      return;
    }
    fetchConcepts();
  }, [courseId]);

  const fetchSuggestions = async () => {
    if (!courseId) return;
    setLoadingSuggestions(true);
    setSuggestionsRequested(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-concepts", {
        body: {
          courseId,
          existingConcepts: concepts.map((c) => c.concept_code),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const incoming: Suggestion[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
      const existingLc = new Set(concepts.map((c) => c.concept_code.trim().toLowerCase()));
      const filtered = incoming.filter((s) => !existingLc.has(s.name.trim().toLowerCase()));
      setSuggestions(filtered);
      const cov: Record<number, { covered: number; total: number; missing: string[] }> = {};
      if (Array.isArray(data?.units)) {
        for (const u of data.units) {
          if (u && typeof u.unit_number === "number" && u.coverage) {
            cov[u.unit_number] = u.coverage;
          }
        }
      }
      setUnitCoverage(cov);
      setWeights((prev) => {
        const next = { ...prev };
        for (const s of filtered) {
          if (typeof s.weight_pct === "number") next[s.name] = s.weight_pct;
        }
        return next;
      });
      if (filtered.length === 0 && data?.warning) {
        toast.warning(data.warning);
      } else if (data?.reason && data.reason !== "ok" && data?.warning) {
        toast.warning(data.warning);
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to fetch suggestions");
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleAddManual = async () => {
    const name = newConcept.trim();
    if (!name || !courseId) return;
    setAdding(true);
    const { data, error } = await supabase
      .from("concepts")
      .insert({ concept_code: name, weight: 0, course_id: courseId })
      .select("*")
      .single();
    if (error) {
      toast.error("Failed to add concept: " + error.message);
    } else if (data) {
      setConcepts((prev) => [...prev, data]);
      setNewConcept("");
      bumpCacheVersion("concepts", courseId);
    }
    setAdding(false);
  };

  const handleAddSuggestion = async (s: Suggestion) => {
    if (!courseId) return;
    const pct = getWeight(s.name, s.weight_pct);
    const { data, error } = await supabase
      .from("concepts")
      .insert({ concept_code: s.name, weight: pct / 100, course_id: courseId })
      .select("*")
      .single();
    if (error) {
      toast.error("Failed to add suggestion: " + error.message);
      return;
    }
    if (data) {
      setConcepts((prev) => [...prev, data]);
      setSuggestions((prev) => prev.filter((x) => x.name !== s.name));
      bumpCacheVersion("concepts", courseId);
    }
  };

  const handleAddAllInUnit = async (unitKey: string, items: Suggestion[]) => {
    if (!courseId || items.length === 0) return;
    setAddingUnitKey(unitKey);
    const rows = items.map((s) => ({
      concept_code: s.name,
      weight: getWeight(s.name, s.weight_pct) / 100,
      course_id: courseId,
    }));
    const { data, error } = await supabase
      .from("concepts")
      .insert(rows)
      .select("*");
    if (error) {
      toast.error("Failed to add concepts: " + error.message);
      setAddingUnitKey(null);
      return;
    }
    if (data && data.length > 0) {
      setConcepts((prev) => [...prev, ...data]);
      const addedNames = new Set(items.map((s) => s.name));
      setSuggestions((prev) => prev.filter((x) => !addedNames.has(x.name)));
      bumpCacheVersion("concepts", courseId);
      toast.success(`Added ${data.length} concept${data.length === 1 ? "" : "s"}`);
    }
    setAddingUnitKey(null);
  };

  const handleDismissSuggestion = (s: Suggestion) => {
    setSuggestions((prev) => prev.filter((x) => x.name !== s.name));
  };

  const fetchRecommendations = async () => {
    if (!courseId) return;
    setLoadingRecs(true);
    setRecsRequested(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "recommend-additional-concepts",
        {
          body: {
            courseId,
            existingConcepts: concepts.map((c) => c.concept_code),
          },
        },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const incoming: Recommendation[] = Array.isArray(data?.recommendations)
        ? data.recommendations
        : [];
      const existingLc = new Set(
        concepts.map((c) => c.concept_code.trim().toLowerCase()),
      );
      const filteredRecs = incoming.filter((r) => !existingLc.has(r.name.trim().toLowerCase()));
      setRecommendations(filteredRecs);
      setWeights((prev) => {
        const next = { ...prev };
        for (const r of filteredRecs) {
          if (typeof r.weight_pct === "number") next[r.name] = r.weight_pct;
        }
        return next;
      });
    } catch (e: any) {
      toast.error(e?.message || "Failed to fetch recommendations");
      setRecommendations([]);
    } finally {
      setLoadingRecs(false);
    }
  };

  const handleApproveRecommendation = async (r: Recommendation) => {
    if (!courseId) return;
    const pct = getWeight(r.name, r.weight_pct);
    const { data, error } = await supabase
      .from("concepts")
      .insert({ concept_code: r.name, weight: pct / 100, course_id: courseId })
      .select("*")
      .single();
    if (error) {
      toast.error("Failed to add: " + error.message);
      return;
    }
    if (data) {
      setConcepts((prev) => [...prev, data]);
      setRecommendations((prev) => prev.filter((x) => x.name !== r.name));
      bumpCacheVersion("concepts", courseId);
    }
  };

  const handleDismissRecommendation = (r: Recommendation) => {
    setRecommendations((prev) => prev.filter((x) => x.name !== r.name));
  };

  const startEditRec = (r: Recommendation) => {
    setEditingRecName(r.name);
    setEditingRecValue(r.name);
  };

  const cancelEditRec = () => {
    setEditingRecName(null);
    setEditingRecValue("");
  };

  const saveEditRec = (r: Recommendation) => {
    const next = editingRecValue.trim();
    if (!next) return;
    setRecommendations((prev) =>
      prev.map((x) => (x.name === r.name ? { ...x, name: next } : x)),
    );
    cancelEditRec();
  };


  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("concepts").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete: " + error.message);
      return;
    }
    setConcepts((prev) => prev.filter((c) => c.id !== id));
    setConfirmDeleteId(null);
    if (courseId) bumpCacheVersion("concepts", courseId);
  };

  const handleUpdateWeight = async (id: string, pct: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(Number.isFinite(pct) ? pct : 0)));
    const prev = concepts;
    const target = prev.find((c) => c.id === id);
    if (!target) return;
    const prevPct = Math.round(Number(target.weight) * 100);
    if (prevPct === clamped) return;
    setConcepts((cs) => cs.map((c) => (c.id === id ? { ...c, weight: clamped / 100 } : c)));
    const { error } = await supabase
      .from("concepts")
      .update({ weight: clamped / 100 })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update weight: " + error.message);
      setConcepts(prev);
      return;
    }
    if (courseId) bumpCacheVersion("concepts", courseId);
  };


  const handleContinue = () => {
    if (concepts.length === 0) {
      toast.error("Please confirm at least one concept before continuing.");
      return;
    }
    if (user?.id && courseId) void markStepCompleted(user.id, "concept-review", courseId);
    navigate("/teacher/setup/lesson-plan");
  };

  if (!courseId) {
    return (
      <div className="p-6 md:p-8">
        <div className="mx-auto max-w-3xl">
          <Button variant="outline" size="sm" onClick={() => navigate("/teacher/setup")} className="gap-2 mb-4">
            <ArrowLeft className="h-4 w-4" /> Back to Course Setup
          </Button>
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No course found yet. Please complete the previous steps first.
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Button variant="outline" size="sm" onClick={() => navigate("/teacher/setup")} className="gap-2 mb-4">
            <ArrowLeft className="h-4 w-4" /> Back to Course Setup
          </Button>
          <h1 className="font-heading text-3xl font-bold">Concept Review</h1>
          <p className="text-muted-foreground mt-1">
            These are the concepts we identified based on your uploaded course materials.
          </p>
        </div>

        {/* Identify Concepts — primary trigger */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Identify Concepts
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Scan your uploaded course materials to extract concepts you can review and confirm below.
              </p>
            </div>
            <Button
              onClick={fetchSuggestions}
              disabled={loadingSuggestions}
              className="shrink-0"
            >
              {loadingSuggestions ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Identifying…</>
              ) : suggestionsRequested ? (
                <><RefreshCw className="h-4 w-4 mr-2" /> Re-identify Concepts</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Identify Concepts</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Extracted concepts */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Extracted Concepts
            </CardTitle>
            <CardDescription>
              Concepts identified from your uploaded course materials. Add the ones that fit — individually or by unit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!suggestionsRequested && !loadingSuggestions ? (
              <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Click "Identify Concepts" above to extract concepts from your materials.
              </div>
            ) : loadingSuggestions ? (
              <ProgressWithETA
                etaSeconds={45}
                label="Scanning materials and extracting concepts per unit…"
              />
            ) : suggestions.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                No additional concepts to extract. Your confirmed list looks complete.
              </div>
            ) : (
              <div className="space-y-5">
                {(() => {
                  const groups: { key: string; unit_number?: number; unit_title?: string; items: Suggestion[] }[] = [];
                  const indexByKey = new Map<string, number>();
                  for (const s of suggestions) {
                    const key = s.unit_number != null ? `u-${s.unit_number}` : "other";
                    if (!indexByKey.has(key)) {
                      indexByKey.set(key, groups.length);
                      groups.push({
                        key,
                        unit_number: s.unit_number,
                        unit_title: s.unit_title,
                        items: [],
                      });
                    }
                    groups[indexByKey.get(key)!].items.push(s);
                  }
                  return groups.map((g) => (
                    <div key={g.key} className="space-y-2">
                      <div className="flex items-center justify-between gap-2 px-1">
                        <div className="flex items-center gap-2 min-w-0">
                          {g.unit_number != null ? (
                            <>
                              <Badge variant="secondary" className="text-[10px] font-semibold shrink-0">
                                Unit {g.unit_number}
                              </Badge>
                              <span className="text-xs font-medium text-foreground truncate">
                                {g.unit_title || ""}
                              </span>
                              {g.unit_number != null && unitCoverage[g.unit_number] && unitCoverage[g.unit_number].total > 0 && (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] shrink-0 ${
                                    unitCoverage[g.unit_number].covered === unitCoverage[g.unit_number].total
                                      ? "border-green-500/40 text-green-600"
                                      : "border-amber-500/40 text-amber-600"
                                  }`}
                                  title={
                                    unitCoverage[g.unit_number].missing.length
                                      ? `Missing: ${unitCoverage[g.unit_number].missing.join("; ")}`
                                      : "All topics covered"
                                  }
                                >
                                  Covers {unitCoverage[g.unit_number].covered}/{unitCoverage[g.unit_number].total} topics
                                </Badge>
                              )}
                            </>
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground">Other</span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs shrink-0"
                          onClick={() => handleAddAllInUnit(g.key, g.items)}
                          disabled={addingUnitKey === g.key}
                        >
                          {addingUnitKey === g.key ? (
                            <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Adding…</>
                          ) : (
                            <><Plus className="h-3 w-3 mr-1" /> Add All ({g.items.length})</>
                          )}
                        </Button>
                      </div>
                      {g.items.map((s) => (
                        <div
                          key={s.name}
                          className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 flex items-start gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold">{s.name}</p>
                              <Badge variant="outline" className="text-[10px] gap-0.5 border-primary/30 text-primary">
                                <Sparkles className="h-2.5 w-2.5" /> Extracted
                              </Badge>
                              <div className="flex items-center gap-1 ml-auto sm:ml-0">
                                <span className="text-[10px] text-muted-foreground">Weight</span>
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={getWeight(s.name, s.weight_pct)}
                                  onChange={(e) => setWeight(s.name, parseInt(e.target.value, 10))}
                                  className="h-6 w-14 px-1.5 text-xs"
                                />
                                <span className="text-[10px] text-muted-foreground">%</span>
                              </div>
                            </div>
                            {s.rationale && (
                              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.rationale}</p>
                            )}
                            {s.weight_rationale && (
                              <p className="text-[11px] text-muted-foreground/80 mt-0.5 italic leading-relaxed">
                                Why this weight: {s.weight_rationale}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleAddSuggestion(s)}>
                              <Plus className="h-3 w-3 mr-1" /> Add
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleDismissSuggestion(s)}>
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ));
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Additional Concept Recommendations */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" /> Additional Concept Recommendations
            </CardTitle>
            <CardDescription>
              Concepts that weren't in your syllabus but may be worth covering — including industry-alignment topics employers commonly look for, foundational prerequisites, and general gaps. Approve, edit, or dismiss each. Approved recommendations flow into your final concept list and lesson plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Recommendations are generated based on your course objectives, syllabus, and currently confirmed concepts.
              </p>
              <Button
                onClick={fetchRecommendations}
                disabled={loadingRecs}
                size="sm"
                className="shrink-0"
              >
                {loadingRecs ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating…</>
                ) : recsRequested ? (
                  <><RefreshCw className="h-4 w-4 mr-2" /> Re-generate</>
                ) : (
                  <><Lightbulb className="h-4 w-4 mr-2" /> Generate Recommendations</>
                )}
              </Button>
            </div>

            {!recsRequested && !loadingRecs ? (
              <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Click "Generate Recommendations" to surface additional concepts that may strengthen your course.
              </div>
            ) : loadingRecs ? (
              <ProgressWithETA
                etaSeconds={20}
                label="Reviewing your syllabus and confirmed concepts for gaps…"
              />
            ) : recommendations.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                No additional recommendations right now. Your confirmed list looks well-rounded.
              </div>
            ) : (
              <div className="space-y-2">
                {recommendations.map((r) => {
                  const isEditing = editingRecName === r.name;
                  const catMeta =
                    r.category === "industry"
                      ? { label: "Industry", Icon: Briefcase, cls: "border-primary/30 text-primary" }
                      : r.category === "foundational"
                      ? { label: "Foundational", Icon: Layers, cls: "border-warning/40 text-warning" }
                      : { label: "Gap", Icon: AlertCircle, cls: "border-muted-foreground/40 text-muted-foreground" };
                  const CatIcon = catMeta.Icon;
                  return (
                    <div
                      key={r.name}
                      className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 flex items-start gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isEditing ? (
                            <Input
                              autoFocus
                              value={editingRecValue}
                              onChange={(e) => setEditingRecValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  saveEditRec(r);
                                } else if (e.key === "Escape") {
                                  cancelEditRec();
                                }
                              }}
                              className="h-7 text-sm max-w-xs"
                            />
                          ) : (
                            <p className="text-sm font-semibold">{r.name}</p>
                          )}
                          <Badge variant="outline" className={`text-[10px] gap-0.5 ${catMeta.cls}`}>
                            <CatIcon className="h-2.5 w-2.5" /> {catMeta.label}
                          </Badge>
                          <div className="flex items-center gap-1 ml-auto sm:ml-0">
                            <span className="text-[10px] text-muted-foreground">Weight</span>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={getWeight(r.name, r.weight_pct)}
                              onChange={(e) => setWeight(r.name, parseInt(e.target.value, 10))}
                              className="h-6 w-14 px-1.5 text-xs"
                            />
                            <span className="text-[10px] text-muted-foreground">%</span>
                          </div>
                        </div>
                        {r.rationale && (
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.rationale}</p>
                        )}
                        {r.weight_rationale && (
                          <p className="text-[11px] text-muted-foreground/80 mt-0.5 italic leading-relaxed">
                            Why this weight: {r.weight_rationale}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isEditing ? (
                          <>
                            <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => saveEditRec(r)}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEditRec}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleApproveRecommendation(r)}>
                              <Check className="h-3 w-3 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => startEditRec(r)}
                              title="Edit name"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleDismissRecommendation(r)}>
                              Dismiss
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Confirmed concepts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Check className="h-5 w-5 text-primary" /> Confirmed Concepts
            </CardTitle>
            <CardDescription>
              {concepts.length} concept{concepts.length === 1 ? "" : "s"} will be used to generate your lesson plan. You can delete irrelevant concepts or add any that were missed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Sequencing note */}
            <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
              <ListOrdered className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Concepts are numbered in the order they appear in your syllabus and sequenced in a structured, pedagogically informed order to support effective teaching progression. Numbers update automatically as you add or remove concepts.
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : concepts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No concepts confirmed yet. Use "Identify Concepts" above or add one manually below.
              </div>
            ) : (
              <TooltipProvider delayDuration={100}>
                <div className="grid gap-2 sm:grid-cols-2">
                {concepts.map((c, idx) => (
                  <div
                    key={c.id}
                    className="group relative flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary tabular-nums">
                        {idx + 1}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm font-medium truncate">{c.concept_code}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="start">
                          <p className="max-w-xs">{c.concept_code}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={Math.round(Number(c.weight) * 100)}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setConcepts((cs) =>
                              cs.map((x) =>
                                x.id === c.id
                                  ? { ...x, weight: Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0)) / 100 }
                                  : x,
                              ),
                            );
                          }}
                          onBlur={(e) => handleUpdateWeight(c.id, Number(e.target.value))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className="h-7 w-14 px-1.5 text-xs tabular-nums text-right"
                          aria-label={`Weight for ${c.concept_code}`}
                        />
                        <span className="text-[11px] text-muted-foreground">%</span>
                      </div>
                    {confirmDeleteId === c.id ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[11px] text-muted-foreground mr-1">Remove?</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => handleDelete(c.id)}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </Button>
                      </div>

                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(c.id)}
                        className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive shrink-0"
                        title="Remove concept"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    </div>
                  </div>

                ))}
              </div>
              </TooltipProvider>
            )}

            {/* Manual add */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Input
                placeholder="Manually add a concept that was missed…"
                value={newConcept}
                onChange={(e) => setNewConcept(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddManual();
                  }
                }}
                className="flex-1"
              />
              <Button onClick={handleAddManual} disabled={!newConcept.trim() || adding}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Add</>}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between items-center pt-2">
          <Button variant="ghost" onClick={() => navigate("/teacher/setup/upload")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Materials
          </Button>
          <Button onClick={handleContinue} disabled={concepts.length === 0} size="lg">
            Continue to Lesson Plan <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConceptReview;
