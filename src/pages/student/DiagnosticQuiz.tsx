import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { ArrowRight, ArrowLeft, Brain, Zap, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { seededShuffle } from "@/lib/seededShuffle";
import {
  STANDARD_COUNT,
  ADAPTIVE_COUNT,
  TOTAL_COUNT,
  pickBranchTier,
  computeStandardCorrect,
  // computeLearnerLevel is server-authoritative (score-diagnostic edge fn);
  // no longer imported client-side.
  type BranchTier,
} from "@/lib/diagnosticBranching";
import ReasoningInput from "@/components/ReasoningInput";
import { useReasoningAnswers, saveReasoningRows } from "@/hooks/useReasoningAnswers";
import { buildReasoningRows } from "@/lib/buildReasoningRows";
import ReasoningVerdict from "@/components/ReasoningVerdict";
import { requiresReasoning, verdictFor, REASONING_EVAL_DEADLINE_MS } from "@/lib/reasoning";
import { useProctoring, exitFullscreen, fullscreenSupported, type ProctorViolation } from "@/hooks/useProctoring";
import { countAttemptVoids, recordAttemptVoid, VOID_LOCK_THRESHOLD } from "@/lib/attemptVoids";
import { ShieldCheck, AlertTriangle } from "lucide-react";



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
  tier: "standard" | "easy" | "medium" | "hard";
  bloomLevel: number;
}

const answerLetters = ["A", "B", "C", "D", "E", "F"];

function mapRow(row: any): QuizQuestion {
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
    tier: (row.tier as QuizQuestion["tier"]) || "standard",
    bloomLevel: Math.min(6, Math.max(1, Math.round(Number(row.bloom_level) || 1))),
  };
}


const DiagnosticQuiz = () => {
  const { studentProfile, setStudentProfile, setDiagnosticComplete } = useApp();
  const { user } = useAuth();
  const reasoning = useReasoningAnswers();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const courseParam = searchParams.get("course");
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [answers, setAnswers] = useState<number[]>([]);
  const [textAnswers, setTextAnswers] = useState<string[]>([]);
  const [phase, setPhase] = useState<"loading" | "intro" | "quiz" | "result" | "already-completed">("loading");
  const [existingResult, setExistingResult] = useState<{
    score: number;
    total: number;
    completedAt: string | null;
    courseName: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);
  const [questionTimes, setQuestionTimes] = useState<number[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [branchTier, setBranchTier] = useState<BranchTier | null>(null);
  const [loadingBranch, setLoadingBranch] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!user || initialized) return;
      setInitialized(true);

      // Resolve target course: URL param > localStorage > newest enrollment.
      let courseId = courseParam || localStorage.getItem("enrolledCourseId");

      if (!courseId) {
        const { data: enrollment } = await supabase
          .from("enrollments")
          .select("course_id")
          .eq("student_id", user.id)
          .order("enrolled_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        courseId = enrollment?.course_id || null;
      }

      if (!courseId) {
        setQuestions([]);
        setPhase("intro");
        return;
      }

      setActiveCourseId(courseId);
      localStorage.setItem("enrolledCourseId", courseId);
      // Persist as the active course so the dashboard lands on it.
      await supabase.from("profiles").update({ active_course_id: courseId }).eq("id", user.id);

      const progressKey = `diagnosticProgress:${user.id}:${courseId}`;

      const { data: existing } = await supabase
        .from("diagnostic_results")
        .select("id, score, total_questions, created_at")
        .eq("student_id", user.id)
        .eq("course_id", courseId)
        .maybeSingle();

      if (existing) {
        try { localStorage.removeItem(progressKey); } catch {}
        setDiagnosticComplete(true);
        const { data: course } = await supabase
          .from("courses")
          .select("name")
          .eq("id", courseId)
          .maybeSingle();
        setExistingResult({
          score: existing.score ?? 0,
          total: existing.total_questions ?? 0,
          completedAt: existing.created_at ?? null,
          courseName: course?.name ?? null,
        });
        setPhase("already-completed");
        return;
      }

      const { data: dbQuestions, error } = await supabase
        .from("diagnostic_questions")
        .select("*")
        .eq("in_test", true)
        .eq("course_id", courseId)
        .eq("tier", "standard")
        .order("difficulty_estimate", { ascending: true });

      if (error || !dbQuestions || dbQuestions.length < STANDARD_COUNT) {
        setQuestions([]);
        setPhase("intro");
        return;
      }

      const mapped: QuizQuestion[] = dbQuestions.map(mapRow);

      // Seeded shuffle of standard tier; cap at STANDARD_COUNT
      const standardShuffled = seededShuffle(mapped, user.id + courseId + ":standard").slice(0, STANDARD_COUNT);
      setQuestions(standardShuffled);

      // Try to restore in-progress quiz state from localStorage
      try {
        const raw = localStorage.getItem(progressKey);
        if (raw) {
          const saved = JSON.parse(raw);
          const validShape =
            saved &&
            saved.v === 2 &&
            Array.isArray(saved.questionIds) &&
            Array.isArray(saved.answers) &&
            Array.isArray(saved.textAnswers) &&
            Array.isArray(saved.confidences) &&
            Array.isArray(saved.questionTimes) &&
            Array.isArray(saved.standardIds) &&
            typeof saved.currentQ === "number";

          const standardMatches =
            validShape &&
            saved.standardIds.length === STANDARD_COUNT &&
            saved.standardIds.every((id: string, i: number) => standardShuffled[i]?.id === id);

          if (!standardMatches) {
            localStorage.removeItem(progressKey);
          } else if (!saved.branchTier) {
            // Phase A in progress (no branch chosen yet)
            const validPrefix =
              saved.currentQ >= 0 &&
              saved.currentQ < STANDARD_COUNT &&
              saved.currentQ === saved.questionIds.length;
            if (validPrefix) {
              setCurrentQ(saved.currentQ);
              setAnswers(saved.answers);
              setTextAnswers(saved.textAnswers);
              setQuestionTimes(saved.questionTimes);
              setQuestionIds(saved.questionIds);
              setSelected(typeof saved.selected === "number" ? saved.selected : null);
              setTextAnswer(typeof saved.textAnswer === "string" ? saved.textAnswer : "");
              setQuestionStartTime(typeof saved.questionStartTime === "number" ? saved.questionStartTime : Date.now());
              setPhase("quiz");
              return;
            }
            localStorage.removeItem(progressKey);
          } else {
            // Phase B — branch tier was chosen; reload that tier's questions and resume
            const branch = saved.branchTier as BranchTier;
            const { data: branchRows } = await supabase
              .from("diagnostic_questions")
              .select("*")
              .eq("in_test", true)
              .eq("course_id", courseId)
              .eq("tier", branch)
              .order("difficulty_estimate", { ascending: true });
            if (branchRows && branchRows.length >= ADAPTIVE_COUNT) {
              const branchMapped = branchRows.map(mapRow);
              const branchShuffled = seededShuffle(branchMapped, user.id + courseId + ":" + branch).slice(0, ADAPTIVE_COUNT);
              const full = [...standardShuffled, ...branchShuffled];
              const adaptiveIds = branchShuffled.map((q) => q.id);
              const adaptiveMatches =
                Array.isArray(saved.adaptiveIds) &&
                saved.adaptiveIds.length === ADAPTIVE_COUNT &&
                saved.adaptiveIds.every((id: string, i: number) => adaptiveIds[i] === id);
              const validPrefix =
                adaptiveMatches &&
                saved.currentQ >= STANDARD_COUNT &&
                saved.currentQ < TOTAL_COUNT &&
                saved.currentQ === saved.questionIds.length;
              if (validPrefix) {
                setQuestions(full);
                setBranchTier(branch);
                setCurrentQ(saved.currentQ);
                setAnswers(saved.answers);
                setTextAnswers(saved.textAnswers);
                setQuestionTimes(saved.questionTimes);
                setQuestionIds(saved.questionIds);
                setSelected(typeof saved.selected === "number" ? saved.selected : null);
                setTextAnswer(typeof saved.textAnswer === "string" ? saved.textAnswer : "");
                setQuestionStartTime(typeof saved.questionStartTime === "number" ? saved.questionStartTime : Date.now());
                setPhase("quiz");
                return;
              }
            }
            localStorage.removeItem(progressKey);
          }
        }
      } catch {
        try { localStorage.removeItem(progressKey); } catch {}
      }

      setPhase("intro");
    };
    init();
  }, [user]);

  const question = questions[currentQ];
  const isShortAnswer = question?.format === "short_answer";
  const hasAnswer = isShortAnswer ? textAnswer.trim().length > 0 : selected !== null;
  const canProceed = hasAnswer;


  // Persist in-progress quiz state so a refresh resumes at the same place.
  useEffect(() => {
    if (!user || !activeCourseId || phase !== "quiz") return;
    const standardIds = questions.slice(0, STANDARD_COUNT).map((q) => q.id);
    const adaptiveIds = branchTier ? questions.slice(STANDARD_COUNT, TOTAL_COUNT).map((q) => q.id) : null;
    if (standardIds.length !== STANDARD_COUNT) return;
    const payload = {
      v: 2 as const,
      phase: "quiz" as const,
      currentQ,
      answers,
      textAnswers,
      confidences: [] as number[],
      questionTimes,
      questionIds,
      standardIds,
      adaptiveIds,
      branchTier,
      selected,
      textAnswer,
      questionStartTime,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(
        `diagnosticProgress:${user.id}:${activeCourseId}`,
        JSON.stringify(payload),
      );
    } catch {}
  }, [user, activeCourseId, phase, currentQ, answers, textAnswers, questionTimes, questionIds, selected, textAnswer, questionStartTime, questions, branchTier]);

  const handleAnswer = async () => {
    if (!canProceed) return;
    if (reasoning.isQuestionBlocked({ id: question.id, bloom: question.bloomLevel })) {
      reasoning.setShowErrors(true);
      toast.error("Reasoning required", {
        description: "Explain your reasoning for this question before moving on.",
      });
      return;
    }
    reasoning.setShowErrors(false);
    // Background AI review of the rationale — never blocks the student.
    reasoning.evaluate({
      questionId: question.id,
      questionText: question.question,
      options: question.options,
      correctAnswer: question.correctAnswer,
      selectedAnswer: isShortAnswer ? textAnswer.trim() : (question.options?.[selected!] ?? null),
      topic: question.topic,
      bloom: question.bloomLevel,
      courseId: activeCourseId ?? null,
    });
    const elapsed = Date.now() - questionStartTime;
    const answerValue = isShortAnswer ? -1 : selected!;
    const newAnswers = [...answers, answerValue];
    const newTextAnswers = [...textAnswers, isShortAnswer ? textAnswer.trim() : ""];
    const newConfidences: number[] = [];
    const newQuestionTimes = [...questionTimes, elapsed];
    const newQuestionIds = [...questionIds, question.id];
    setAnswers(newAnswers);
    setTextAnswers(newTextAnswers);
    setQuestionTimes(newQuestionTimes);
    setQuestionIds(newQuestionIds);
    setSelected(null);
    setTextAnswer("");

    const justFinishedStandard =
      currentQ === STANDARD_COUNT - 1 && !branchTier && activeCourseId;

    if (justFinishedStandard) {
      // Compute branch tier from standard answers
      const standardCorrect = computeStandardCorrect(
        questions.slice(0, STANDARD_COUNT),
        newAnswers,
        newTextAnswers,
      );
      const branch = pickBranchTier(standardCorrect);

      setLoadingBranch(true);
      const { data: branchRows } = await supabase
        .from("diagnostic_questions")
        .select("*")
        .eq("in_test", true)
        .eq("course_id", activeCourseId)
        .eq("tier", branch)
        .order("difficulty_estimate", { ascending: true });
      setLoadingBranch(false);

      if (!branchRows || branchRows.length < ADAPTIVE_COUNT) {
        // Fallback — just submit with what we have
        await submitFinal(newAnswers, newTextAnswers, newConfidences, newQuestionTimes, newQuestionIds, questions.slice(0, STANDARD_COUNT), branch);
        return;
      }

      const branchMapped = branchRows.map(mapRow);
      const branchShuffled = seededShuffle(branchMapped, user!.id + activeCourseId + ":" + branch).slice(0, ADAPTIVE_COUNT);
      setBranchTier(branch);
      setQuestions((prev) => [...prev.slice(0, STANDARD_COUNT), ...branchShuffled]);
      setCurrentQ(currentQ + 1);
      setQuestionStartTime(Date.now());
      return;
    }

    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
      setQuestionStartTime(Date.now());
      return;
    }

    await submitFinal(newAnswers, newTextAnswers, newConfidences, newQuestionTimes, newQuestionIds, questions, branchTier);
  };

  const submitFinal = async (
    newAnswers: number[],
    newTextAnswers: string[],
    newConfidences: number[],
    newQuestionTimes: number[],
    newQuestionIds: string[],
    finalQuestions: QuizQuestion[],
    branch: BranchTier | null,
  ) => {
    const standardisedAnswers = finalQuestions.map((q, i) => {
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
        tier: q.tier,
        selected: selectedValue,
        correct: correctValue,
        is_correct: isCorrect,
        time_ms: newQuestionTimes[i],
        confidence: newConfidences[i],
      };
    });

    if (!user) {
      setPhase("result");
      return;
    }

    setSaving(true);
    const courseIdForSave = finalQuestions[0]?.courseId || activeCourseId || null;
    if (!courseIdForSave) {
      setSaving(false);
      toast.error("Missing course context. Please try again.");
      return;
    }

    const bloomById = new Map(finalQuestions.map((q) => [q.id, q.bloomLevel]));
    // Evaluate every rationale BEFORE scoring — the verdicts feed the score.
    // Includes the last question, whose rationale was typed but never "Next"-ed.
    await reasoning.flushAndWait(
      finalQuestions.map((q, i) => ({
        questionId: q.id,
        questionText: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        selectedAnswer:
          q.format === "short_answer"
            ? newTextAnswers[i]
            : (q.options?.[newAnswers[i]] ?? null),
        topic: q.topic,
        bloom: q.bloomLevel,
        courseId: courseIdForSave ?? null,
      })),
      REASONING_EVAL_DEADLINE_MS,
    );
    const evaluations = reasoning.getEvaluations();
    const answersForScoring = standardisedAnswers.map((a) => ({
      ...a,
      reasoning_verdict: verdictFor(evaluations, a.question_id),
    }));

    const { data: scored, error: fnErr } = await supabase.functions.invoke("score-diagnostic", {
      body: {
        course_id: courseIdForSave,
        branch_tier: branch,
        answers: answersForScoring,
        confidences: newConfidences,
        question_times: newQuestionTimes,
        question_ids: newQuestionIds,
      },
    });

    if (fnErr || (scored && (scored as { error?: string }).error)) {
      setSaving(false);
      const errCode = (scored as { error?: string } | null)?.error ?? "";
      if (errCode === "already_submitted") {
        toast.info("You've already submitted this diagnostic.");
        try { localStorage.removeItem(`diagnosticProgress:${user.id}:${courseIdForSave}`); } catch {}
        setDiagnosticComplete(true);
        navigate("/student/home", { replace: true });
        return;
      }
      console.error("Failed to score diagnostic:", fnErr ?? scored);
      toast.error("Couldn't save your diagnostic. Please try again.");
      return;
    }

    const level = (scored as { learner_level?: string })?.learner_level as
      | "beginner" | "developing" | "proficient" | "expert" | undefined;

    if (studentProfile && level) {
      setStudentProfile({ ...studentProfile, learnerLevel: level });
    }

    void saveReasoningRows(
      buildReasoningRows({
        studentId: user.id,
        courseId: courseIdForSave,
        sourceFormat: "diagnostic",
        questionSource: "diagnostic_questions",
        sourceResultId: (scored as { result_id?: string } | null)?.result_id ?? null,
        answers: standardisedAnswers,
        rationales: reasoning.rationales,
        evaluations,
        bloomFor: (qid) => bloomById.get(qid) ?? 1,
      }),
    );


    setSaving(false);

    if (activeCourseId) {
      try { localStorage.removeItem(`diagnosticProgress:${user.id}:${activeCourseId}`); } catch {}
    }

    setPhase("result");
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

  if (phase === "already-completed") {
    const pct = existingResult && existingResult.total > 0
      ? Math.round((existingResult.score / existingResult.total) * 100)
      : null;
    const completedLabel = existingResult?.completedAt
      ? new Date(existingResult.completedAt).toLocaleDateString(undefined, {
          year: "numeric", month: "short", day: "numeric",
        })
      : null;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg">
          <Card>
            <CardContent className="p-8 text-center space-y-5">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-1">
                <h2 className="font-heading text-2xl font-bold">Diagnostic Already Completed</h2>
                <p className="text-sm text-muted-foreground">
                  You've already taken the diagnostic{existingResult?.courseName ? ` for ${existingResult.courseName}` : ""}. It's a one-time assessment, so a retake isn't available.
                </p>
              </div>

              {existingResult && (
                <div className="rounded-lg border bg-muted/30 p-4 text-left">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Your score</span>
                    {completedLabel && (
                      <span className="text-xs text-muted-foreground">Completed {completedLabel}</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-foreground">
                      {existingResult.score}<span className="text-xl text-muted-foreground">/{existingResult.total}</span>
                    </span>
                    {pct !== null && (
                      <Badge variant="secondary" className="ml-auto">{pct}%</Badge>
                    )}
                  </div>
                </div>
              )}

              <Button onClick={() => navigate("/student/home")} className="w-full">
                Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </motion.div>
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
                  <p className="text-sm text-muted-foreground">{TOTAL_COUNT} questions</p>
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
        <Progress value={((currentQ + 1) / TOTAL_COUNT) * 100} className="mb-4 h-2" />
        <p className="mb-4 text-xs text-muted-foreground text-center">Question {currentQ + 1} of {TOTAL_COUNT}</p>

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

              {requiresReasoning(question.bloomLevel) && (
                <div className="mt-4">
                  <ReasoningInput
                    questionId={question.id}
                    value={reasoning.rationales[question.id] ?? ""}
                    onChange={reasoning.setRationale}
                    showError={reasoning.showErrors}
                  />
                  <div className="mt-2">
                    <ReasoningVerdict evaluation={reasoning.evaluations[question.id]} />
                  </div>
                </div>
              )}
            </motion.div>
            <div className="mt-4 flex justify-between">
              <Button variant="ghost" onClick={() => { if (currentQ > 0) { const prevQ = currentQ - 1; const prevAnswer = answers[prevQ]; const prevText = textAnswers[prevQ]; setCurrentQ(prevQ); setSelected(prevAnswer === -1 ? null : prevAnswer); setTextAnswer(prevText || ""); setAnswers(answers.slice(0, -1)); setTextAnswers(textAnswers.slice(0, -1)); setQuestionTimes(questionTimes.slice(0, -1)); setQuestionIds(questionIds.slice(0, -1)); setQuestionStartTime(Date.now()); } else { setExitConfirmOpen(true); } }}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={handleAnswer} disabled={!canProceed || loadingBranch}>
                {loadingBranch ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</> : (currentQ < TOTAL_COUNT - 1 ? "Next Question" : "Finish Quiz")} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <AlertDialog open={exitConfirmOpen} onOpenChange={setExitConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave the diagnostic?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress on this attempt will be cleared, and you'll be asked to complete
              the diagnostic again before you can access weekly quizzes, practice, or exam prep.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (user && activeCourseId) {
                  try { localStorage.removeItem(`diagnosticProgress:${user.id}:${activeCourseId}`); } catch {}
                }
                navigate("/student/onboarding");
              }}
            >
              Leave anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DiagnosticQuiz;
