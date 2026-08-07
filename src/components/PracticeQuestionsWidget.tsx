import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle, XCircle, Trophy, Loader2, Sparkles, ArrowLeft,
  Lightbulb, BookOpen, X, History, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface PracticeResult {
  id: string;
  prompt: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  timestamp: number;
  topics: string[];
  answers?: any[];
}

import ReasoningInput from "@/components/ReasoningInput";
import { useReasoningAnswers } from "@/hooks/useReasoningAnswers";
import ReasoningVerdict from "@/components/ReasoningVerdict";
import {
  requiresReasoning,
  REASONING_EVAL_DEADLINE_MS,
  type ReasoningEvaluation,
} from "@/lib/reasoning";

interface PracticeQuestionsWidgetProps {
  onClose: () => void;
  onSaveResult?: (result: {
    score: number;
    totalQuestions: number;
    correctAnswers: number;
    answers: any[];
    timeSpent: number;
    rationales?: Record<string, string>;
    evaluations?: Record<string, ReasoningEvaluation>;
  }) => void;
  practiceHistory?: PracticeResult[];
  courseContext?: {
    courseName: string;
    objectives: string[];
    concepts: string[];
  } | null;
  enrolledCourseId?: string | null;
  studentId?: string | null;
  initialReviewSessionId?: string | null;
}

type Phase = "prompt" | "loading" | "active" | "review" | "review-history";

interface GeneratedQuestion {
  id: string;
  question: string;
  type: "mcq" | "true_false";
  options?: string[];
  answer: string;
  explanation: string;
  topic: string;
  difficulty_estimate: number; // 0..1
  bloom_level: number; // 1..6
}

