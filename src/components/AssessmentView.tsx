import { useState, useEffect, useCallback } from "react";
import { Question } from "@/data/questionBank";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Clock, ArrowRight, ArrowLeft, Trophy, ClipboardList, GraduationCap, ShieldCheck } from "lucide-react";

interface AssessmentViewProps {
  type: "quiz" | "exam";
  questions: Question[];
  timeLimitMinutes: number;
  day?: number;
  onEnd: () => void;
  onSubmit: (results: AssessmentResults) => void;
}

export interface AssessmentResults {
  totalQuestions: number;
  correctAnswers: number;
  score: number;
  answers: Record<string, string>;
  timeSpent: number;
}

type Phase = "intro" | "active" | "review";

const AssessmentView = ({ type, questions, timeLimitMinutes, day, onEnd, onSubmit }: AssessmentViewProps) => {
  const [phase, setPhase] = useState<Phase>("intro");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(timeLimitMinutes * 60);
  const [results, setResults] = useState<AssessmentResults | null>(null);

  // Timer
  useEffect(() => {
    if (phase !== "active") return;
    if (timeLeft <= 0) {
      handleFinish();
      return;
    }
    const t = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(t);
  }, [phase, timeLeft]);

  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleFinish = useCallback(() => {
    let correct = 0;
    questions.forEach(q => {
      if (answers[q.id] === q.correctAnswer) correct++;
    });
    const res: AssessmentResults = {
      totalQuestions: questions.length,
      correctAnswers: correct,
      score: Math.round((correct / questions.length) * 100),
      answers,
      timeSpent: timeLimitMinutes * 60 - timeLeft,
    };
    setResults(res);
    setPhase("review");
    onSubmit(res);
  }, [answers, questions, timeLeft, timeLimitMinutes, onSubmit]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const isQuiz = type === "quiz";
  const answeredCount = Object.keys(answers).length;

  // Intro screen
  if (phase === "intro") {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              {isQuiz ? <ClipboardList className="h-7 w-7 text-primary" /> : <GraduationCap className="h-7 w-7 text-primary" />}
            </div>
            <CardTitle className="text-xl">
              {isQuiz ? `Daily Quiz — Day ${day || 1}` : "Final Exam Simulation"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p><strong className="text-foreground">{questions.length}</strong> questions</p>
              <p><strong className="text-foreground">{timeLimitMinutes} minutes</strong> time limit</p>
              {isQuiz && <p>Covers Day {day} topics</p>}
              {!isQuiz && <p>Covers all workshop topics</p>}
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-xs text-muted-foreground">
                ⚠️ Once started, navigating away will <strong className="text-destructive">discard</strong> your progress.
              </p>
            </div>
            <div className="flex items-center justify-center gap-1.5 pt-1">
              <ShieldCheck className="h-3 w-3 text-primary" />
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Private & anonymized</span> — your professor never sees individual answers.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={onEnd}>Cancel</Button>
              <Button className="flex-1" onClick={() => setPhase("active")}>
                Start {isQuiz ? "Quiz" : "Exam"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Review screen
  if (phase === "review" && results) {
    const passed = results.score >= 60;
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <Card>
            <CardHeader className="text-center">
              <div className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full ${passed ? "bg-primary/10" : "bg-destructive/10"}`}>
                <Trophy className={`h-7 w-7 ${passed ? "text-primary" : "text-destructive"}`} />
              </div>
              <CardTitle className="text-xl">
                {isQuiz ? "Daily Quiz Complete!" : "Exam Complete!"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-2xl font-bold text-primary">{results.score}%</p>
                  <p className="text-xs text-muted-foreground">Score</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-2xl font-bold">{results.correctAnswers}/{results.totalQuestions}</p>
                  <p className="text-xs text-muted-foreground">Correct</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-2xl font-bold">{formatTime(results.timeSpent)}</p>
                  <p className="text-xs text-muted-foreground">Time</p>
                </div>
              </div>
              <Progress value={results.score} className="h-3" />
            </CardContent>
          </Card>

          {/* Question review */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Question Review</h3>
            {questions.map((q, i) => {
              const userAnswer = answers[q.id];
              const isCorrect = userAnswer === q.correctAnswer;
              return (
                <Card key={q.id} className={`border ${isCorrect ? "border-primary/30" : "border-destructive/30"}`}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      {isCorrect ? <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Q{i + 1}: {q.text}</p>
                        <div className="mt-1 space-y-0.5">
                          <p className="text-xs">
                            <span className="text-muted-foreground">Your answer: </span>
                            <span className={isCorrect ? "text-primary font-medium" : "text-destructive font-medium"}>
                              {userAnswer || "Not answered"}
                            </span>
                          </p>
                          {!isCorrect && (
                            <p className="text-xs">
                              <span className="text-muted-foreground">Correct answer: </span>
                              <span className="text-primary font-medium">{q.correctAnswer}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{q.topic}</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="text-center pt-2">
            <Button onClick={onEnd}>Back to {isQuiz ? "Home" : "Home"}</Button>
          </div>
        </div>
      </div>
    );
  }

  // Active assessment
  const currentQ = questions[currentIndex];

  return (
    <div className="flex flex-1 flex-col">
      {/* Timer + progress bar */}
      <div className="flex items-center justify-between border-b px-5 py-3 bg-muted/20">
        <div className="flex items-center gap-3">
          <Badge variant={isQuiz ? "default" : "secondary"}>
            {isQuiz ? `Daily Quiz — Day ${day}` : "Exam Simulation"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Q {currentIndex + 1} of {questions.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{answeredCount}/{questions.length} answered</span>
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-mono font-bold ${timeLeft < 60 ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
            <Clock className="h-3.5 w-3.5" />
            {formatTime(timeLeft)}
          </div>
        </div>
      </div>

      <div className="px-5 py-2">
        <Progress value={((currentIndex + 1) / questions.length) * 100} className="h-1.5" />
      </div>

      {/* Question */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">{currentQ.topic}</Badge>
                <Badge variant="outline" className="text-xs">{currentQ.difficulty}</Badge>
              </div>
              <CardTitle className="text-lg mt-3">
                Question {currentIndex + 1}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm leading-relaxed">{currentQ.text}</p>

              {currentQ.type === "mcq" && currentQ.options && (
                <RadioGroup
                  value={answers[currentQ.id] || ""}
                  onValueChange={(v) => handleAnswer(currentQ.id, v)}
                  className="space-y-2"
                >
                  {currentQ.options.map((opt, i) => (
                    <Label
                      key={i}
                      htmlFor={`opt-${i}`}
                      className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                        answers[currentQ.id] === opt ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      <RadioGroupItem value={opt} id={`opt-${i}`} />
                      <span className="text-sm">{opt}</span>
                    </Label>
                  ))}
                </RadioGroup>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t px-5 py-3">
        <Button
          variant="outline"
          onClick={() => setCurrentIndex(prev => prev - 1)}
          disabled={currentIndex === 0}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Previous
        </Button>

        {/* Question dots */}
        <div className="flex items-center gap-1 overflow-hidden max-w-[300px]">
          {questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => setCurrentIndex(i)}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                i === currentIndex
                  ? "bg-primary scale-125"
                  : answers[q.id]
                  ? "bg-primary/40"
                  : "bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>

        {currentIndex < questions.length - 1 ? (
          <Button onClick={() => setCurrentIndex(prev => prev + 1)}>
            Next <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleFinish}
            variant="default"
            className="gap-2"
          >
            <CheckCircle className="h-4 w-4" /> Submit {isQuiz ? "Quiz" : "Exam"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default AssessmentView;
