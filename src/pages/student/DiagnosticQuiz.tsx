import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { mockQuizQuestions } from "@/data/mockData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Check, X, BookOpen, Brain, Target } from "lucide-react";

const DiagnosticQuiz = () => {
  const { studentProfile, setStudentProfile, setDiagnosticComplete } = useApp();
  const navigate = useNavigate();
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [phase, setPhase] = useState<"quiz" | "result" | "plan">("quiz");

  const questions = mockQuizQuestions.slice(0, 7);
  const question = questions[currentQ];

  const handleAnswer = () => {
    if (selected === null) return;
    const newAnswers = [...answers, selected];
    setAnswers(newAnswers);
    setSelected(null);

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

  const score = answers.filter((a, i) => a === questions[i].correctIndex).length;

  if (phase === "result") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg">
          <Card>
            <CardContent className="p-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Brain className="h-8 w-8 text-primary" />
              </div>
              <h2 className="font-heading text-2xl font-bold">Diagnostic Complete!</h2>
              <p className="mt-2 text-muted-foreground">You got {score} out of {questions.length} correct</p>
              <Badge className="mt-3 text-base px-4 py-1">{studentProfile?.learnerLevel}</Badge>
              <div className="mt-6 space-y-2 text-left">
                <p className="text-sm font-medium">Topic Strengths</p>
                {["Process Management", "CPU Scheduling"].map((t) => (
                  <div key={t} className="flex items-center gap-2 text-sm text-muted-foreground"><Check className="h-4 w-4 text-success" />{t}</div>
                ))}
                <p className="mt-3 text-sm font-medium">Areas to Improve</p>
                {["Virtual Memory", "Deadlocks", "Synchronization"].map((t) => (
                  <div key={t} className="flex items-center gap-2 text-sm text-muted-foreground"><Target className="h-4 w-4 text-accent" />{t}</div>
                ))}
              </div>
              <Button onClick={() => setPhase("plan")} className="mt-6 w-full">See Your Learning Plan <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (phase === "plan") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-lg">
          <Card>
            <CardContent className="p-8">
              <h2 className="font-heading text-2xl font-bold text-center mb-6">Your Plan This Week</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border p-4">
                  <BookOpen className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Concept Refresher</p>
                    <p className="text-xs text-muted-foreground">Virtual Memory — Paging & Address Translation (25 min)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border p-4">
                  <Target className="h-5 w-5 text-accent mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Applied Practice Set</p>
                    <p className="text-xs text-muted-foreground">Page Replacement Algorithms — LRU vs FIFO (30 min)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border p-4 opacity-60">
                  <Brain className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Exam Simulation (Optional)</p>
                    <p className="text-xs text-muted-foreground">Midterm practice — Scheduling & Memory (60 min)</p>
                  </div>
                </div>
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
          <p className="text-sm text-muted-foreground">Let's assess your current knowledge level</p>
        </div>
        <Progress value={((currentQ + 1) / questions.length) * 100} className="mb-4 h-2" />
        <p className="mb-4 text-xs text-muted-foreground text-center">Question {currentQ + 1} of {questions.length}</p>

        <Card>
          <CardContent className="p-6">
            <motion.div key={currentQ} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <Badge variant="secondary" className="mb-3">{question.topic} • {question.difficulty}</Badge>
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
            </motion.div>
            <Button onClick={handleAnswer} disabled={selected === null} className="mt-4 w-full">
              {currentQ < questions.length - 1 ? "Next Question" : "Finish Quiz"} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DiagnosticQuiz;