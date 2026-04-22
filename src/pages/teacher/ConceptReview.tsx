import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Plus, X, Loader2, Sparkles, Check, RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";
import { bumpCacheVersion } from "@/lib/cacheVersion";

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
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsRequested, setSuggestionsRequested] = useState(false);

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
      // Filter out anything that already exists in confirmed list
      const existingLc = new Set(concepts.map((c) => c.concept_code.trim().toLowerCase()));
      setSuggestions(incoming.filter((s) => !existingLc.has(s.name.trim().toLowerCase())));
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
    const { data, error } = await supabase
      .from("concepts")
      .insert({ concept_code: s.name, weight: 0, course_id: courseId })
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

  const handleDismissSuggestion = (s: Suggestion) => {
    setSuggestions((prev) => prev.filter((x) => x.name !== s.name));
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

  const handleContinue = () => {
    if (concepts.length === 0) {
      toast.error("Please confirm at least one concept before continuing.");
      return;
    }
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
            Review the concepts extracted from your uploaded materials. Confirm, add, or remove concepts before generating your lesson plan.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-0.5">Human-in-the-loop checkpoint</p>
            <p>The lesson plan will be generated using only the concepts you confirm here. Take a moment to refine the list — add anything missing, remove anything irrelevant.</p>
          </div>
        </div>

        {/* Confirmed concepts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary" /> Confirmed Concepts
                </CardTitle>
                <CardDescription>
                  {concepts.length} concept{concepts.length === 1 ? "" : "s"} will be used to generate your lesson plan.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : concepts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No concepts yet. Add some manually below or fetch AI suggestions.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {concepts.map((c) => (
                  <div
                    key={c.id}
                    className="group relative flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2.5"
                  >
                    <span className="text-sm font-medium truncate">{c.concept_code}</span>
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
                ))}
              </div>
            )}

            {/* Manual add */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Input
                placeholder="Add a concept..."
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

        {/* AI Suggestions */}
        <Card className="border-dashed">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" /> AI-Suggested Concepts to Include
                </CardTitle>
                <CardDescription>
                  Concepts that may be missing or underrepresented in your materials. Review and add any that fit.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchSuggestions}
                disabled={loadingSuggestions}
              >
                {loadingSuggestions ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Analyzing…</>
                ) : suggestionsRequested ? (
                  <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Get suggestions</>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!suggestionsRequested && !loadingSuggestions ? (
              <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Click "Get suggestions" to see concepts the AI thinks may be missing.
              </div>
            ) : loadingSuggestions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : suggestions.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                No additional suggestions. Your concept list looks complete.
              </div>
            ) : (
              <div className="space-y-5">
                {(() => {
                  // Group suggestions by unit, preserving server order
                  const groups: { key: string; unit_number?: number; unit_title?: string; items: Suggestion[] }[] = [];
                  const indexByKey = new Map<string, number>();
                  for (const s of suggestions) {
                    const key =
                      s.unit_number != null
                        ? `u-${s.unit_number}`
                        : "other";
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
                      <div className="flex items-center gap-2 px-1">
                        {g.unit_number != null ? (
                          <>
                            <Badge variant="secondary" className="text-[10px] font-semibold">
                              Unit {g.unit_number}
                            </Badge>
                            <span className="text-xs font-medium text-foreground">
                              {g.unit_title || ""}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs font-medium text-muted-foreground">Other</span>
                        )}
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
                                <Sparkles className="h-2.5 w-2.5" /> Suggested
                              </Badge>
                            </div>
                            {s.rationale && (
                              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.rationale}</p>
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
