import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import SetupProgressBar from "@/components/SetupProgressBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Plus, Pencil, Trash2, Save, X, Loader2 } from "lucide-react";

interface Concept {
  id: string;
  concept_code: string;
  weight: number;
  course_id: string;
}

const ConceptManagement = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const courseId = useTeacherCourseId() || "";

  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New concept form
  const [newConceptId, setNewConceptId] = useState("");
  const [newWeight, setNewWeight] = useState("0.0");
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
      setConcepts(data || []);
    }
    setLoading(false);
  };

  const totalWeight = concepts.reduce((sum, c) => sum + Number(c.weight), 0);

  const handleAdd = async () => {
    if (!newConceptId.trim()) {
      toast({ title: "Concept ID is required", variant: "destructive" });
      return;
    }
    const weight = parseFloat(newWeight) || 0;
    if (weight < 0 || weight > 1) {
      toast({ title: "Weight must be between 0 and 1", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("concepts").insert({
      concept_code: newConceptId.trim(),
      weight,
      course_id: courseId,
    });
    if (error) {
      toast({ title: "Error adding concept", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Concept added" });
      setNewConceptId("");
      setNewWeight("0.0");
      setShowAddForm(false);
      await fetchConcepts();
    }
    setSaving(false);
  };

  const handleEdit = (c: Concept) => {
    setEditingId(c.id);
    setEditConceptId(c.concept_code);
    setEditWeight(String(c.weight));
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const weight = parseFloat(editWeight) || 0;
    if (weight < 0 || weight > 1) {
      toast({ title: "Weight must be between 0 and 1", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("concepts")
      .update({ concept_code: editConceptId.trim(), weight })
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
          <SetupProgressBar currentStep={4} />
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
        <SetupProgressBar currentStep={4} />

        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold">
            Course <span className="text-primary">Concepts</span>
          </h1>
          <p className="mt-2 text-muted-foreground">
            Define the concepts for your course. Each concept can be linked to diagnostic questions.
          </p>
        </div>

        {/* Weight summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Weight</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Progress value={Math.min(totalWeight * 100, 100)} className="flex-1" />
              <span className={`text-sm font-semibold ${Math.abs(totalWeight - 1) < 0.01 ? "text-green-600" : "text-muted-foreground"}`}>
                {totalWeight.toFixed(2)} / 1.00
              </span>
            </div>
            {totalWeight > 1.01 && (
              <p className="mt-1 text-xs text-destructive">Total weight exceeds 1.0</p>
            )}
          </CardContent>
        </Card>

        {/* Concepts table */}
        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : concepts.length === 0 && !showAddForm ? (
              <div className="py-8 text-center text-muted-foreground">
                <p>No concepts defined yet.</p>
                <Button className="mt-4" onClick={() => setShowAddForm(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add First Concept
                </Button>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Concept ID</TableHead>
                      <TableHead className="w-[120px]">Weight</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {concepts.map((c) => (
                      <TableRow key={c.id}>
                        {editingId === c.id ? (
                          <>
                            <TableCell>
                              <Input
                                value={editConceptId}
                                onChange={(e) => setEditConceptId(e.target.value)}
                                placeholder="e.g. PWIM/Python_Environment"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max="1"
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
                            <TableCell className="font-mono text-sm">{c.concept_code}</TableCell>
                            <TableCell>{Number(c.weight).toFixed(2)}</TableCell>
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

                {!showAddForm && (
                  <Button variant="outline" className="mt-4" onClick={() => setShowAddForm(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Add Concept
                  </Button>
                )}
              </>
            )}

            {/* Add form */}
            {showAddForm && (
              <div className="mt-4 rounded-md border p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Concept ID</Label>
                    <Input
                      value={newConceptId}
                      onChange={(e) => setNewConceptId(e.target.value)}
                      placeholder="e.g. PWIM/Python_Environment"
                    />
                  </div>
                  <div>
                    <Label>Weight (0–1)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
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

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={() => navigate("/teacher/setup/lesson-plan")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Lesson Plan
          </Button>
          <Button onClick={() => navigate("/teacher/setup/diagnostic")}>
            Continue to Diagnostic Questions <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConceptManagement;
