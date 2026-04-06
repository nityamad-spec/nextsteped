import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, ArrowLeft, Brain, Info, Loader2, BookOpen, Pencil, Trash2, Check,
} from "lucide-react";
import SetupProgressBar from "@/components/SetupProgressBar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";

interface DiagnosticQuestion {
  id: string;
  item_code: string;
  content_text: string;
  format: string;
  difficulty_estimate: number;
  bloom_level: number;
  answer: string;
  options: any;
  topic: string | null;
  concept_code?: string;
}

const difficultyLabel = (est: number) => {
  if (est <= 0.33) return "Easy";
  if (est <= 0.66) return "Medium";
  return "Hard";
};

const difficultyColor = (est: number) => {
  if (est <= 0.33) return "bg-emerald-500/10 text-emerald-600 border-emerald-200";
  if (est <= 0.66) return "bg-amber-500/10 text-amber-600 border-amber-200";
  return "bg-destructive/10 text-destructive border-destructive/20";
};

const DiagnosticQuestionsSetup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const courseId = useTeacherCourseId();

  const [questions, setQuestions] = useState<DiagnosticQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [conceptCount, setConceptCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      if (!courseId) { setLoading(false); return; }

      const [questionsRes, conceptsRes] = await Promise.all([
        supabase
          .from("diagnostic_questions")
          .select("id, item_code, content_text, format, difficulty_estimate, bloom_level, answer, options, topic")
          .eq("course_id", courseId)
          .order("difficulty_estimate"),
        supabase.from("concepts").select("id", { count: "exact" }).eq("course_id", courseId),
      ]);

      if (questionsRes.data) setQuestions(questionsRes.data);
      setConceptCount(conceptsRes.count || 0);
      setLoading(false);
    };
    fetchData();
  }, [courseId]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("diagnostic_questions").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
      return;
    }
    setQuestions(prev => prev.filter(q => q.id !== id));
    toast({ title: "Question removed" });
  };

  // Group questions by difficulty tier
  const anchorQuestions = questions.filter(q => q.difficulty_estimate >= 0.3 && q.difficulty_estimate <= 0.6).slice(0, 5);
  const easyQuestions = questions.filter(q => q.difficulty_estimate < 0.3);
  const mediumQuestions = questions.filter(q => q.difficulty_estimate >= 0.3 && q.difficulty_estimate <= 0.6).slice(5);
  const hardQuestions = questions.filter(q => q.difficulty_estimate > 0.6);

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

  const renderQuestionCard = (q: DiagnosticQuestion) => (
    <div key={q.id} className="rounded-lg border p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`text-[10px] ${difficultyColor(q.difficulty_estimate)}`}>
            {difficultyLabel(q.difficulty_estimate)}
          </Badge>
          <Badge variant="outline" className="text-[10px]">{q.format.toUpperCase()}</Badge>
          {q.topic && <span className="text-[10px] text-muted-foreground">{q.topic}</span>}
        </div>
        <button
          onClick={() => handleDelete(q.id)}
          className="rounded p-1.5 hover:bg-destructive/10 hover:text-destructive shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-sm whitespace-pre-wrap">{q.content_text}</p>
      {q.format === "mcq" && q.options && (
        <div className="space-y-0.5 pl-2">
          {(Array.isArray(q.options) ? q.options : []).map((opt: string, i: number) => (
            <p key={i} className={`text-xs ${opt === q.answer ? "text-primary font-medium" : "text-muted-foreground"}`}>
              {String.fromCharCode(65 + i)}. {opt}
            </p>
          ))}
        </div>
      )}
    </div>
  );

  const renderTierSection = (title: string, description: string, qs: DiagnosticQuestion[]) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Badge variant="outline" className="font-mono">{qs.length} questions</Badge>
      </div>
      {qs.length > 0 ? (
        <div className="space-y-2">
          {qs.map(renderQuestionCard)}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-center">
          <p className="text-xs text-muted-foreground">No questions in this tier yet</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <SetupProgressBar currentStep={5} />

        <div className="mb-6 text-center">
          <h1 className="font-heading text-3xl font-bold">
            Diagnostic <span className="text-primary">Assessment</span>
          </h1>
          <p className="text-muted-foreground">Review the auto-generated diagnostic quiz students take when they join your course</p>
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
                <li><strong>5 Standard Questions</strong> — Common to all students, covering core concepts at a medium difficulty level</li>
                <li><strong>3 Adaptive Tiers</strong> — Based on performance on the standard questions, students are routed to Easy, Medium, or Hard follow-up questions</li>
                <li>Each tier contains additional questions to further assess the student's level</li>
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
            <p>To maintain academic integrity, diagnostic questions are AI-generated and randomized for each student. Students receive different question sets, making it impossible to share answers. You can review the questions below and remove any that don't fit.</p>
          </div>
        </div>

        {/* Question Bank Summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5 text-primary" /> Question Bank
            </CardTitle>
            <CardDescription>
              {questions.length} questions auto-generated across {conceptCount} concepts. Review and remove any that don't fit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border bg-muted/20 p-3 text-center">
                <p className="text-lg font-bold text-primary">{questions.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 text-center">
                <p className="text-lg font-bold text-primary">{anchorQuestions.length}</p>
                <p className="text-xs text-muted-foreground">Standard</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 text-center">
                <p className="text-lg font-bold text-primary">3</p>
                <p className="text-xs text-muted-foreground">Tiers (E/M/H)</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 text-center">
                <p className="text-lg font-bold text-primary">{conceptCount}</p>
                <p className="text-xs text-muted-foreground">Concepts</p>
              </div>
            </div>

            {/* Tier sections */}
            <div className="space-y-6">
              {renderTierSection(
                "Standard Questions",
                "Common to all students — medium difficulty, covering core concepts",
                anchorQuestions
              )}
              <div className="border-t" />
              {renderTierSection(
                "Easy Tier",
                "For students who struggle with standard questions",
                easyQuestions
              )}
              {renderTierSection(
                "Medium Tier",
                "For students who perform moderately on standard questions",
                mediumQuestions
              )}
              {renderTierSection(
                "Hard Tier",
                "For students who excel at standard questions",
                hardQuestions
              )}
            </div>
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
