import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowRight, ArrowLeft, Brain, Info, Loader2, Settings2,
} from "lucide-react";
import SetupProgressBar from "@/components/SetupProgressBar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";

interface ConceptOption {
  id: string;
  concept_code: string;
  weight: number;
}

const DiagnosticQuestionsSetup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const courseId = useTeacherCourseId();

  const [concepts, setConcepts] = useState<ConceptOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [diagnosticLength, setDiagnosticLength] = useState(15);
  const [conceptCoverage, setConceptCoverage] = useState<"all" | "selected">("all");
  const [selectedConcepts, setSelectedConcepts] = useState<string[]>([]);
  const [questionCount, setQuestionCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      if (!courseId) { setLoading(false); return; }

      const [conceptsRes, questionsRes] = await Promise.all([
        supabase.from("concepts").select("id, concept_code, weight").eq("course_id", courseId).order("concept_code"),
        supabase.from("diagnostic_questions").select("id", { count: "exact" }).eq("course_id", courseId),
      ]);

      if (conceptsRes.data) {
        setConcepts(conceptsRes.data);
        setSelectedConcepts(conceptsRes.data.map(c => c.id));
      }
      setQuestionCount(questionsRes.count || 0);
      setLoading(false);
    };
    fetchData();
  }, [courseId]);

  const toggleConcept = (id: string) => {
    setSelectedConcepts(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const anchorCount = 5;
  const branchCount = Math.max(0, Math.floor((diagnosticLength - anchorCount) / 3));
  const totalQuestions = anchorCount + branchCount * 3;

  const handleContinue = () => {
    navigate("/teacher/setup/exam-mode");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading diagnostic setup…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <SetupProgressBar currentStep={5} />

        <div className="mb-6 text-center">
          <h1 className="font-heading text-3xl font-bold">
            Diagnostic <span className="text-primary">Assessment</span>
          </h1>
          <p className="text-muted-foreground">Configure the diagnostic quiz students take when they join your course</p>
        </div>

        {/* What is the diagnostic */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Brain className="h-5 w-5 text-primary" /> What is the Diagnostic?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              The diagnostic assessment is an adaptive quiz that students take when they first join your course. It measures their existing knowledge across course concepts to determine their starting proficiency level.
            </p>
            <div className="rounded-lg bg-muted/30 border p-4 space-y-2">
              <p className="text-sm font-medium">How it works:</p>
              <ul className="text-sm text-muted-foreground space-y-1.5 ml-4 list-disc">
                <li><strong>5 Anchor Questions</strong> — Common to all students, covering core concepts</li>
                <li><strong>3 Adaptive Branches</strong> — Based on anchor performance, students get Easy, Medium, or Hard follow-up questions</li>
                <li>Each branch contains additional questions to further assess the student's level</li>
                <li>Questions are <strong>randomized</strong> for each student to prevent cheating</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Important notice */}
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Why can't I choose specific questions?</p>
            <p>To maintain academic integrity, diagnostic questions are AI-generated and randomized for each student. Students receive different question sets, making it impossible to share answers. You can review the question bank and edit individual questions from the Assessments page after setup.</p>
          </div>
        </div>

        {/* Configuration */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings2 className="h-5 w-5 text-primary" /> Configuration
            </CardTitle>
            <CardDescription>Set the length and scope of the diagnostic assessment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Diagnostic Length */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Total Questions</Label>
                <Badge variant="outline" className="font-mono">{totalQuestions} questions</Badge>
              </div>
              <Slider
                value={[diagnosticLength]}
                onValueChange={([v]) => setDiagnosticLength(v)}
                min={10}
                max={20}
                step={1}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>10 (minimum)</span>
                <span>20 (maximum)</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div className="rounded-lg border bg-muted/20 p-3 text-center">
                  <p className="text-lg font-bold text-primary">{anchorCount}</p>
                  <p className="text-xs text-muted-foreground">Anchor Questions</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3 text-center">
                  <p className="text-lg font-bold text-primary">{branchCount}</p>
                  <p className="text-xs text-muted-foreground">Per Branch</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3 text-center">
                  <p className="text-lg font-bold text-primary">3</p>
                  <p className="text-xs text-muted-foreground">Branches (E/M/H)</p>
                </div>
              </div>
            </div>

            {/* Concept Coverage */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Concept Coverage</Label>
              <Select value={conceptCoverage} onValueChange={(v) => setConceptCoverage(v as "all" | "selected")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All major concepts</SelectItem>
                  <SelectItem value="selected">Select specific concepts</SelectItem>
                </SelectContent>
              </Select>

              {conceptCoverage === "selected" && (
                <div className="rounded-lg border p-4 space-y-2 max-h-60 overflow-y-auto">
                  {concepts.map(c => (
                    <label key={c.id} className="flex items-center gap-3 cursor-pointer py-1">
                      <Checkbox
                        checked={selectedConcepts.includes(c.id)}
                        onCheckedChange={() => toggleConcept(c.id)}
                      />
                      <span className="text-sm font-mono">{c.concept_code}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{Math.round(c.weight * 100)}%</span>
                    </label>
                  ))}
                  {concepts.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No concepts defined yet.</p>
                  )}
                </div>
              )}
            </div>

            {/* Question bank status */}
            {questionCount > 0 && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                <p className="text-sm">
                  <span className="font-medium text-primary">{questionCount}</span> diagnostic questions currently in the question bank.
                  Questions are AI-generated and randomized per student.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  You can review and edit individual questions from the Assessments page after completing setup.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={() => navigate("/teacher/setup/concepts")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Concepts
          </Button>
          <Button onClick={handleContinue}>
            Continue to Exam Mode <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DiagnosticQuestionsSetup;
