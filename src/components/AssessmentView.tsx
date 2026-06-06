import { useState, useEffect, useCallback, useRef } from "react";
import { Question } from "@/data/questionBank";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Clock, Trophy, ClipboardList, GraduationCap, ShieldCheck, Loader2, BookOpen, Lightbulb, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AssessmentViewProps {
  type: "quiz" | "exam";
  questions: Question[];
  timeLimitMinutes: number;
  day?: number;
  onEnd: () => void;
  onSubmit: (results: AssessmentResults) => void;
  onStudyTopics?: (topics: string[]) => void;
}

export interface StandardisedAnswer {
  question_id: string;
  question_text: string;
  type: string;
  topic: string;
  selected: string;
  correct: string;
  is_correct: boolean;
  explanation?: string;
}

export type ConfidenceLevel = "not_confident" | "somewhat_confident" | "very_confident";

export interface AssessmentResults {
  totalQuestions: number;
  correctAnswers: number;
  score: number;
  answers: StandardisedAnswer[];
  timeSpent: number;
  confidences: Record<string, ConfidenceLevel>;
  questionTimes: Record<string, number>;
}

type Phase = "intro" | "active" | "review";

const AssessmentView = ({ type, questions, timeLimitMinutes, day, onEnd, onSubmit, onStudyTopics }: AssessmentViewProps) => {
  const [phase, setPhase] = useState<Phase>("intro");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(timeLimitMinutes * 60);
  const [results, setResults] = useState<AssessmentResults | null>(null);
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [loadingExplanations, setLoadingExplanations] = useState(false);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset pagination when (re)entering active phase
  useEffect(() => {
    if (phase === "active") setCurrentIndex(0);
  }, [phase]);


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
    const standardised: StandardisedAnswer[] = questions.map(q => {
      const userAnswer = answers[q.id] || "";
      let isCorrect = false;
      if (q.type === "short_answer") {
        isCorrect = userAnswer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
      } else if (q.type === "problem_solving") {
        const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
        isCorrect = normalize(userAnswer) === normalize(q.correctAnswer);
      } else {
        isCorrect = userAnswer === q.correctAnswer;
      }
      return {
        question_id: q.id,
        question_text: q.text,
        type: q.type || "mcq",
        topic: q.topic,
        selected: userAnswer,
        correct: q.correctAnswer,
        is_correct: isCorrect,
      };
    });
    const correct = standardised.filter(a => a.is_correct).length;
    const res: AssessmentResults = {
      totalQuestions: questions.length,
      correctAnswers: correct,
      score: Math.round((correct / questions.length) * 100),
      answers: standardised,
      timeSpent: timeLimitMinutes * 60 - timeLeft,
    };
    setResults(res);
    setPhase("review");
    onSubmit(res);

    const wrongIndices = new Set<number>();
    standardised.forEach((a, i) => { if (!a.is_correct) wrongIndices.add(i); });
    setExpandedQuestions(wrongIndices);

    fetchExplanations(standardised);
  }, [answers, questions, timeLeft, timeLimitMinutes, onSubmit]);

  const fetchExplanations = async (answersData: StandardisedAnswer[]) => {
    setLoadingExplanations(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/explain-answers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ answers: answersData }),
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.explanations)) {
          const map: Record<number, string> = {};
          data.explanations.forEach((e: { index: number; explanation: string }) => {
            map[e.index] = e.explanation;
          });
          setExplanations(map);
        }
      }
    } catch (e) {
      console.error("Failed to fetch explanations:", e);
    } finally {
      setLoadingExplanations(false);
    }
  };

  const toggleQuestion = (index: number) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const isQuiz = type === "quiz";
  const answeredCount = Object.keys(answers).length;

  // Render a single question card (reused in active phase)
  const renderQuestionCard = (q: Question, index: number) => (
    <Card key={q.id} className={`${answers[q.id] ? "border-primary/30" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Q{index + 1}</span>
            <Badge variant="outline" className="text-xs">{q.topic}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{q.difficulty}</Badge>
            {answers[q.id] && <CheckCircle className="h-4 w-4 text-primary" />}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.text}</p>

        {q.type === "mcq" && q.options && (
          <RadioGroup
            value={answers[q.id] || ""}
            onValueChange={(v) => handleAnswer(q.id, v)}
            className="space-y-2"
          >
            {q.options.map((opt, i) => (
              <Label
                key={i}
                htmlFor={`q${index}-opt-${i}`}
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                  answers[q.id] === opt ? "border-primary bg-primary/5" : ""
                }`}
              >
                <RadioGroupItem value={opt} id={`q${index}-opt-${i}`} />
                <span className="text-sm">{opt}</span>
              </Label>
            ))}
          </RadioGroup>
        )}

        {q.type === "true_false" && (
          <div className="flex gap-3">
            {["True", "False"].map((opt) => (
              <Button
                key={opt}
                type="button"
                variant={answers[q.id] === opt ? "default" : "outline"}
                className="flex-1 h-12 text-base"
                onClick={() => handleAnswer(q.id, opt)}
              >
                {opt}
              </Button>
            ))}
          </div>
        )}

        {q.type === "short_answer" && (
          <Textarea
            placeholder="Type your answer here…"
            value={answers[q.id] || ""}
            onChange={(e) => handleAnswer(q.id, e.target.value)}
            className="min-h-[100px]"
          />
        )}

        {q.type === "problem_solving" && (
          <div className="space-y-2">
            <Badge variant="secondary" className="text-[10px]">Code / Problem Solving</Badge>
            <Textarea
              placeholder="Write your code or solution here…"
              value={answers[q.id] || ""}
              onChange={(e) => handleAnswer(q.id, e.target.value)}
              className="min-h-[140px] font-mono text-sm"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );

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
              {isQuiz ? `Daily Quiz — Day ${day || 1}` : "Exam Practice Simulation"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p><strong className="text-foreground">{questions.length}</strong> questions</p>
              <p><strong className="text-foreground">{timeLimitMinutes} minutes</strong> time limit</p>
              {isQuiz && <p>Covers Day {day} topics</p>}
              {!isQuiz && <p>Covers all course topics</p>}
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
    const wrongAnswers = results.answers.filter(a => !a.is_correct);
    const weakTopics = [...new Set(wrongAnswers.map(a => a.topic))];

    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <Card>
            <CardHeader className="text-center">
              <div className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full ${passed ? "bg-primary/10" : "bg-destructive/10"}`}>
                <Trophy className={`h-7 w-7 ${passed ? "text-primary" : "text-destructive"}`} />
              </div>
              <CardTitle className="text-xl">
                {isQuiz ? "Daily Quiz Complete!" : "Exam Practice Complete!"}
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

          {weakTopics.length > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <Lightbulb className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Topics to strengthen</p>
                    <p className="text-xs text-muted-foreground">
                      Based on your results, we recommend reviewing these topics in Study mode for a deeper understanding:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {weakTopics.map(topic => (
                        <Badge key={topic} variant="secondary" className="text-xs">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                    {onStudyTopics && (
                      <Button
                        size="sm"
                        className="mt-2 gap-2"
                        onClick={() => onStudyTopics(weakTopics)}
                      >
                        <BookOpen className="h-4 w-4" />
                        Practice These Topics in Study Mode
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {results.score === 100 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Perfect score! 🎉</p>
                    <p className="text-xs text-muted-foreground">
                      Great job! You've demonstrated strong understanding across all topics. Keep it up!
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {loadingExplanations && (
            <div className="flex items-center justify-center gap-2 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating detailed explanations…</p>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Question Review</h3>
            {results.answers.map((a, i) => {
              const isExpanded = expandedQuestions.has(i);
              const explanation = explanations[i];

              return (
                <Card key={a.question_id} className={`border ${a.is_correct ? "border-primary/30" : "border-destructive/30"}`}>
                  <CardContent className="p-4 space-y-2">
                    <button onClick={() => toggleQuestion(i)} className="w-full text-left">
                      <div className="flex items-start gap-2">
                        {a.is_correct
                          ? <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium whitespace-pre-wrap">Q{i + 1}: {a.question_text}</p>
                          <div className="mt-1 space-y-0.5">
                            <p className="text-xs">
                              <span className="text-muted-foreground">Your answer: </span>
                              <span className={a.is_correct ? "text-primary font-medium" : "text-destructive font-medium"}>
                                {a.selected || "Not answered"}
                              </span>
                            </p>
                            {!a.is_correct && (
                              <p className="text-xs">
                                <span className="text-muted-foreground">Correct answer: </span>
                                <span className="text-primary font-medium">{a.correct}</span>
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-[10px]">{a.topic}</Badge>
                          {isExpanded
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          }
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                        {explanation ? (
                          <div className="prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                            <div className="flex items-start gap-2 mb-2">
                              <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                              <span className="text-xs font-semibold text-primary">Explanation</span>
                            </div>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{explanation}</ReactMarkdown>
                          </div>
                        ) : loadingExplanations ? (
                          <div className="flex items-center gap-2 py-2">
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Loading explanation…</span>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">Explanation not available.</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
            <Button variant="outline" onClick={onEnd}>Back to Home</Button>
            {weakTopics.length > 0 && onStudyTopics && (
              <Button onClick={() => onStudyTopics(weakTopics)} className="gap-2">
                <BookOpen className="h-4 w-4" />
                Study Weak Topics
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Active assessment — paginated for quiz, all-at-once for exam
  const safeIndex = Math.min(currentIndex, questions.length - 1);
  const isLast = safeIndex === questions.length - 1;
  const progressValue = isQuiz
    ? ((safeIndex + 1) / questions.length) * 100
    : (answeredCount / questions.length) * 100;

  return (
    <div className="flex flex-1 flex-col">
      {/* Sticky header with timer + progress */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <Badge variant={isQuiz ? "default" : "secondary"}>
              {isQuiz ? `Daily Quiz — Day ${day}` : "Exam Simulation"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {isQuiz
                ? `Question ${safeIndex + 1} of ${questions.length} · ${answeredCount} answered`
                : `${answeredCount}/${questions.length} answered`}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-mono font-bold ${timeLeft < 60 ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
              <Clock className="h-3.5 w-3.5" />
              {formatTime(timeLeft)}
            </div>
          </div>
        </div>
        <div className="px-5 pb-2">
          <Progress value={progressValue} className="h-1.5" />
        </div>
      </div>

      {/* Questions area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {isQuiz ? (
            <>
              {renderQuestionCard(questions[safeIndex], safeIndex)}

              <div className="flex items-center justify-between pt-4 pb-8 gap-3">
                <Button
                  variant="outline"
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  disabled={safeIndex === 0}
                  className="gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>

                {isLast ? (
                  <Button
                    onClick={handleFinish}
                    className="gap-2 px-6"
                    disabled={answeredCount === 0}
                  >
                    <CheckCircle className="h-5 w-5" />
                    Submit Quiz ({answeredCount}/{questions.length} answered)
                  </Button>
                ) : (
                  <Button
                    onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                    className="gap-2"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              {questions.map((q, i) => renderQuestionCard(q, i))}

              <div className="flex justify-center pt-4 pb-8">
                <Button
                  onClick={handleFinish}
                  size="lg"
                  className="gap-2 px-8"
                  disabled={answeredCount === 0}
                >
                  <CheckCircle className="h-5 w-5" />
                  Submit Exam ({answeredCount}/{questions.length} answered)
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

};

export default AssessmentView;
