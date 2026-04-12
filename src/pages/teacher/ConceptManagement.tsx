import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import SetupProgressBar from "@/components/SetupProgressBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Plus, Pencil, Trash2, Save, X, Loader2, Sparkles, RefreshCw, Check, Info } from "lucide-react";

interface Concept {
  id: string;
  concept_code: string;
  weight: number;
  course_id: string;
  approved?: boolean;
}

const ConceptManagement = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const courseId = useTeacherCourseId() || "";

  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // New concept form
  const [newConceptId, setNewConceptId] = useState("");
  const [newWeight, setNewWeight] = useState("0");
  const [showAddForm, setShowAddForm] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editConceptId, setEditConceptId] = useState("");
  const [editWeight, setEditWeight] = useState("");

  useEffect(() => {
    if (!courseId) return;
    fetchConcepts();
  }, [courseId]);

  const fetchConcepts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("concepts")
      .select("*")
      .eq("course_id", courseId)
      .order("concept_code");
    if (error) {
      toast({ title: "Error loading concepts", description: error.message, variant: "destructive" });
    } else {
      // All existing DB concepts start as approved
      setConcepts((data || []).map(c => ({ ...c, approved: true })));
    }
    setLoading(false);
  };

  const handleAutoGenerate = async () => {
    if (!user || !courseId) return;
    setGenerating(true);
    try {
      // Fetch approved syllabus JSON for concept extraction
      const { data: course } = await supabase
        .from("courses")
        .select("syllabus_json_path")
        .eq("id", courseId)
        .maybeSingle();

      const syllabusPath = course?.syllabus_json_path;
      if (!syllabusPath) {
        toast({ title: "No approved syllabus found", description: "Please complete the Syllabus Review step first.", variant: "destructive" });
        setGenerating(false);
        return;
      }

      const { data: blob } = await supabase.storage
        .from("course-materials")
        .download(syllabusPath);

      if (!blob) {
        toast({ title: "Could not read syllabus", description: "Try re-approving your syllabus in the previous step.", variant: "destructive" });
        setGenerating(false);
        return;
      }

      const materialText = await blob.text();

      // Call AI to generate concepts
      const { data: aiResult, error: aiError } = await supabase.functions.invoke("seed-concepts", {
        body: {
          materialContent: materialText,
          courseId,
          autoGenerate: true,
        },
      });

      if (aiError) throw new Error(aiError.message);
      if (aiResult?.error) throw new Error(aiResult.error);

      // Refresh concepts from DB — mark them as unapproved for review
      const { data: newConcepts } = await supabase
        .from("concepts")
        .select("*")
        .eq("course_id", courseId)
        .order("concept_code");

      if (newConcepts) {
        setConcepts(newConcepts.map(c => ({ ...c, approved: false })));
      }

      toast({ title: "Concepts generated", description: `AI generated ${newConcepts?.length || 0} concepts. Please review and approve each one.` });
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const totalWeight = concepts.reduce((sum, c) => sum + Number(c.weight), 0);
  const totalWeightPct = Math.round(totalWeight * 100);
  const allApproved = concepts.length > 0 && concepts.every(c => c.approved);

  const toggleApprove = (id: string) => {
    setConcepts(prev => prev.map(c => c.id === id ? { ...c, approved: !c.approved } : c));
  };

  const approveAll = () => {
    setConcepts(prev => prev.map(c => ({ ...c, approved: true })));
    toast({ title: "All concepts approved" });
  };

  const handleAdd = async () => {
    if (!newConceptId.trim()) {
      toast({ title: "Concept ID is required", variant: "destructive" });
      return;
    }
    const weightPct = parseFloat(newWeight) || 0;
    if (weightPct < 0 || weightPct > 100) {
      toast({ title: "Weight must be between 0 and 100%", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("concepts").insert({
      concept_code: newConceptId.trim(),
      weight: weightPct / 100,
      course_id: courseId,
    });
    if (error) {
      toast({ title: "Error adding concept", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Concept added" });
      setNewConceptId("");
      setNewWeight("0");
      setShowAddForm(false);
      await fetchConcepts();
    }
    setSaving(false);
  };

  const handleEdit = (c: Concept) => {
    setEditingId(c.id);
    setEditConceptId(c.concept_code);
    setEditWeight(String(Math.round(c.weight * 100)));
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const weightPct = parseFloat(editWeight) || 0;
    if (weightPct < 0 || weightPct > 100) {
      toast({ title: "Weight must be between 0 and 100%", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("concepts")
      .update({ concept_code: editConceptId.trim(), weight: weightPct / 100 })
      .eq("id", editingId);
    if (error) {
      toast({ title: "Error updating concept", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Concept updated" });
      setEditingId(null);
      await fetchConcepts();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this concept? Questions linked to it will have their concept cleared.")) return;
    const { error } = await supabase.from("concepts").delete().eq("id", id);
    if (error) {
      toast({ title: "Error deleting concept", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Concept deleted" });
      await fetchConcepts();
    }
  };

  if (!courseId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-3xl">
          <SetupProgressBar currentStep={3} />
          <p className="text-center text-muted-foreground">No course found. Please complete previous steps first.</p>
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={() => navigate("/teacher/onboarding")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Go to Onboarding
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <SetupProgressBar currentStep={3} />

        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold">
            Course <span className="text-primary">Concepts</span>
          </h1>
          <p className="mt-2 text-muted-foreground">
            AI auto-fills concepts from your approved syllabus. Review, adjust weights, and approve each concept before continuing.
          </p>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">How it works</p>
            <p>Concepts are auto-generated from your approved syllabus. Each concept has a weight (0–100%) representing its importance in the course. You must approve every concept before proceeding.</p>
          </div>
        </div>

        {/* Auto-generate button */}
        {concepts.length === 0 && !loading && (
          <Card>
            <CardContent className="py-8 text-center space-y-4">
              <Sparkles className="h-10 w-10 text-primary mx-auto" />
              <div>
                <h3 className="font-semibold text-lg">Auto-Generate Concepts</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  AI will analyze your approved syllabus and suggest concepts with weights based on course content and best practices.
                </p>
              </div>
              <Button size="lg" onClick={handleAutoGenerate} disabled={generating}>
                {generating ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating concepts…</>
                ) : (
                  <><Sparkles className="mr-2 h-4 w-4" /> Generate Concepts from Materials</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Weight summary */}
        {concepts.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>Total Weight</span>
                <span className="text-xs text-muted-foreground">
                  {allApproved ? (
                    <span className="text-primary flex items-center gap-1"><Check className="h-3 w-3" /> All approved</span>
                  ) : (
                    `${concepts.filter(c => c.approved).length} of ${concepts.length} approved`
                  )}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Progress value={Math.min(totalWeightPct, 100)} className="flex-1" />
                <span className={`text-sm font-semibold ${Math.abs(totalWeightPct - 100) <= 1 ? "text-green-600" : "text-muted-foreground"}`}>
                  {totalWeightPct}% / 100%
                </span>
              </div>
              {totalWeightPct > 101 && (
                <p className="mt-1 text-xs text-destructive">Total weight exceeds 100%</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Concepts table */}
        {(concepts.length > 0 || showAddForm) && (
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Approve</TableHead>
                        <TableHead>Concept</TableHead>
                        <TableHead className="w-[120px]">Weight (%)</TableHead>
                        <TableHead className="w-[100px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {concepts.map((c) => (
                        <TableRow key={c.id} className={c.approved ? "bg-primary/5" : ""}>
                          {editingId === c.id ? (
                            <>
                              <TableCell>
                                <Checkbox checked={c.approved} onCheckedChange={() => toggleApprove(c.id)} />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={editConceptId}
                                  onChange={(e) => setEditConceptId(e.target.value)}
                                  placeholder="e.g. Python_Environment"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="1"
                                  min="0"
                                  max="100"
                                  value={editWeight}
                                  onChange={(e) => setEditWeight(e.target.value)}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button size="icon" variant="ghost" onClick={handleSaveEdit} disabled={saving}>
                                    <Save className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell>
                                <Checkbox checked={c.approved} onCheckedChange={() => toggleApprove(c.id)} />
                              </TableCell>
                              <TableCell className="font-mono text-sm">{c.concept_code}</TableCell>
                              <TableCell>{Math.round(Number(c.weight) * 100)}%</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button size="icon" variant="ghost" onClick={() => handleEdit(c)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => handleDelete(c.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="mt-4 flex gap-2">
                    {!showAddForm && (
                      <Button variant="outline" onClick={() => setShowAddForm(true)}>
                        <Plus className="mr-2 h-4 w-4" /> Add Concept
                      </Button>
                    )}
                    <Button variant="outline" onClick={handleAutoGenerate} disabled={generating}>
                      {generating ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Regenerating…</>
                      ) : (
                        <><RefreshCw className="mr-2 h-4 w-4" /> Regenerate</>
                      )}
                    </Button>
                    {!allApproved && concepts.length > 0 && (
                      <Button variant="outline" onClick={approveAll}>
                        <Check className="mr-2 h-4 w-4" /> Approve All
                      </Button>
                    )}
                  </div>
                </>
              )}

              {/* Add form */}
              {showAddForm && (
                <div className="mt-4 rounded-md border p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Concept Name</Label>
                      <Input
                        value={newConceptId}
                        onChange={(e) => setNewConceptId(e.target.value)}
                        placeholder="e.g. Data_Structures"
                      />
                    </div>
                    <div>
                      <Label>Weight (0–100%)</Label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        value={newWeight}
                        onChange={(e) => setNewWeight(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleAdd} disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      Add
                    </Button>
                    <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={() => navigate("/teacher/setup/quality-check")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Syllabus Review
          </Button>
          <Button
            onClick={() => navigate("/teacher/setup/materials")}
            disabled={!allApproved || concepts.length === 0}
          >
            Continue to Course Materials <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        {!allApproved && concepts.length > 0 && (
          <p className="text-center text-sm text-muted-foreground">
            You must approve all concepts before continuing.
          </p>
        )}
      </div>
    </div>
  );
};

export default ConceptManagement;
