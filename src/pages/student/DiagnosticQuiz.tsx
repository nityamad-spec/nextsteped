import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { mockQuizQuestions } from "@/data/mockData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { ArrowRight, ArrowLeft, Brain, Zap } from "lucide-react";

const confidenceLabels: Record<number, string> = {
  0: "Just Guessing",
  50: "Somewhat Confident",
  100: "Very Confident",
};

const DiagnosticQuiz = () => {
  const { studentProfile, setStudentProfile, setDiagnosticComplete } = useApp();
  const navigate = useNavigate();
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number>(50);
  const [answers, setAnswers] = useState<number[]>([]);
  const [confidences, setConfidences] = useState<number[]>([]);
  const [phase, setPhase] = useState<"intro" | "quiz" | "result">("intro");

  const questions = mockQuizQuestions.slice(0, 7);
  const question = questions[currentQ];

  const handleAnswer = () => {
    if (selected === null) return;
    const newAnswers = [...answers, selected];
    setAnswers(newAnswers);
    setConfidences([...confidences, confidence]);
    setSelected(null);
    setConfidence(50);

    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      const correct = newAnswers.filter((a, i) => a === questions[i].correctIndex).length;
      const level = correct >= 6 ? "Expert" : correct >= 4 ? "Advanced" : correct >= 2 ? "Intermediate" : "Beginner";
      if (studentProfile) {
        setStudentProfile({ ...studentProfile, learnerLevel: level });
      }
      setPhase("result");
    }
  };

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
              <Button onClick={() => setPhase("quiz")} className="w-full">
                Start Quiz <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (phase === "result") {
    const finalScore = answers.filter((a, i) => a === questions[i].correctIndex).length;
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
              <Badge variant="secondary" className="mb-3">{question.topic}</Badge>
              <p className="mb-4 text-sm font-medium">{question.question}</p>
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

              {selected !== null && (
                <div className="mt-4 border-t pt-4">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">How confident are you in your answer?</p>
                  <div className="px-2">
                    <Slider
                      value={[confidence]}
                      onValueChange={(val) => setConfidence(val[0])}
                      min={0}
                      max={100}
                      step={50}
                      className="mb-2"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Just Guessing</span>
                      <span>Somewhat Confident</span>
                      <span>Very Confident</span>
                    </div>
                  </div>
                  <p className="mt-2 text-center text-sm font-medium text-primary">
                    {confidenceLabels[confidence] || "Somewhat Confident"}
                  </p>
                </div>
              )}
            </motion.div>
            <div className="mt-4 flex justify-between">
              <Button variant="ghost" onClick={() => { if (currentQ > 0) { setCurrentQ(currentQ - 1); setSelected(null); setConfidence(50); setAnswers(answers.slice(0, -1)); setConfidences(confidences.slice(0, -1)); } else { navigate("/student/onboarding"); } }}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={handleAnswer} disabled={selected === null}>
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
