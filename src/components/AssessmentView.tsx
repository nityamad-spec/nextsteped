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
import { computeWeeklyQuizScore, type ScoreItem } from "@/lib/masteryScoring";
import ReasoningInput from "@/components/ReasoningInput";
import ReasoningVerdict from "@/components/ReasoningVerdict";
import { useReasoningAnswers } from "@/hooks/useReasoningAnswers";
import {
  requiresReasoning,
  reasoningEarnedFactor,
  verdictFor,
  REASONING_EVAL_DEADLINE_MS,
  type ReasoningEvaluation,
} from "@/lib/reasoning";

import { toast } from "sonner";
import {
  useProctoring,
  exitFullscreen,
  fullscreenSupported,
  type ProctorViolation,
} from "@/hooks/useProctoring";


interface AssessmentViewProps {
  type: "quiz" | "exam";
  questions: Question[];
  timeLimitMinutes: number;
  day?: number;
  onEnd: () => void;
  onSubmit: (results: AssessmentResults) => void;
  onStudyTopics?: (topics: string[]) => void;
  questionMeta?: Map<string, { difficulty: number; bloom: number }>;
  courseId?: string | null;
  /** Enable browser lock: fullscreen, copy/paste block, warn-then-void. */
  proctored?: boolean;
  /** Element to put into fullscreen when proctored. */
  fullscreenTargetRef?: React.RefObject<HTMLElement>;
  /** Called when the attempt is voided for leaving the quiz. */
  onVoided?: (reason: string) => void;
}



const BLOOM_WEIGHT: Record<number, number> = { 1: 1.0, 2: 1.2, 3: 1.5, 4: 1.8, 5: 2.1, 6: 2.5 };
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const clampBloom = (n: number) => Math.min(6, Math.max(1, Math.round(n)));

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
  flatScore?: number;
  weightedScore?: number;
  /** Phase 8: 0..1 accuracy component of the 80/20 mastery score (quiz mode). */
  accuracyScore?: number;
  /** Phase 8: 0..1 pace component of the 80/20 mastery score (quiz mode). */
  paceScore?: number;
  answers: StandardisedAnswer[];
  timeSpent: number;
  confidences?: Record<string, ConfidenceLevel>;
  questionTimes: Record<string, number>;
  /** Mandatory rationales captured for Bloom 3+ questions, keyed by question id. */
  rationales?: Record<string, string>;
  /** AI evaluation of each rationale, keyed by question id. */
  evaluations?: Record<string, ReasoningEvaluation>;
}

type Phase = "intro" | "active" | "review" | "voided";