const PracticeQuestionsWidget = ({ onClose, onSaveResult, practiceHistory = [], courseContext, enrolledCourseId, studentId, initialReviewSessionId = null }: PracticeQuestionsWidgetProps) => {
  const [phase, setPhase] = useState<Phase>("prompt");
  const [prompt, setPrompt] = useState("");
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<{ score: number; correct: number; total: number } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [startTime] = useState(Date.now());
  const [reviewingSession, setReviewingSession] = useState<PracticeResult | null>(null);
  const reasoning = useReasoningAnswers();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!initialReviewSessionId) return;
    const session = practiceHistory.find((item) => item.id === initialReviewSessionId);
    if (!session) return;

    setReviewingSession(session);
    setShowHistory(true);
    setPhase("review-history");
  }, [initialReviewSessionId, practiceHistory]);

  const generateQuestions = useCallback(async () => {
    if (!prompt.trim()) return;
    if (!enrolledCourseId) {
      toast.error("No enrolled course found.");
      return;
    }
    setPhase("loading");

    try {
      const { data, error } = await supabase.functions.invoke("generate-practice-questions", {
        body: { prompt, courseId: enrolledCourseId },
      });

      if (error || !data || (data as any).error) {
        const msg = (data as any)?.error || error?.message || "Failed to generate questions";
        toast.error(msg);
        setPhase("prompt");
        return;
      }

      const sanitized = ((data as any).questions ?? []) as GeneratedQuestion[];
      if (sanitized.length === 0) {
        toast.error("No valid questions generated. Try rephrasing your request.");
        setPhase("prompt");
        return;
      }

      setQuestions(sanitized);
      setCurrentIndex(0);
      setAnswers({});
      setRevealed(new Set());
      setResults(null);
      reasoning.reset();
      setPhase("active");
    } catch (e) {
      console.error("Failed to generate practice questions:", e);
      toast.error("Something went wrong. Please try again.");
      setPhase("prompt");
    }
  }, [prompt, enrolledCourseId]);

  const currentQuestion = questions[currentIndex];
  const isAnswered = currentQuestion ? !!answers[currentQuestion.id] : false;
  const isRevealed = currentQuestion ? revealed.has(currentQuestion.id) : false;

  const handleAnswer = (questionId: string, answer: string) => {
    if (revealed.has(questionId)) return;
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleReveal = () => {
    if (!currentQuestion || !answers[currentQuestion.id]) return;
    if (reasoning.isQuestionBlocked({ id: currentQuestion.id, bloom: currentQuestion.bloom_level })) {
      reasoning.setShowErrors(true);
      toast.error("Reasoning required", {
        description: "Explain your reasoning before checking the answer.",
      });
      return;
    }
    reasoning.setShowErrors(false);
    // Fire the background AI review of the rationale as the student advances.
    reasoning.evaluate({
      questionId: currentQuestion.id,
      questionText: currentQuestion.question,
      options: currentQuestion.options,
      correctAnswer: currentQuestion.answer,
      selectedAnswer: answers[currentQuestion.id] ?? null,
      topic: currentQuestion.topic,
      bloom: currentQuestion.bloom_level,
      courseId: enrolledCourseId ?? null,
    });
    setRevealed(prev => new Set(prev).add(currentQuestion.id));
  };

  const handleNext = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setSubmitting(true);
      await reasoning.waitForPending(REASONING_EVAL_DEADLINE_MS);
      setSubmitting(false);
      let correct = 0;
      const answerDetails = questions.map(q => {
        const userAnswer = answers[q.id] || "";
        const isCorrect = userAnswer === q.answer;
        if (isCorrect) correct++;
        return {
          question_id: q.id,
          question_text: q.question,
          type: q.type,
          topic: q.topic,
          selected: userAnswer,
          correct: q.answer,
          is_correct: isCorrect,
          explanation: q.explanation,
          difficulty_estimate: q.difficulty_estimate,
          bloom_level: q.bloom_level,
        };
      });

      const score = Math.round((correct / questions.length) * 100);
      setResults({ score, correct, total: questions.length });
      setPhase("review");

      onSaveResult?.({
        score,
        totalQuestions: questions.length,
        correctAnswers: correct,
        answers: answerDetails,
        timeSpent: Math.round((Date.now() - startTime) / 1000),
        rationales: reasoning.rationales,
        evaluations: reasoning.getEvaluations(),
      });
    }
  };

  const getAnswerCorrectness = (q: GeneratedQuestion) => {
    const userAnswer = answers[q.id] || "";
    return userAnswer === q.answer;
  };

  // Review a past session from history
  if (phase === "review-history" && reviewingSession) {
    const sessionAnswers = reviewingSession.answers || [];
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={() => { setPhase("prompt"); setReviewingSession(null); setShowHistory(true); }}>
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h2 className="font-semibold text-sm">Practice Review</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="max-w-lg mx-auto space-y-4">
            <Card>
              <CardContent className="p-5 space-y-3">
                <p className="text-sm font-medium truncate">{reviewingSession.prompt}</p>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="rounded-lg bg-muted p-3">
                    <p className={`text-2xl font-bold ${reviewingSession.score >= 60 ? "text-primary" : "text-destructive"}`}>{reviewingSession.score}%</p>
                    <p className="text-xs text-muted-foreground">Score</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-2xl font-bold">{reviewingSession.correctAnswers}/{reviewingSession.totalQuestions}</p>
                    <p className="text-xs text-muted-foreground">Correct</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {new Date(reviewingSession.timestamp).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                </p>
              </CardContent>
            </Card>

            {sessionAnswers.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Question Review</h3>
                {sessionAnswers.map((a: any, i: number) => (
                  <Card key={i} className={`border ${a.is_correct ? "border-primary/30" : "border-destructive/30"}`}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start gap-2">
                        {a.is_correct
                          ? <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium whitespace-pre-wrap">Q{i + 1}: {a.question_text}</p>
                          <div className="mt-1 space-y-0.5 text-xs">
                            <p>
                              <span className="text-muted-foreground">Your answer: </span>
                              <span className={a.is_correct ? "text-primary font-medium" : "text-destructive font-medium"}>
                                {a.selected || "Not answered"}
                              </span>
                            </p>
                            {!a.is_correct && (
                              <p>
                                <span className="text-muted-foreground">Correct: </span>
                                <span className="text-primary font-medium">{a.correct}</span>
                              </p>
                            )}
                          </div>
                        </div>
                        {a.topic && <Badge variant="outline" className="text-[10px] shrink-0">{a.topic}</Badge>}
                      </div>
                      {a.explanation && (
                        <div className="rounded-lg bg-muted/50 p-3 ml-6">
                          <div className="flex items-start gap-2 mb-1">
                            <Lightbulb className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                            <span className="text-[10px] font-semibold text-primary">Explanation</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{a.explanation}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Prompt phase
  if (phase === "prompt") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Practice Questions</h2>
          </div>
          <div className="flex items-center gap-2">
            {practiceHistory.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
                <History className="h-4 w-4 mr-1" /> History
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {showHistory ? (
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Past Practice Sessions</h3>
              {practiceHistory.map(h => (
                <button
                  key={h.id}
                  onClick={() => { setReviewingSession(h); setPhase("review-history"); }}
                  className="w-full text-left"
                >
                  <Card className="border hover:border-primary/30 transition-colors cursor-pointer">
                    <CardContent className="p-3 space-y-1.5">
                      <p className="text-sm font-medium truncate">{h.prompt}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className={`font-semibold ${h.score >= 70 ? "text-primary" : "text-destructive"}`}>{h.score}%</span>
                        <span>{h.correctAnswers}/{h.totalQuestions} correct</span>
                        <span>{new Date(h.timestamp).toLocaleDateString()}</span>
                      </div>
                      {h.topics.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {h.topics.slice(0, 3).map(t => (
                            <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-md space-y-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <BookOpen className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">What would you like to practice?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Tell us what you want to be tested on. If you don't specify, we'll generate questions based on where you are in the course.
                </p>
              </div>
              <div className="space-y-3 text-left">
                <Textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder={`e.g. "Test me on what I've learned so far" or "I need help with loops — give me 10 questions" or "Quiz me on my weak areas"`}
                  className="min-h-[100px] resize-none"
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && prompt.trim()) { e.preventDefault(); generateQuestions(); } }}
                />
                <Button onClick={generateQuestions} disabled={!prompt.trim()} className="w-full gap-2">
                  <Sparkles className="h-4 w-4" /> Generate Practice Questions
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Loading phase
  if (phase === "loading") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Practice Questions</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-center">
            <p className="font-medium">Generating your practice questions…</p>
            <p className="text-sm text-muted-foreground mt-1">This usually takes a few seconds</p>
          </div>
        </div>
      </div>
    );
  }

  // Review phase
  if (phase === "review" && results) {
    const passed = results.score >= 60;
    const wrongTopics = [...new Set(questions.filter(q => !getAnswerCorrectness(q)).map(q => q.topic))];

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Trophy className={`h-5 w-5 ${passed ? "text-primary" : "text-destructive"}`} />
            <h2 className="font-semibold">Practice Complete!</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="max-w-lg mx-auto space-y-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-2xl font-bold text-primary">{results.score}%</p>
                    <p className="text-xs text-muted-foreground">Score</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-2xl font-bold">{results.correct}/{results.total}</p>
                    <p className="text-xs text-muted-foreground">Correct</p>
                  </div>
                </div>
                <Progress value={results.score} className="h-2" />
              </CardContent>
            </Card>

            {wrongTopics.length > 0 && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Topics to review</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {wrongTopics.map(t => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Question Review</h3>
              {questions.map((q, i) => {
                const correct = getAnswerCorrectness(q);
                return (
                  <Card key={q.id} className={`border ${correct ? "border-primary/30" : "border-destructive/30"}`}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start gap-2">
                        {correct
                          ? <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium whitespace-pre-wrap">Q{i + 1}: {q.question}</p>
                          <div className="mt-1 space-y-0.5 text-xs">
                            <p>
                              <span className="text-muted-foreground">Your answer: </span>
                              <span className={correct ? "text-primary font-medium" : "text-destructive font-medium"}>
                                {answers[q.id] || "Not answered"}
                              </span>
                            </p>
                            {!correct && (
                              <p>
                                <span className="text-muted-foreground">Correct: </span>
                                <span className="text-primary font-medium">{q.answer}</span>
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">{q.topic}</Badge>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 ml-6">
                        <div className="flex items-start gap-2 mb-1">
                          <Lightbulb className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                          <span className="text-[10px] font-semibold text-primary">Explanation</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{q.explanation}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2 pb-4">
              <Button variant="outline" className="flex-1" onClick={onClose}>Back to Chat</Button>
              <Button className="flex-1" onClick={() => { setPhase("prompt"); setPrompt(""); }}>
                <Sparkles className="h-4 w-4 mr-1" /> Practice Again
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Active phase — one question at a time with instant feedback
  if (!currentQuestion) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Practice Questions</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} of {questions.length}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Progress value={((currentIndex + (isRevealed ? 1 : 0)) / questions.length) * 100} className="h-1.5" />
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-xs">{currentQuestion.topic}</Badge>
            <Badge variant="secondary" className="text-xs capitalize">{currentQuestion.type.replace("_", "/")}</Badge>
          </div>

          <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">
            {currentQuestion.question}
          </p>

          {currentQuestion.type === "mcq" && currentQuestion.options && (
            <RadioGroup
              value={answers[currentQuestion.id] || ""}
              onValueChange={v => handleAnswer(currentQuestion.id, v)}
              className="space-y-2"
              disabled={isRevealed}
            >
              {currentQuestion.options.map((opt, i) => {
                let borderClass = "";
                if (isRevealed) {
                  if (opt === currentQuestion.answer) borderClass = "border-primary bg-primary/5";
                  else if (opt === answers[currentQuestion.id]) borderClass = "border-destructive bg-destructive/5";
                } else if (answers[currentQuestion.id] === opt) {
                  borderClass = "border-primary bg-primary/5";
                }
                return (
                  <Label
                    key={i}
                    htmlFor={`pq-opt-${i}`}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50 ${borderClass}`}
                  >
                    <RadioGroupItem value={opt} id={`pq-opt-${i}`} disabled={isRevealed} />
                    <span className="text-sm">{opt}</span>
                    {isRevealed && opt === currentQuestion.answer && <CheckCircle className="h-4 w-4 text-primary ml-auto" />}
                    {isRevealed && opt === answers[currentQuestion.id] && opt !== currentQuestion.answer && <XCircle className="h-4 w-4 text-destructive ml-auto" />}
                  </Label>
                );
              })}
            </RadioGroup>
          )}

          {currentQuestion.type === "true_false" && (
            <div className="flex gap-3">
              {["True", "False"].map(opt => {
                let variant: "default" | "outline" | "destructive" = "outline";
                if (isRevealed) {
                  if (opt === currentQuestion.answer) variant = "default";
                  else if (opt === answers[currentQuestion.id]) variant = "destructive";
                } else if (answers[currentQuestion.id] === opt) {
                  variant = "default";
                }
                return (
                  <Button
                    key={opt}
                    type="button"
                    variant={variant}
                    className="flex-1 h-12 text-base"
                    onClick={() => !isRevealed && handleAnswer(currentQuestion.id, opt)}
                    disabled={isRevealed}
                  >
                    {opt}
                    {isRevealed && opt === currentQuestion.answer && <CheckCircle className="h-4 w-4 ml-2" />}
                  </Button>
                );
              })}
            </div>
          )}


          {requiresReasoning(currentQuestion.bloom_level) && (
            <>
              <ReasoningInput
                questionId={currentQuestion.id}
                value={reasoning.rationales[currentQuestion.id] ?? ""}
                onChange={reasoning.setRationale}
                showError={reasoning.showErrors}
                disabled={isRevealed}
              />
              <ReasoningVerdict evaluation={reasoning.evaluations[currentQuestion.id]} />
            </>
          )}


          {isAnswered && !isRevealed && (
            <Button onClick={handleReveal} className="w-full gap-2">
              <CheckCircle className="h-4 w-4" /> Check Answer
            </Button>
          )}

          {isRevealed && (
            <Card className={`border ${getAnswerCorrectness(currentQuestion) ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {getAnswerCorrectness(currentQuestion)
                    ? <><CheckCircle className="h-4 w-4 text-primary" /><span className="text-sm font-medium text-primary">Correct!</span></>
                    : <><XCircle className="h-4 w-4 text-destructive" /><span className="text-sm font-medium text-destructive">Incorrect</span></>
                  }
                </div>
                {!getAnswerCorrectness(currentQuestion) && (
                  <p className="text-xs"><span className="text-muted-foreground">Correct answer: </span><span className="font-medium">{currentQuestion.answer}</span></p>
                )}
                <div className="rounded-lg bg-background p-3">
                  <div className="flex items-start gap-2 mb-1">
                    <Lightbulb className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                    <span className="text-[10px] font-semibold text-primary">Explanation</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{currentQuestion.explanation}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {isRevealed && (
            <Button onClick={handleNext} className="w-full gap-2" disabled={submitting}>
              {submitting
                ? "Checking your reasoning…"
                : currentIndex < questions.length - 1 ? "Next Question" : "View Results"}
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default PracticeQuestionsWidget;
