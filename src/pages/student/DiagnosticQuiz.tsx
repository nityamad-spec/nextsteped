import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, ArrowLeft, Brain, Zap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { seededShuffle } from "@/lib/seededShuffle";

const confidenceLabels: Record<number, string> = {
  0: "Just Guessing",
  50: "Somewhat Confident",
  100: "Very Confident",
};

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  correctAnswer: string;
  topic: string;
  explanation: string;
  courseId: string;
  format: "mcq" | "true_false" | "short_answer";
}

const answerLetters = ["A", "B", "C", "D", "E", "F"];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DiagnosticQuiz = () => {
  const { studentProfile, setStudentProfile, setDiagnosticComplete } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [textAnswers, setTextAnswers] = useState<string[]>([]);
  const [confidences, setConfidences] = useState<number[]>([]);
  const [phase, setPhase] = useState<"loading" | "intro" | "quiz" | "result">("loading");
  const [saving, setSaving] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);
  const [questionTimes, setQuestionTimes] = useState<number[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!user || initialized) return;
      setInitialized(true);

      const { data: enrollment } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("student_id", user.id)
        .limit(1)
        .maybeSingle();

      const courseId = enrollment?.course_id;

      if (!courseId) {
        setQuestions([]);
        setPhase("intro");
        return;
      }

      const { data: existing } = await supabase
        .from("diagnostic_results")
        .select("id")
        .eq("student_id", user.id)
        .eq("course_id", courseId)
        .maybeSingle();

      if (existing) {
        setDiagnosticComplete(true);
        navigate("/student/home", { replace: true });
        return;
      }

      const { data: dbQuestions, error } = await supabase
        .from("diagnostic_questions")
        .select("*")
        .eq("in_test", true)
        .eq("course_id", courseId)
        .order("difficulty_estimate", { ascending: true });

      if (error || !dbQuestions || dbQuestions.length === 0) {
        setQuestions([]);
        setPhase("intro");
        return;
      }

      const mapped: QuizQuestion[] = dbQuestions.map((row) => {
        let options = (row.options as string[]) || [];
        let questionText = row.content_text;
        const format = row.format as QuizQuestion["format"];

        if (format !== "short_answer" && (!options || options.length === 0)) {
          const optionRegex = /^([A-F])\.\s*(.+)$/gm;
          const parsed: string[] = [];
          let match;
          while ((match = optionRegex.exec(row.content_text)) !== null) {
            parsed.push(match[2].trim());
          }
          if (parsed.length > 0) {
            options = parsed;
            questionText = row.content_text.replace(/\n[A-F]\.\s*.+/g, "").trim();
          }
        }

        const idx = answerLetters.indexOf(row.answer);
        const correctIndex = idx >= 0 ? idx : options.indexOf(row.answer);

        return {
          id: row.id,
          question: questionText,
          options: format === "short_answer" ? [] : options,
          correctIndex: correctIndex >= 0 ? correctIndex : 0,
          correctAnswer: row.answer,
          topic: row.topic || "",
          explanation: row.explanation || "",
          courseId: row.course_id,
          format,
        };
      });

      // Seeded Fisher-Yates shuffle — same student+course always gets same order
      const seed = hashString(user.id + courseId);
      const prng = mulberry32(seed);
      for (let i = mapped.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [mapped[i], mapped[j]] = [mapped[j], mapped[i]];
      }
      setQuestions(mapped);
      setPhase("intro");
    };
    init();
  }, [user]);

  const question = questions[currentQ];
  const isShortAnswer = question?.format === "short_answer";
  const hasAnswer = isShortAnswer ? textAnswer.trim().length > 0 : selected !== null;
  const canProceed = hasAnswer && confidence !== null;

  const handleAnswer = async () => {
    if (!canProceed) return;
    const elapsed = Date.now() - questionStartTime;
    const answerValue = isShortAnswer ? -1 : selected!;
    const newAnswers = [...answers, answerValue];
    const newTextAnswers = [...textAnswers, isShortAnswer ? textAnswer.trim() : ""];
    const newConfidences = [...confidences, confidence!];
    const newQuestionTimes = [...questionTimes, elapsed];
    const newQuestionIds = [...questionIds, question.id];
    setAnswers(newAnswers);
    setTextAnswers(newTextAnswers);
    setConfidences(newConfidences);
    setQuestionTimes(newQuestionTimes);
    setQuestionIds(newQuestionIds);
    setSelected(null);
    setTextAnswer("");
    setConfidence(null);

    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
      setQuestionStartTime(Date.now());
    } else {
      // Build standardised answer objects
      const standardisedAnswers = questions.map((q, i) => {
        const isShort = q.format === "short_answer";
        const selectedValue = isShort ? newTextAnswers[i] : answerLetters[newAnswers[i]] || String(newAnswers[i]);
        const correctValue = q.correctAnswer;
        const isCorrect = isShort
          ? newTextAnswers[i].toLowerCase() === correctValue.trim().toLowerCase()
          : newAnswers[i] === q.correctIndex;
        return {
          question_id: q.id,
          question_text: q.question,
          type: q.format,
          topic: q.topic,
          selected: selectedValue,
          correct: correctValue,
          is_correct: isCorrect,
          time_ms: newQuestionTimes[i],
          confidence: newConfidences[i],
        };
      });

      const correct = standardisedAnswers.filter(a => a.is_correct).length;
      const total = questions.length;
      const ratio = correct / total;
      const level = ratio >= 0.85 ? "Expert" : ratio >= 0.6 ? "Proficient" : ratio >= 0.35 ? "Progressing" : "Beginner";

      if (studentProfile) {
        setStudentProfile({ ...studentProfile, learnerLevel: level });
      }

      if (user) {
        setSaving(true);
        await supabase.from("diagnostic_results").insert({
          student_id: user.id,
          score: correct,
          total_questions: total,
          learner_level: level,
          answers: standardisedAnswers as unknown as import("@/integrations/supabase/types").Json,
          confidences: newConfidences as unknown as import("@/integrations/supabase/types").Json,
          question_times: newQuestionTimes as unknown as import("@/integrations/supabase/types").Json,
          question_ids: newQuestionIds as unknown as import("@/integrations/supabase/types").Json,
          course_id: questions[0]?.courseId || null,
        });
        await supabase.from("profiles").update({ learner_level: level }).eq("id", user.id);
        setSaving(false);
      }

      setPhase("result");
    }
  };

  if (phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg">
          <Card>
            <CardContent className="p-8 text-center space-y-5">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Brain className="h-8 w-8 text-primary" />
              </div>
              <h2 className="font-heading text-2xl font-bold">Diagnostic Quiz</h2>
              {questions.length === 0 ? (
                <>
                  <p className="text-muted-foreground">No diagnostic questions are available for this course yet. Please check back later or contact your instructor.</p>
                  <Button onClick={() => navigate("/student/home")} className="w-full">
                    Go to Home <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">
                    This quiz uses <strong>adaptive testing</strong> — the difficulty level of questions adjusts based on how you answer. Answer honestly to get the most accurate assessment of your current knowledge level.
                  </p>
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                    <Zap className="h-4 w-4 text-primary shrink-0" />
                    <p className="text-sm text-left">
                      <span className="font-medium text-foreground">How it works:</span>{" "}
                      <span className="text-muted-foreground">Questions get harder or easier based on your responses. This helps us pinpoint your exact knowledge level quickly.</span>
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">{questions.length} questions</p>
                  <Button onClick={() => { setPhase("quiz"); setQuestionStartTime(Date.now()); }} className="w-full">
                    Start Quiz <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (phase === "result") {
    const finalScore = answers.filter((a, i) => {
      const q = questions[i];
      if (q.format === "short_answer") {
        return textAnswers[i]?.toLowerCase() === q.correctAnswer.trim().toLowerCase();
      }
      return a === q.correctIndex;
    }).length;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg">
          <Card>
            <CardContent className="p-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Brain className="h-8 w-8 text-primary" />
              </div>
              <h2 className="font-heading text-2xl font-bold">Thank You!</h2>
              <p className="mt-2 text-muted-foreground">
                You've completed the diagnostic quiz. Now it's time to dive in — start learning, practice with the Teaching Assistant, and watch your understanding grow.
              </p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <Badge className="text-base px-4 py-1">{studentProfile?.learnerLevel}</Badge>
                <span className="text-sm text-muted-foreground">({finalScore} / {questions.length} correct)</span>
              </div>
              <Button onClick={() => { setDiagnosticComplete(true); navigate("/student/home"); }} className="mt-6 w-full">
                Go to Home <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (!question) return null;

  const formatLabel = question.format === "short_answer" ? "Short Answer" : question.format === "true_false" ? "True / False" : "Multiple Choice";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="font-heading text-2xl font-bold">Diagnostic Quiz</h1>
          <p className="text-sm text-muted-foreground">Adaptive testing — difficulty adjusts to your responses</p>
        </div>
        <Progress value={((currentQ + 1) / questions.length) * 100} className="mb-4 h-2" />
        <p className="mb-4 text-xs text-muted-foreground text-center">Question {currentQ + 1} of {questions.length}</p>

        <Card>
          <CardContent className="p-6">
            <motion.div key={currentQ} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <div className="mb-3 flex gap-2">
                <Badge variant="secondary">{question.topic}</Badge>
                <Badge variant="outline">{formatLabel}</Badge>
              </div>
              <p className="mb-4 text-sm font-medium">{question.question}</p>

              {isShortAnswer ? (
                <Textarea
                  placeholder="Type your answer..."
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  className="min-h-[100px]"
                />
              ) : (
                <div className="space-y-2">
                  {question.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => setSelected(i)}
                      className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                        selected === i ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted"
                      }`}
                    >
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{String.fromCharCode(65 + i)}.</span>
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {hasAnswer && (
                <div className="mt-4 border-t pt-4">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">
                    How confident are you in your answer? <span className="text-destructive">*</span>
                  </p>
                  <div className="px-2">
                    <Slider
                      value={confidence !== null ? [confidence] : [50]}
                      onValueChange={(val) => setConfidence(val[0])}
                      min={0}
                      max={100}
                      step={50}
                      className={cn("mb-2", confidence === null && "opacity-40")}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Just Guessing</span>
                      <span>Somewhat Confident</span>
                      <span>Very Confident</span>
                    </div>
                  </div>
                  {confidence === null ? (
                    <p className="mt-2 text-center text-sm font-medium text-muted-foreground italic">
                      Please select your confidence level
                    </p>
                  ) : (
                    <p className="mt-2 text-center text-sm font-medium text-primary">
                      {confidenceLabels[confidence] || "Somewhat Confident"}
                    </p>
                  )}
                </div>
              )}
            </motion.div>
            <div className="mt-4 flex justify-between">
              <Button variant="ghost" onClick={() => { if (currentQ > 0) { const prevQ = currentQ - 1; const prevAnswer = answers[prevQ]; const prevText = textAnswers[prevQ]; const prevConfidence = confidences[prevQ]; setCurrentQ(prevQ); setSelected(prevAnswer === -1 ? null : prevAnswer); setTextAnswer(prevText || ""); setConfidence(prevConfidence ?? null); setAnswers(answers.slice(0, -1)); setTextAnswers(textAnswers.slice(0, -1)); setConfidences(confidences.slice(0, -1)); setQuestionTimes(questionTimes.slice(0, -1)); setQuestionIds(questionIds.slice(0, -1)); setQuestionStartTime(Date.now()); } else { navigate("/student/onboarding"); } }}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={handleAnswer} disabled={!canProceed}>
                {currentQ < questions.length - 1 ? "Next Question" : "Finish Quiz"} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DiagnosticQuiz;
