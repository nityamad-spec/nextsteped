import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Brain, Info, Loader2, BookOpen, Trash2, Sparkles,
} from "lucide-react";
import SetupModuleNav from "@/components/SetupModuleNav";
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
  const [generating, setGenerating] = useState(false);
  const [conceptCount, setConceptCount] = useState(0);
  const [adaptiveFilter, setAdaptiveFilter] = useState<string | null>(null);

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

  const handleGenerate = async () => {
    if (!courseId) {
      toast({ title: "No course selected", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-diagnostic-questions", {
        body: { courseId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Refetch
      const { data: refreshed } = await supabase
        .from("diagnostic_questions")
        .select("id, item_code, content_text, format, difficulty_estimate, bloom_level, answer, options, topic")
        .eq("course_id", courseId)
        .order("difficulty_estimate");
      if (refreshed) setQuestions(refreshed);

      toast({
        title: "Question bank generated",
        description: data?.message || "Diagnostic questions are ready to review.",
      });
    } catch (e: any) {
      toast({
        title: "Generation failed",
        description: e?.message || "Could not generate questions. Try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };


  const standardQuestions = questions.slice(0, 5);
  const adaptiveQuestions = questions.slice(5, 10);

  const filteredAdaptive = adaptiveFilter
    ? adaptiveQuestions.filter(q => difficultyLabel(q.difficulty_estimate) === adaptiveFilter)
    : adaptiveQuestions;

  // Concept coverage from questions
  const allTopics = [...new Set(questions.map(q => q.topic).filter(Boolean))] as string[];

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

  const renderQuestionCard = (q: DiagnosticQuestion, index: number) => (
    <div key={q.id} className="rounded-lg border p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">Q{index + 1}</span>
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

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        {/* progress bar removed — using shared SetupModuleNav */}

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
                <li><strong>5 Adaptive Questions</strong> — Based on performance on the standard questions, students are routed to an Easy, Medium, or Hard tier of follow-up questions</li>
                <li>Questions are <strong>randomized</strong> for each student to prevent cheating</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Important notice */}
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">This is a template — not an exhaustive list</p>
            <p>The question bank below is an example set for your review. Questions are AI-generated and randomized for each student, so students will receive different combinations. You can review, remove, or use these as a reference for the types of questions that will appear.</p>
          </div>
        </div>

        {/* Question Bank */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="h-5 w-5 text-primary" /> Question Bank
                </CardTitle>
                <CardDescription className="mt-1">
                  {questions.length > 0
                    ? `${questions.length} sample questions across ${conceptCount} concepts — review and remove any that don't fit.`
                    : `No questions yet. Generate a template based on your ${conceptCount} course concepts.`}
                </CardDescription>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={generating || conceptCount === 0}
                size="sm"
                variant={questions.length > 0 ? "outline" : "default"}
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {questions.length > 0 ? "Regenerate" : "Generate Question Bank"}
                  </>
                )}
              </Button>
            </div>
            {conceptCount === 0 && (
              <p className="text-xs text-amber-600 mt-2">
                Generate your lesson plan first to extract concepts before building the diagnostic.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-muted/20 p-3 text-center">
                <p className="text-lg font-bold text-primary">{questions.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 text-center">
                <p className="text-lg font-bold text-primary">{standardQuestions.length}</p>
                <p className="text-xs text-muted-foreground">Standard</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 text-center">
                <p className="text-lg font-bold text-primary">{adaptiveQuestions.length}</p>
                <p className="text-xs text-muted-foreground">Adaptive</p>
              </div>
            </div>

            {/* Standard Questions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Standard Questions</p>
                  <p className="text-xs text-muted-foreground">Common to all students — covering core concepts</p>
                </div>
                <Badge variant="outline" className="font-mono">{standardQuestions.length} questions</Badge>
              </div>
              {standardQuestions.length > 0 ? (
                <div className="space-y-2">
                  {standardQuestions.map((q, i) => renderQuestionCard(q, i))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <p className="text-xs text-muted-foreground">No standard questions yet</p>
                </div>
              )}
            </div>

            <div className="border-t" />

            {/* Adaptive Questions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Adaptive Tier Questions</p>
                  <p className="text-xs text-muted-foreground">Students receive Easy, Medium, or Hard questions based on standard performance</p>
                </div>
                <Badge variant="outline" className="font-mono">{adaptiveQuestions.length} questions</Badge>
              </div>
              {/* Tier filters */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Filter by tier:</span>
                {["Easy", "Medium", "Hard"].map(tier => (
                  <button
                    key={tier}
                    onClick={() => setAdaptiveFilter(adaptiveFilter === tier ? null : tier)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      adaptiveFilter === tier
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    {tier}
                  </button>
                ))}
                {adaptiveFilter && (
                  <button onClick={() => setAdaptiveFilter(null)} className="text-xs text-muted-foreground hover:text-foreground ml-1">Clear</button>
                )}
              </div>
              {filteredAdaptive.length > 0 ? (
                <div className="space-y-2">
                  {filteredAdaptive.map((q, i) => renderQuestionCard(q, i + 5))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    {adaptiveFilter ? `No ${adaptiveFilter} tier questions` : "No adaptive questions yet"}
                  </p>
                </div>
              )}
            </div>

            <div className="border-t" />

            {/* Concept Coverage */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Concept Coverage</p>
              <div className="flex flex-wrap gap-2">
                {allTopics.length > 0 ? allTopics.map(topic => (
                  <Badge key={topic} variant="outline" className="text-xs">{topic}</Badge>
                )) : (
                  <p className="text-xs text-muted-foreground">No concepts detected yet</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Questions are distributed across all major course concepts.</p>
            </div>
          </CardContent>
        </Card>

        <SetupModuleNav nextPath="/teacher/setup/ai-settings" nextLabel="Next: AI Assistant Settings" />
      </div>
    </div>
  );
};

export default DiagnosticQuestionsSetup;