const AssessmentView = ({ type, questions, timeLimitMinutes, day, onEnd, onSubmit, onStudyTopics, questionMeta, courseId, proctored = false, fullscreenTargetRef, onVoided }: AssessmentViewProps) => {
  const [phase, setPhase] = useState<Phase>("intro");
  const [warningOpen, setWarningOpen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(timeLimitMinutes * 60);
  const [results, setResults] = useState<AssessmentResults | null>(null);
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [loadingExplanations, setLoadingExplanations] = useState(false);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lockedIndices, setLockedIndices] = useState<Set<number>>(new Set());
  // confidence collection removed for quizzes/exams
  const [questionTimes, setQuestionTimes] = useState<Record<string, number>>({});
  const questionStartRef = useRef<number>(Date.now());
  const reasoning = useReasoningAnswers();
  const [submitting, setSubmitting] = useState(false);

  const bloomFor = useCallback(
    (qid: string) => Number(questionMeta?.get(qid)?.bloom ?? 1),
    [questionMeta],
  );
  const reasoningRefs = questions.map((q) => ({ id: q.id, bloom: bloomFor(q.id) }));

  /** Fire the background AI evaluation of a question's rationale. */
  const evaluateQuestion = useCallback(
    (q: Question | undefined) => {
      if (!q) return;
      reasoning.evaluate({
        questionId: q.id,
        questionText: q.text,
        options: q.options,
        correctAnswer: q.correctAnswer,
        selectedAnswer: answers[q.id] ?? null,
        topic: q.topic,
        bloom: bloomFor(q.id),
        courseId: courseId ?? null,
      });
    },
    [reasoning, answers, bloomFor, courseId],
  );


  // Helper: flush elapsed time onto a question id
  const flushTimeFor = useCallback((qid: string | undefined) => {
    if (!qid) return;
    const now = Date.now();
    const elapsed = Math.max(0, Math.round((now - questionStartRef.current) / 1000));
    questionStartRef.current = now;
    setQuestionTimes(prev => ({ ...prev, [qid]: (prev[qid] ?? 0) + elapsed }));
  }, []);

  // Reset pagination when (re)entering active phase
  useEffect(() => {
    if (phase === "active") {
      setCurrentIndex(0);
      questionStartRef.current = Date.now();
    }
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

  // Browser lock: leaving the assessment (tab switch, window/app switch,
  // minimise, fullscreen exit) warns once, then voids the attempt.
  const handleVoid = useCallback(
    (kind: ProctorViolation) => {
      setWarningOpen(false);
      setPhase("voided");
      void exitFullscreen();
      onVoided?.(kind);
    },
    [onVoided],
  );

  const proctor = useProctoring({
    enabled: proctored && phase === "active",
    paused: warningOpen,
    targetRef: fullscreenTargetRef,
    allowedViolations: 1,
    onWarn: () => setWarningOpen(true),
    onVoid: handleVoid,
  });

  // Legacy behaviour for non-proctored assessments: discard on leaving.
  useEffect(() => {
    if (proctored) return;
    if (phase !== "active") return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onEnd();
    };
    const onPageHide = () => onEnd();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [phase, onEnd, proctored]);


  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleFinish = useCallback(() => {
    // Flush time on the currently-shown question (quiz mode only meaningful, but harmless either way)
    const currentQid = questions[Math.min(currentIndex, questions.length - 1)]?.id;
    const now = Date.now();
    const elapsed = Math.max(0, Math.round((now - questionStartRef.current) / 1000));
    const finalTimes: Record<string, number> = { ...questionTimes };
    if (currentQid) {
      finalTimes[currentQid] = (finalTimes[currentQid] ?? 0) + elapsed;
    }

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
      const base: StandardisedAnswer = {
        question_id: q.id,
        question_text: q.text,
        type: q.type || "mcq",
        topic: q.topic,
        selected: userAnswer,
        correct: q.correctAnswer,
        is_correct: isCorrect,
      };

      return base;
    });

    const correct = standardised.filter(a => a.is_correct).length;
    const flatScore = Math.round((correct / questions.length) * 100);

    // Reasoning verdicts collected during the attempt — they move points earned
    // on Bloom 3+ questions, never the max a question is worth.
    const evaluations = reasoning.getEvaluations();

    // Weighted score (difficulty × Bloom) when meta is available. Retained for
    // backward compatibility with existing review UI + analytics consumers.
    // Exam mode displays this score, so the verdict applies here too.
    let weightedScore: number | undefined;
    if (questionMeta && questionMeta.size > 0) {
      let num = 0;
      let den = 0;
      for (const a of standardised) {
        const meta = questionMeta.get(a.question_id) ?? { difficulty: 0.5, bloom: 1 };
        const bloom = clampBloom(meta.bloom);
        const bloomWeight = BLOOM_WEIGHT[bloom] ?? 1.0;
        const maxPoints = clamp01(meta.difficulty) * bloomWeight;
        den += maxPoints;
        num += maxPoints * reasoningEarnedFactor({
          bloom,
          bloomWeight,
          isCorrect: a.is_correct,
          verdict: verdictFor(evaluations, a.question_id),
        });
      }
      if (den > 0) weightedScore = Math.round((num / den) * 100);
    }

    // Phase 8: quiz mode uses the diagnostic 80% accuracy + 20% pace blend.
    // Exam / other modes keep the legacy weighted-accuracy display.
    let accuracyScore: number | undefined;
    let paceScore: number | undefined;
    let displayScore = weightedScore ?? flatScore;
    if (type === "quiz" && questionMeta && questionMeta.size > 0) {
      const items: ScoreItem[] = standardised.map(a => {
        const meta = questionMeta.get(a.question_id) ?? { difficulty: 0.5, bloom: 1 };
        // questionTimes is tracked in seconds; convert to ms for the pace formula.
        const secs = finalTimes[a.question_id] ?? 0;
        return {
          difficulty: meta.difficulty,
          bloom: meta.bloom,
          is_correct: a.is_correct,
          time_ms: secs * 1000,
          verdict: verdictFor(evaluations, a.question_id),
        };
      });
      const scored = computeWeeklyQuizScore(items);
      accuracyScore = scored.accuracyScore;
      paceScore = scored.paceScore;
      displayScore = scored.displayScore;
    }


    const res: AssessmentResults = {
      totalQuestions: questions.length,
      correctAnswers: correct,
      score: displayScore,
      flatScore,
      weightedScore,
      accuracyScore,
      paceScore,
      answers: standardised,
      timeSpent: timeLimitMinutes * 60 - timeLeft,
      questionTimes: finalTimes,
      rationales: reasoning.rationales,
      evaluations,
    };
    setResults(res);
    setPhase("review");
    onSubmit(res);

    const wrongIndices = new Set<number>();
    standardised.forEach((a, i) => { if (!a.is_correct) wrongIndices.add(i); });
    setExpandedQuestions(wrongIndices);

    fetchExplanations(standardised);
  }, [answers, questions, timeLeft, timeLimitMinutes, onSubmit, questionTimes, currentIndex, questionMeta, type, reasoning]);

  /**
   * Manual submit path — enforces the mandatory rationale on Bloom 3+ questions.
   * The timer's auto-submit calls handleFinish directly so a timeout can never
   * trap the student.
   */
  const attemptFinish = useCallback(async () => {
    const missing = reasoning.missingReasoning(reasoningRefs);
    if (missing.length > 0) {
      reasoning.setShowErrors(true);
      const numbers = missing
        .map((id) => questions.findIndex((q) => q.id === id) + 1)
        .filter((n) => n > 0)
        .sort((a, b) => a - b);
      if (type === "quiz" && numbers.length > 0) setCurrentIndex(numbers[0] - 1);
      toast.error("Reasoning required", {
        description: `Explain your reasoning for question${numbers.length > 1 ? "s" : ""} ${numbers.join(", ")} before submitting.`,
      });
      return;
    }
    setSubmitting(true);
    // Evaluate anything the student has not advanced past yet (exam mode shows
    // every question at once; quiz mode's last question was never "Next"-ed).
    await reasoning.flushAndWait(
      questions.map((q) => ({
        questionId: q.id,
        questionText: q.text,
        options: q.options,
        correctAnswer: q.correctAnswer,
        selectedAnswer: answers[q.id] ?? null,
        topic: q.topic,
        bloom: bloomFor(q.id),
        courseId: courseId ?? null,
      })),
      REASONING_EVAL_DEADLINE_MS,
    );
    setSubmitting(false);
    handleFinish();
  }, [reasoning, reasoningRefs, questions, handleFinish, type, bloomFor, answers, courseId]);

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

  // Local correctness comparison (mirrors handleFinish rules) — used only for quiz follow-up gating.
  const isPrimaryCorrect = (q: Question, ans: string | undefined): boolean => {
    if (!ans) return false;
    if (q.type === "short_answer") return ans.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
    if (q.type === "problem_solving") {
      const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
      return norm(ans) === norm(q.correctAnswer);
    }
    return ans === q.correctAnswer;
  };

  // Render a single question card (reused in active phase)
  const renderQuestionCard = (q: Question, index: number) => {
    return (
    <Card key={q.id} className={`${answers[q.id] ? "border-primary/30" : ""}`}>

      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Q{index + 1}</span>
            <Badge variant="outline" className="text-xs">{q.topic}</Badge>
          </div>
          <div className="flex items-center gap-2">
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

        {requiresReasoning(bloomFor(q.id)) && (
          <>
            <ReasoningInput
              questionId={q.id}
              value={reasoning.rationales[q.id] ?? ""}
              onChange={reasoning.setRationale}
              showError={reasoning.showErrors}
            />
            <ReasoningVerdict evaluation={reasoning.evaluations[q.id]} />
          </>
        )}

        {/* Confidence selector removed — not collected for quizzes/exams */}

      </CardContent>
    </Card>
    );
  };



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
              {isQuiz ? `Weekly Quiz — Week ${day || 1}` : "Exam Practice Simulation"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p><strong className="text-foreground">{questions.length}</strong> questions</p>
              <p><strong className="text-foreground">{timeLimitMinutes} minutes</strong> time limit</p>
              {isQuiz && <p>Covers Week {day} topics</p>}
              {!isQuiz && <p>Covers all course topics</p>}
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-xs text-muted-foreground">
                ⚠️ Once started, navigating away — including <strong className="text-destructive">switching browser tabs or windows</strong> — will <strong className="text-destructive">discard</strong> your progress.
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
                {isQuiz ? "Weekly Quiz Complete!" : "Exam Practice Complete!"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="group rounded-lg bg-muted p-3">
                  <p className="text-2xl font-bold text-primary">{results.score}%</p>
                  <p className="text-xs text-muted-foreground">Score</p>
                  <div className="mt-2 space-y-0.5 text-left opacity-100 max-h-24 transition-all duration-200 sm:opacity-0 sm:max-h-0 sm:group-hover:opacity-100 sm:group-hover:max-h-24 overflow-hidden">
                    <p className="text-[10px] leading-tight text-muted-foreground/80">
                      {isQuiz
                        ? "Score accounts for question difficulty, accuracy, and time."
                        : "Score accounts for question difficulty and accuracy."}
                    </p>
                  </div>
                </div>
                <div className="group rounded-lg bg-muted p-3">
                  <p className="text-2xl font-bold">{results.correctAnswers}/{results.totalQuestions}</p>
                  <p className="text-xs text-muted-foreground">Correct</p>
                  <div className="mt-2 space-y-0.5 text-left opacity-100 max-h-24 transition-all duration-200 sm:opacity-0 sm:max-h-0 sm:group-hover:opacity-100 sm:group-hover:max-h-24 overflow-hidden">
                    <p className="text-[10px] leading-tight text-muted-foreground/80">
                      Score accounts only for accuracy.
                    </p>
                    <p className="text-[10px] font-medium text-muted-foreground">
                      {results.correctAnswers}/{results.totalQuestions} correct ({Math.round((results.correctAnswers / (results.totalQuestions || 1)) * 100)}%)
                    </p>
                  </div>
                </div>
                <div className="group rounded-lg bg-muted p-3">
                  {(() => {
                    const avgSec = Math.round(results.timeSpent / (results.totalQuestions || 1));
                    return (
                      <>
                        <p className="text-2xl font-bold">{avgSec}s</p>
                        <p className="text-xs text-muted-foreground">Time</p>
                        <div className="mt-2 space-y-0.5 text-left opacity-100 max-h-24 transition-all duration-200 sm:opacity-0 sm:max-h-0 sm:group-hover:opacity-100 sm:group-hover:max-h-24 overflow-hidden">
                          <p className="text-[10px] leading-tight text-muted-foreground/80">
                            seconds per question
                          </p>
                          <p className="text-[10px] font-medium text-muted-foreground">
                            {avgSec}s/question
                          </p>
                        </div>
                      </>
                    );
                  })()}
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
                    <button onClick={() => toggleQuestion(i)} className="w-full text-left space-y-2">
                      <div className="flex items-center gap-2">
                        {a.is_correct
                          ? <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                          : <XCircle className="h-4 w-4 text-destructive shrink-0" />
                        }
                        <Badge
                          variant="outline"
                          title={a.topic}
                          className="text-[10px] max-w-[70%] truncate inline-block"
                        >
                          {a.topic}
                        </Badge>
                        <div className="ml-auto shrink-0">
                          {isExpanded
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          }
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium whitespace-pre-wrap break-words">Q{i + 1}: {a.question_text}</p>
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
              {isQuiz ? `Weekly Quiz — Week ${day}` : "Exam Simulation"}
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
                  onClick={() => {
                    flushTimeFor(questions[safeIndex]?.id);
                    setCurrentIndex((i) => Math.max(0, i - 1));
                  }}
                  disabled={safeIndex === 0 || lockedIndices.has(safeIndex - 1)}
                  className="gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>

                {(() => {
                  const currentRef = reasoningRefs[safeIndex];
                  const blocked = reasoning.isQuestionBlocked(currentRef);
                  return isLast ? (
                    <Button
                      onClick={attemptFinish}
                      className="gap-2 px-6"
                      disabled={answeredCount === 0 || submitting}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Checking your reasoning…
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-5 w-5" />
                          Submit Quiz ({answeredCount}/{questions.length} answered)
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        if (blocked) {
                          reasoning.setShowErrors(true);
                          toast.error("Reasoning required", {
                            description: "Explain your reasoning for this question before moving on.",
                          });
                          return;
                        }
                        evaluateQuestion(questions[safeIndex]);
                        const currentQid = questions[safeIndex]?.id;
                        flushTimeFor(currentQid);
                        if (currentQid && answers[currentQid] !== undefined) {
                          setLockedIndices((prev) => {
                            const next = new Set(prev);
                            next.add(safeIndex);
                            return next;
                          });
                        }
                        setCurrentIndex((i) => Math.min(questions.length - 1, i + 1));
                      }}
                      className="gap-2"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  );
                })()}

              </div>
            </>
          ) : (
            <>
              {questions.map((q, i) => renderQuestionCard(q, i))}

              <div className="flex justify-center pt-4 pb-8">
                <Button
                  onClick={attemptFinish}
                  size="lg"
                  className="gap-2 px-8"
                  disabled={answeredCount === 0 || submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Checking your reasoning…
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      Submit Exam ({answeredCount}/{questions.length} answered)
                    </>
                  )}
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
