import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTASettings } from "@/hooks/useTASettings";
import { useEnrolledCourseId } from "@/hooks/useEnrolledCourseId";
import { useChatSessions } from "@/hooks/useChatSessions";
import { useDiagnosticStatus } from "@/hooks/useDiagnosticStatus";
import { useLearningPlan } from "@/hooks/useLearningPlan";
import DiagnosticGateDialog from "@/components/student/DiagnosticGateDialog";
import { ChatMessage, RagSource, StudentExamInfo } from "@/types";
import { verdictFor, type ReasoningEvaluation } from "@/lib/reasoning";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Send, Plus, History, BookOpen, MessageSquare, Clock, ChevronLeft, ChevronDown, Terminal, AlertTriangle, ShieldCheck, Loader2, Sparkles, User, BarChart3, Dumbbell, ListChecks, GraduationCap, FolderSearch } from "lucide-react";
import { toast } from "sonner";
import AssessmentView, { AssessmentResults } from "@/components/AssessmentView";
import { saveReasoningRows } from "@/hooks/useReasoningAnswers";
import { buildReasoningRows } from "@/lib/buildReasoningRows";
import ExamHistory from "@/components/ExamHistory";
import ExamPrepPanel, { ExamCustomSettings } from "@/components/ExamPrepPanel";
import type { Question } from "@/data/questionBank";
import { supabase } from "@/integrations/supabase/client";
import { seededShuffle } from "@/lib/seededShuffle";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { renderCitations } from "@/lib/renderCitations";
import "katex/dist/katex.min.css";
import PracticeQuestions, { PracticeQuestion } from "@/components/PracticeQuestions";
import PracticeQuestionsWidget from "@/components/PracticeQuestionsWidget";
import CodingTerminalWidget from "@/components/CodingTerminalWidget";
import MermaidDiagram from "@/components/MermaidDiagram";

const markdownComponents = {
  // Mermaid blocks render their own container — don't leave an empty <pre> shell.
  pre({ children, ...props }: any) {
    const first = Array.isArray(children) ? children[0] : children;
    const cls = first?.props?.className || "";
    if (typeof cls === "string" && cls.includes("language-mermaid")) {
      return <>{children}</>;
    }
    return <pre {...props}>{children}</pre>;
  },
  code({ inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    const lang = match?.[1];
    if (!inline && lang === "mermaid") {
      return <MermaidDiagram code={String(children).replace(/\n$/, "")} />;
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

const getWelcomeLearning = (courseName?: string | null) =>
  `Hi! I'm your AI Teaching Assistant for **${courseName?.trim() || "your course"}**. I'm here to help you understand concepts, work through problems, and build your knowledge. What would you like to explore?`;
const WELCOME_EXAM = "**Exam Prep Mode Active**\n\nWelcome to exam preparation. Configure your practice settings and click **Start Exam** to begin a timed simulation. Good luck!";

type PromptMode = "materials";
type PromptAction = "practice" | "populate";
const STUDENT_SUGGESTED_PROMPTS: { icon: React.ComponentType<{ className?: string }>; label: string; prompt: string; promptTemplate?: string; promptMode?: PromptMode; action?: PromptAction }[] = [
  { icon: BookOpen, label: "Explain a concept", prompt: "Explain a unit's key concept in simple terms.", promptTemplate: `Explain the key concept "{topic}" from this unit in simple terms with an example.`, action: "populate" },
  { icon: ListChecks, label: "Quiz me", prompt: "Open Practice Questions to generate a quiz on your recent topics.", action: "practice" },
  { icon: FolderSearch, label: "Search course materials", prompt: "Find and explain information from materials uploaded by my professor on topic X.", promptTemplate: "Find and explain information from materials uploaded by my professor on topic {topic}.", promptMode: "materials", action: "populate" },
  { icon: GraduationCap, label: "Prep for the exam", prompt: "What topics should I focus on for the upcoming exam, and how should I study them?" },

];




async function invokeUpdateMastery(args: {
  courseId: string;
  source: "weekly_quiz" | "exam" | "practice";
  sourceId: string | null;
  answers: any[];
  questionMeta?: Map<string, { difficulty: number; bloom: number }>;
  evaluations?: Record<string, ReasoningEvaluation>;
}) {
  try {
    // Weighted per-question payload when meta is available — matches WeeklyQuizDialog.
    if (args.questionMeta && args.questionMeta.size > 0) {
      const perQuestion: {
        concept_code: string;
        difficulty: number;
        bloom: number;
        is_correct: boolean;
        reasoning_verdict: ReturnType<typeof verdictFor>;
      }[] = [];
      for (const a of args.answers ?? []) {
        const code = (a?.topic ?? "").toString().trim();
        if (!code) continue;
        const meta = args.questionMeta.get(a.question_id) ?? { difficulty: 0.5, bloom: 1 };
        perQuestion.push({
          concept_code: code,
          difficulty: Math.min(1, Math.max(0, meta.difficulty)),
          bloom: Math.min(6, Math.max(1, Math.round(meta.bloom))),
          is_correct: !!a?.is_correct,
          reasoning_verdict: verdictFor(args.evaluations, a?.question_id),
        });
      }

      if (perQuestion.length === 0) return;
      await supabase.functions.invoke("update-mastery", {
        body: {
          course_id: args.courseId,
          source: args.source,
          source_id: args.sourceId,
          per_question: perQuestion,
        },
      });
      return;
    }

    // Fallback aggregate path (no meta).
    const tally = new Map<string, { attempted: number; correct: number }>();
    for (const a of args.answers ?? []) {
      const code = (a?.topic ?? "").toString().trim();
      if (!code) continue;
      const t = tally.get(code) ?? { attempted: 0, correct: 0 };
      t.attempted += 1;
      if (a?.is_correct) t.correct += 1;
      tally.set(code, t);
    }
    if (tally.size === 0) return;
    await supabase.functions.invoke("update-mastery", {
      body: {
        course_id: args.courseId,
        source: args.source,
        source_id: args.sourceId,
        per_concept: Array.from(tally.entries()).map(([concept_code, t]) => ({
          concept_code,
          attempted: t.attempted,
          correct: t.correct,
        })),
      },
    });
  } catch (e) {
    console.error("update-mastery invoke failed", e);
  }
}

const normalizeExamWelcomeMessage = (content: string) => {
  if (!content.includes("**Exam Prep Mode Active**")) return content;

  return content
    .replace(
      /Choose \*\*Start Exam\*\* or \*\*Start Weekly Quiz\*\* below to begin a timed assessment\./g,
      "Configure your practice settings and click **Start Exam** to begin a timed simulation."
    )
    .replace(/Questions are presented by the system — no AI generation involved\.\s*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const AIChat = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const enrolledCourseId = useEnrolledCourseId();
  const { taSettings } = useTASettings(enrolledCourseId);
  const { taken: diagnosticTaken } = useDiagnosticStatus(enrolledCourseId);
  const initialMode = searchParams.get("mode") === "exam" ? "exam" : "learning";

  const [mode, setMode] = useState<"learning" | "exam">(initialMode);
  const [diagGateOpen, setDiagGateOpen] = useState(false);
  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showPerformanceDashboard, setShowPerformanceDashboard] = useState(false);
  const [showCodeTerminal, setShowCodeTerminal] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeResult, setCodeResult] = useState<string | null>(null);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCooldown, setIsCooldown] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastSendTime = useRef<number>(0);
  const { lessonPlan, currentWeek } = useLearningPlan();
  const currentWeekTopic = lessonPlan.find((w) => w.day === currentWeek)?.topic ?? null;

  // Course context for relevance classification
  const [courseContext, setCourseContext] = useState<{ courseName: string; objectives: string[]; concepts: string[] } | null>(null);

  // Assessment state
  const [assessmentActive, setAssessmentActive] = useState(false);
  const [assessmentType, setAssessmentType] = useState<"quiz" | "exam">("quiz");
  const [assessmentQuestions, setAssessmentQuestions] = useState<Question[]>([]);
  const [assessmentQuestionMeta, setAssessmentQuestionMeta] = useState<Map<string, { difficulty: number; bloom: number }>>(new Map());
  const [assessmentDay, setAssessmentDay] = useState(1);
  const [customExamTimeLimit, setCustomExamTimeLimit] = useState<number | null>(null);
  const [currentAssessmentSessionId, setCurrentAssessmentSessionId] = useState<string | null>(null);

  // Published exams for this course (active + published), with completion status.
  const [availableExams, setAvailableExams] = useState<StudentExamInfo[]>([]);
  // Exam id chosen for the current in-progress attempt (so we can persist it on submit)
  const [currentExamId, setCurrentExamId] = useState<string | null>(null);




  // Practice questions widget state
  const [showPractice, setShowPractice] = useState(false);
  const [practiceHistory, setPracticeHistory] = useState<any[]>([]);
  const [selectedPracticeHistoryId, setSelectedPracticeHistoryId] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);

  const {
    sessions: chats,
    activeSession: activeChat,
    activeSessionId: activeChatId,
    setActiveSessionId: setActiveChatId,
    loading: chatsLoading,
    createSession,
    addMessage,
    addMessageLocally,
    updateLastMessage,
    updateSessionTitle,
    updateMessageMetadata,
  } = useChatSessions(mode, enrolledCourseId);

  // Fetch course context for relevance classification + RAG metadata
  useEffect(() => {
    if (!enrolledCourseId) return;
    const fetchContext = async () => {
      const [courseRes, conceptsRes] = await Promise.all([
        supabase.from("courses").select("name, objectives").eq("id", enrolledCourseId).maybeSingle(),
        supabase.from("concepts").select("concept_code").eq("course_id", enrolledCourseId),
      ]);
      if (courseRes.data) {
        setCourseContext({
          courseName: courseRes.data.name,
          objectives: (courseRes.data.objectives as string[]) || [],
          concepts: (conceptsRes.data || []).map((c: any) => c.concept_code),
        });
      }
    };
    fetchContext();
  }, [enrolledCourseId]);

  // Load practice history
  const loadPracticeHistory = useCallback(async () => {
    if (!user || !enrolledCourseId) return;
    const { data } = await supabase
      .from("assessment_results")
      .select("*")
      .eq("student_id", user.id)
      .eq("mode", "practice")
      .eq("course_id", enrolledCourseId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) {
      setPracticeHistory(data.map(r => {
        const answersArr = Array.isArray(r.answers) ? (r.answers as any[]) : [];
        const topics = [...new Set(answersArr.map((a: any) => a.topic).filter(Boolean))];
        // Try to extract prompt from first answer's metadata or use topic summary
        const promptText = topics.length > 0 ? `Practice: ${topics.join(", ")}` : "Practice session";
        return {
          id: r.id,
          prompt: promptText,
          score: r.score,
          totalQuestions: r.total_questions,
          correctAnswers: r.correct_answers,
          timestamp: new Date(r.created_at).getTime(),
          topics,
          answers: answersArr,
        };
      }));
    }
  }, [user, enrolledCourseId]);

  useEffect(() => {
    loadPracticeHistory();
  }, [loadPracticeHistory]);

  const handlePracticeResult = async (result: { score: number; totalQuestions: number; correctAnswers: number; answers: any[]; timeSpent: number; rationales?: Record<string, string>; evaluations?: Record<string, import("@/lib/reasoning").ReasoningEvaluation> }) => {
    if (!user || !enrolledCourseId) return;
    try {
      const { data: inserted } = await supabase.from("assessment_results").insert({
        student_id: user.id,
        course_id: enrolledCourseId,
        mode: "practice",
        score: result.score,
        total_questions: result.totalQuestions,
        correct_answers: result.correctAnswers,
        answers: result.answers as any,
        time_spent: result.timeSpent,
      }).select("id").single();

      const questionMeta = new Map<string, { difficulty: number; bloom: number }>();
      for (const a of result.answers ?? []) {
        if (!a?.question_id) continue;
        if (typeof a.difficulty_estimate === "number" && typeof a.bloom_level === "number") {
          questionMeta.set(a.question_id, {
            difficulty: a.difficulty_estimate,
            bloom: a.bloom_level,
          });
        }
      }

      void saveReasoningRows(
        buildReasoningRows({
          studentId: user.id,
          courseId: enrolledCourseId,
          sourceFormat: "practice",
          questionSource: "generated",
          sourceResultId: inserted?.id ?? null,
          answers: result.answers ?? [],
          rationales: result.rationales ?? {},
          evaluations: result.evaluations,
          bloomFor: (qid) => Number(questionMeta.get(qid)?.bloom ?? 1),
        }),
      );


      void invokeUpdateMastery({
        courseId: enrolledCourseId,
        source: "practice",
        sourceId: inserted?.id ?? null,
        answers: result.answers,
        questionMeta,
        evaluations: result.evaluations,

      });

      if (activeChat) {
        const weakTopics = [...new Set(result.answers.filter((answer: any) => !answer.is_correct).map((answer: any) => answer.topic).filter(Boolean))];
        const reviewLines = result.answers.flatMap((answer: any, index: number) => {
          const lines = [
            `${index + 1}. **${answer.question_text}**`,
            `   - Your answer: ${answer.selected || "Not answered"}`,
            `   - Correct answer: ${answer.correct}`,
          ];

          if (answer.explanation) {
            lines.push(`   - Why: ${answer.explanation}`);
          }

          return lines;
        });

        const practiceSummary = [
          "✅ **Practice Questions Complete!**",
          "",
          `Score: **${result.score}%** (${result.correctAnswers}/${result.totalQuestions}) · Time: **${Math.floor(result.timeSpent / 60)}m ${result.timeSpent % 60}s**`,
          weakTopics.length > 0 ? `Focus next on: **${weakTopics.join(", ")}**` : "Great work — you answered all of these correctly.",
          "",
          "### Question Review",
          ...reviewLines,
        ].join("\n");

        await addMessage(activeChat.id, "assistant", practiceSummary);

        if (activeChat.messages.every((message) => message.role !== "user") && activeChat.title === "New Study Session") {
          const practiceDate = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
          await updateSessionTitle(activeChat.id, `Practice Questions — ${practiceDate}`);
        }
      }

      // Refresh history
      await loadPracticeHistory();
    } catch (e) {
      console.error("Failed to save practice result:", e);
    }
  };


  // Note: do NOT auto-start an exam on mount based on ?mode=exam.
  // Mid-exam progress must be discarded on refresh/tab close — students
  // must explicitly click "Start Exam" again to begin a fresh attempt.

  // Intercept navigation during assessment
  useEffect(() => {
    if (!assessmentActive) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [assessmentActive]);

  useEffect(() => {
    if (!assessmentActive) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (anchor) {
        const href = anchor.getAttribute("href");
        if (href && href !== location.pathname && !href.startsWith("http")) {
          e.preventDefault();
          e.stopPropagation();
          setPendingNavigation(href);
          setShowLeaveWarning(true);
        }
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [assessmentActive, location.pathname]);

  const handleConfirmLeave = () => {
    setAssessmentActive(false);
    setShowLeaveWarning(false);
    if (pendingNavigation) {
      navigate(pendingNavigation);
      setPendingNavigation(null);
    }
  };

  const handleCancelLeave = () => {
    setShowLeaveWarning(false);
    setPendingNavigation(null);
  };

  // Auto-create first session if none exist
  useEffect(() => {
    if (chatsLoading || chats.length > 0 || !user) return;
    if (mode === "learning" && !courseContext) return; // wait for course name before creating
    const welcome = mode === "learning" ? getWelcomeLearning(courseContext?.courseName) : WELCOME_EXAM;
    const title = mode === "learning" ? "New Study Session" : "New Exam Prep";
    createSession(title, welcome);
  }, [chatsLoading, chats.length, user, mode, courseContext]);

  // Handle ?newchat=true param
  useEffect(() => {
    const shouldNewChat = searchParams.get("newchat") === "true";
    if (!shouldNewChat || !user) return;
    const targetMode = (searchParams.get("mode") === "exam" || searchParams.get("mode") === "quiz") ? "exam" : "learning";
    setMode(targetMode);
    setAssessmentActive(false);
    const welcome = targetMode === "learning" ? getWelcomeLearning(courseContext?.courseName) : WELCOME_EXAM;
    const title = targetMode === "learning" ? "New Study Session" : "New Exam Prep";
    createSession(title, welcome).then(() => {
      if (targetMode !== "learning") return;
      const concept = searchParams.get("concept");
      if (!concept) return;
      const intent = searchParams.get("intent");
      let prefill = "";
      if (intent === "weak") {
        prefill = `I'm struggling with "${concept}". Explain it from the basics with a simple example.`;
      } else if (intent === "start") {
        prefill = `Help me get started with "${concept}" from this unit. Explain it in simple terms with an example.`;
      }
      if (prefill) setInput(prefill);
      navigate("/student/chat", { replace: true });
    });
  }, []);

  useEffect(() => {
    if (mode === "learning") setAssessmentActive(false);
  }, [mode]);

  // Gate exam mode + quiz launches on diagnostic completion.
  useEffect(() => {
    if (diagnosticTaken === false && mode === "exam") {
      setMode("learning");
      setAssessmentActive(false);
      setDiagGateOpen(true);
    }
  }, [diagnosticTaken, mode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages.length, streamingMessage?.content]);

  const createNewChat = async () => {
    setAssessmentActive(false);
    const welcome = mode === "learning" ? getWelcomeLearning(courseContext?.courseName) : WELCOME_EXAM;
    const title = mode === "learning" ? "New Study Session" : "New Exam Prep";
    await createSession(title, welcome);
    setShowHistory(false);
  };

  /** Fetch visible lesson plan topics from DB. RLS already filters out
   *  locked + future weeks for students, so anything we receive is fair game. */
  const fetchVisibleTopics = async (): Promise<string[]> => {
    if (!enrolledCourseId) return [];
    try {
      const { data: rows, error } = await supabase
        .from("lesson_plan_weeks")
        .select("week_name, concepts, resources")
        .eq("course_id", enrolledCourseId)
        .order("week_number");
      if (error || !rows) return [];

      const topics = new Set<string>();
      for (const row of rows as any[]) {
        if (row.week_name) topics.add(row.week_name);
        const concepts = Array.isArray(row.concepts) ? row.concepts : [];
        for (const c of concepts) {
          if (c?.name) topics.add(String(c.name));
        }
        const resources = Array.isArray(row.resources) ? row.resources : [];
        for (const r of resources) {
          if (r?.concept) topics.add(String(r.concept));
        }
      }
      return Array.from(topics);
    } catch {
      return [];
    }
  };

  /** Filter questions to only visible lesson plan topics */
  const filterByVisibleTopics = (questions: Question[], visibleTopics: string[]): Question[] => {
    if (visibleTopics.length === 0) return questions; // No topic data → don't filter
    const topicSet = new Set(visibleTopics.map(t => t.toLowerCase()));
    const filtered = questions.filter(q => topicSet.has((q.topic || "").toLowerCase()));
    return filtered.length > 0 ? filtered : questions; // Fallback to all if no matches
  };

  /** Load published, active exams for this course, enriched with the professor's
   *  configured question count, time limit, and whether the student has already
   *  completed each exam. */
  const loadAvailableExams = useCallback(async () => {
    if (!enrolledCourseId) {
      setAvailableExams([]);
      return [] as StudentExamInfo[];
    }
    const [{ data: examRows }, { data: attemptRows }, { data: qRows }] = await Promise.all([
      supabase
        .from("course_exams")
        .select("id, label, length_min, breakdown, position, created_at")
        .eq("course_id", enrolledCourseId)
        .is("archived_at", null)
        .not("published_at", "is", null)
        .order("position", { ascending: true }),
      user
        ? supabase
            .from("assessment_results")
            .select("exam_id, score, created_at")
            .eq("course_id", enrolledCourseId)
            .eq("student_id", user.id)
            .eq("mode", "exam")
            .not("exam_id", "is", null)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as { exam_id: string | null; score: number | null; created_at: string | null }[] }),
      supabase
        .from("assessment_questions")
        .select("exam_id")
        .eq("course_id", enrolledCourseId)
        .eq("mode", "exam")
        .not("exam_id", "is", null),
    ]);

    const questionsByExam = new Map<string, number>();
    for (const row of (qRows ?? []) as { exam_id: string | null }[]) {
      if (!row.exam_id) continue;
      questionsByExam.set(row.exam_id, (questionsByExam.get(row.exam_id) || 0) + 1);
    }

    const latestAttemptByExam = new Map<string, { score: number | null; created_at: string | null }>();
    for (const row of (attemptRows ?? []) as { exam_id: string | null; score: number | null; created_at: string | null }[]) {
      if (!row.exam_id || latestAttemptByExam.has(row.exam_id)) continue;
      latestAttemptByExam.set(row.exam_id, { score: row.score, created_at: row.created_at });
    }

    const exams: StudentExamInfo[] = ((examRows ?? []) as any[]).map((row) => {
      const breakdown = row.breakdown && typeof row.breakdown === "object" ? (row.breakdown as Record<string, number>) : {};
      const questionCount = Object.values(breakdown).reduce((sum, n) => sum + (typeof n === "number" ? n : 0), 0);
      const hasQuestions = (questionsByExam.get(row.id) || 0) > 0;
      const attempt = latestAttemptByExam.get(row.id);
      return {
        id: row.id,
        label: row.label || "",
        lengthMin: row.length_min ?? 60,
        questionCount,
        position: row.position ?? 0,
        isCompleted: !!attempt,
        bestScore: attempt?.score ?? null,
        hasQuestions,
      };
    });

    setAvailableExams(exams);
    return exams;
  }, [enrolledCourseId, user]);



  // Load whenever course resolves or mode flips to exam
  useEffect(() => {
    if (mode === "exam") loadAvailableExams();
  }, [mode, loadAvailableExams]);

  const fetchDBQuestions = async (
    mode: string,
    quizDay?: number,
    examId?: string,
  ): Promise<{ questions: Question[]; meta: Map<string, { difficulty: number; bloom: number }> }> => {
    if (!enrolledCourseId) return { questions: [], meta: new Map() };
    let query = supabase
      .from("assessment_questions")
      .select("*")
      .eq("course_id", enrolledCourseId)
      .eq("mode", mode);
    if (quizDay) query = query.eq("quiz_day", quizDay);
    if (examId) query = query.eq("exam_id", examId);
    const { data, error } = await query;
    if (error || !data || data.length === 0) return { questions: [], meta: new Map() };
    const meta = new Map<string, { difficulty: number; bloom: number }>();
    const questions = data.map((row: any) => {
      meta.set(row.id, {
        difficulty: Number(row.difficulty_estimate ?? 0.5),
        bloom: Number(row.bloom_level ?? 1),
      });
      return {
        id: row.id,
        text: row.question_text,
        type: (row.question_type === "MCQ" ? "mcq" : row.question_type === "Problem Solving" ? "problem_solving" : row.question_type === "True/False" || row.question_type === "TF" ? "true_false" : "short_answer") as Question["type"],
        options: row.options as string[] | undefined,
        correctAnswer: row.answer,
        topic: row.topic,
        difficulty: row.difficulty as "Easy" | "Medium" | "Hard",
        day: row.quiz_day || 0,
      };
    });
    return { questions, meta };
  };

  const handleStartExamWithSettings = async (custom: ExamCustomSettings, examId: string) => {
    const visibleTopics = await fetchVisibleTopics();
    const count = custom.questionCount;
    const exam = availableExams.find((e) => e.id === examId);
    if (!exam) {
      toast.info("This practice exam is no longer available.");
      return;
    }
    const fetched = await fetchDBQuestions("exam", undefined, examId);
    let questions = fetched.questions;
    const meta = fetched.meta;
    if (questions.length === 0) {
      toast.info("Your professor hasn't published questions for this practice exam yet.");
      return;
    }


    // Only create a session once we know we have questions to serve.
    const examDate = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const examNumber = chats.filter(c => c.title.startsWith("Exam Practice")).length + 1;
    const sessionTitle = `Exam Practice ${examNumber} — ${examDate}`;
    const sessionId = await createSession(sessionTitle, WELCOME_EXAM, "exam");
    setCurrentAssessmentSessionId(sessionId || activeChatId);

    const allowedTypes = custom.questionMix.includes(",")
      ? custom.questionMix.split(",")
      : {
          mixed: ["mcq", "short_answer", "problem_solving", "true_false"],
          mcq_only: ["mcq"],
          true_false_only: ["true_false"],
          short_answer: ["short_answer"],
          problem_solving: ["problem_solving"],
          mcq_short: ["mcq", "short_answer"],
          mcq_problem: ["mcq", "problem_solving"],
        }[custom.questionMix] || ["mcq", "short_answer", "problem_solving", "true_false"];
    const filtered = questions.filter(q => allowedTypes.includes(q.type));
    const pool = filtered.length > 0 ? filtered : questions;
    const seed = (user?.id || "anon") + (enrolledCourseId || "") + (examId || "");
    const shuffled = seededShuffle(pool, seed);
    // Professor-authored exams: serve all questions; ignore custom.questionCount cap.
    const cap = examId ? shuffled.length : Math.min(count, shuffled.length);
    questions = shuffled.slice(0, cap);

    setCustomExamTimeLimit(custom.timeLimit);
    setAssessmentQuestions(questions);
    setAssessmentQuestionMeta(meta);
    setAssessmentType("exam");
    setAssessmentDay(3);
    setCurrentExamId(examId ?? null);
    setAssessmentActive(true);
  };


  const handleStartQuiz = async (day?: number) => {
    const count = taSettings.quizNumQuestions || 5;
    const quizDay = day || parseInt(searchParams.get("day") || "1") || 1;
    const fetched = await fetchDBQuestions("daily_quiz", quizDay);
    let questions = fetched.questions;
    const meta = fetched.meta;
    if (questions.length === 0) {
      toast.info("No quiz is available for this week yet.");
      return;
    }
    const seed = (user?.id || "anon") + (enrolledCourseId || "");
    const shuffled = seededShuffle(questions, seed);
    questions = shuffled.slice(0, Math.min(count, shuffled.length));
    setAssessmentQuestions(questions);
    setAssessmentQuestionMeta(meta);
    setAssessmentType("quiz");
    setAssessmentDay(quizDay);
    setAssessmentActive(true);
  };


  const handleAssessmentEnd = () => {
    setAssessmentActive(false);
    setCurrentAssessmentSessionId(null);
    navigate("/student/home");
  };

  const handleStudyWeakTopics = async (topics: string[]) => {
    setAssessmentActive(false);
    setMode("learning");
    const topicsList = topics.join(", ");
    const welcome = `I noticed you need more practice with **${topicsList}**. Let's work through these concepts together! Which topic would you like to start with?`;
    const title = `Study: ${topicsList.slice(0, 40)}`;
    await createSession(title, welcome, "learning");
    // Pre-send a study prompt
    setInput(`Help me understand these topics better: ${topicsList}. Start with the one I'm weakest on and explain it with examples.`);
  };

  const handleAssessmentSubmit = async (results: AssessmentResults) => {
    const targetSessionId = currentAssessmentSessionId || activeChat?.id;

    // Log results to chat session for record
    if (targetSessionId) {
      const weakTopics = [...new Set(results.answers.filter((answer) => !answer.is_correct).map((answer) => answer.topic).filter(Boolean))];
      const reviewLines = results.answers.flatMap((answer, index) => [
        `${index + 1}. **${answer.question_text}**`,
        `   - Your answer: ${answer.selected || "Not answered"}`,
        `   - Correct answer: ${answer.correct}`,
      ]);

      const summary = [
        assessmentType === "quiz" ? "✅ **Weekly Quiz Complete!**" : "✅ **Exam Practice Complete!**",
        "",
        `Score: **${results.score}%** (${results.correctAnswers}/${results.totalQuestions}) · Time: **${Math.floor(results.timeSpent / 60)}m ${results.timeSpent % 60}s**`,
        weakTopics.length > 0 ? `Topics to strengthen in Study mode: **${weakTopics.join(", ")}**` : "Strong work across this attempt.",
        "",
        "### Question Review",
        ...reviewLines,
      ].join("\n");

      await addMessage(targetSessionId, "assistant", summary);
    }

    // Persist structured results to database
    if (user) {
      const { data: insertedAssessment, error } = await supabase.from("assessment_results").insert({
        student_id: user.id,
        course_id: enrolledCourseId || undefined,
        mode: assessmentType === "quiz" ? "daily_quiz" : "exam",
        quiz_day: assessmentType === "quiz" ? assessmentDay : null,
        score: results.score,
        total_questions: results.totalQuestions,
        correct_answers: results.correctAnswers,
        answers: (results.answers ?? []) as unknown as import("@/integrations/supabase/types").Json,
        time_spent: results.timeSpent ?? 0,
        exam_id: assessmentType === "exam" ? (currentExamId ?? null) : null,
      }).select("id").single();
      if (error) {
        console.error("Failed to save assessment results:", error);
      } else {
        void saveReasoningRows(
          buildReasoningRows({
            studentId: user.id,
            courseId: enrolledCourseId || null,
            sourceFormat: assessmentType === "quiz" ? "weekly_quiz" : "exam",
            questionSource: "assessment_questions",
            sourceResultId: insertedAssessment?.id ?? null,
            answers: results.answers ?? [],
            rationales: results.rationales ?? {},
            evaluations: results.evaluations,
            bloomFor: (qid) => Number(assessmentQuestionMeta.get(qid)?.bloom ?? 1),
          }),
        );
        if (enrolledCourseId) {
          void invokeUpdateMastery({
            courseId: enrolledCourseId,
            source: assessmentType === "quiz" ? "weekly_quiz" : "exam",
            sourceId: insertedAssessment?.id ?? null,
            answers: results.answers ?? [],
            questionMeta: assessmentQuestionMeta,
            evaluations: results.evaluations,

          });
        }
      }
    }

    setCurrentAssessmentSessionId(null);
    setCurrentExamId(null);
    // Refresh available exams so the completed attempt is reflected in the list.
    if (assessmentType === "exam") {
      void loadAvailableExams();
    }

  };

  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3): Promise<Response> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const resp = await fetch(url, options);
      if (resp.status === 429 && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        toast.info("Rate limited, retrying…", { duration: delay });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return resp;
    }
    // Should not reach here, but just in case
    return fetch(url, options);
  };

  const sendMessage = useCallback(async (
    overrideContent?: string,
    promptMode?: PromptMode,
    opts?: { grounding?: "rag" | "general"; skipSaveUser?: boolean },
  ) => {
    const contentToSend = (overrideContent ?? input).trim();
    if (!contentToSend || !activeChat || isStreaming || isCooldown) return;
    if (assessmentActive) return;

    const grounding: "rag" | "general" = opts?.grounding ?? "rag";
    const skipSaveUser = !!opts?.skipSaveUser;

    // Rate limiting: enforce 3-second minimum gap
    const now = Date.now();
    if (now - lastSendTime.current < 3000) {
      toast.warning("Please wait a moment before sending another message");
      return;
    }
    lastSendTime.current = now;

    const userContent = contentToSend;
    if (!skipSaveUser) setInput("");
    setIsStreaming(true);
    setIsCooldown(true);
    setTimeout(() => setIsCooldown(false), 3000);

    if (!skipSaveUser) {
      await addMessage(activeChat.id, "user", userContent);
    }

    const userMsgCount = activeChat.messages.filter((m) => m.role === "user").length;
    if (userMsgCount === 0 && !skipSaveUser) {
      const shortTitle = userContent.slice(0, 50) + (userContent.length > 50 ? "..." : "");
      updateSessionTitle(activeChat.id, shortTitle);
    }

    const historyMessages = [...activeChat.messages, { id: "temp", role: "user" as const, content: userContent, timestamp: Date.now() }]
      .slice(-20)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Classify relevance for study mode
    let relevanceContext: { relevant: boolean; courseName: string; concepts: string[] } | undefined;
    let isConversational = false;
    if (mode === "learning" && courseContext) {
      try {
        const classifyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/classify-question`;
        const classifyResp = await fetchWithRetry(classifyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            message: userContent,
            courseName: courseContext.courseName,
            objectives: courseContext.objectives,
            concepts: courseContext.concepts,
          }),
        }, 2); // Only 2 retries for classification — skip on failure
        if (classifyResp.ok) {
          const classifyData = await classifyResp.json();
          isConversational = classifyData.intent === "conversational";
          if (!isConversational && classifyData.relevant === false) {
            relevanceContext = {
              relevant: false,
              courseName: courseContext.courseName,
              concepts: courseContext.concepts,
            };
          }
        }
      } catch (e) {
        console.error("Classification failed, proceeding normally:", e);
      }
    }

    const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
    const assistantMsgId = `streaming-${Date.now()}`;

    try {
      const resp = await fetchWithRetry(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: historyMessages,
          mode,
          promptMode,
          studySystemPrompt: taSettings.studySystemPrompt,
          examSystemPrompt: taSettings.examSystemPrompt,
          ...(relevanceContext ? { relevanceContext } : {}),
          courseId: enrolledCourseId || undefined,
          studentId: user?.id || undefined,
          grounding,
          ...(isConversational ? { conversational: true } : {}),
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ error: "AI service error" }));
        toast.error(errorData.error || "Failed to get AI response");
        setIsStreaming(false);
        return;
      }

      // Non-stream JSON fallback: RAG returned insufficient context
      const contentType = resp.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await resp.json().catch(() => ({} as any));
        if (data?.needs_fallback) {
          await addMessage(
            activeChat.id,
            "assistant",
            "I couldn't find enough in the uploaded course materials to answer this. Would you like me to answer from general knowledge instead?",
            { variant: "fallback_prompt", pendingQuery: userContent },
          );
          setIsStreaming(false);
          return;
        }
      }

      if (!resp.body) {
        toast.error("No response from AI");
        setIsStreaming(false);
        return;
      }

      // Structured RAG citations (base64-encoded JSON) — safe to ignore if absent.
      let ragSources: RagSource[] | undefined;
      const rawSources = resp.headers.get("x-rag-sources");
      if (rawSources) {
        try {
          ragSources = JSON.parse(decodeURIComponent(escape(atob(rawSources)))) as RagSource[];
        } catch (e) {
          console.warn("Failed to parse x-rag-sources header:", e);
        }
      }
      // "weak" = answered from the closest materials found, but the match was
      // uncertain; we badge it and still offer the general-knowledge opt-in.
      const isLowConfidence = resp.headers.get("x-rag-confidence") === "weak";


      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantContent = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setStreamingMessage({ id: assistantMsgId, role: "assistant", content: assistantContent, timestamp: Date.now() });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setStreamingMessage({ id: assistantMsgId, role: "assistant", content: assistantContent, timestamp: Date.now() });
            }
          } catch { /* ignore */ }
        }
      }

      if (assistantContent) {
        // Model-signalled fallback via [[NEEDS_FALLBACK]] sentinel
        if (assistantContent.trim() === "[[NEEDS_FALLBACK]]" || assistantContent.includes("[[NEEDS_FALLBACK]]")) {
          await addMessage(
            activeChat.id,
            "assistant",
            "I couldn't find enough in the uploaded course materials to answer this. Would you like me to answer from general knowledge instead?",
            { variant: "fallback_prompt", pendingQuery: userContent },
          );
        } else {
          const isGeneral = grounding === "general" || assistantContent.includes("[[GENERAL_KNOWLEDGE]]");
          const cleaned = assistantContent
            .replace(/\[\[GENERAL_KNOWLEDGE\]\]/g, "")
            .replace(/\[\[NEEDS_FALLBACK\]\]/g, "")
            .trim();
          await addMessage(
            activeChat.id,
            "assistant",
            cleaned,
            {
              variant: isGeneral
                ? "general_knowledge"
                : isLowConfidence
                  ? "grounded_low_confidence"
                  : "grounded",
              ...(isLowConfidence && !isGeneral ? { pendingQuery: userContent } : {}),
              ...(ragSources && ragSources.length ? { sources: ragSources } : {}),
            },
          );
        }
      }
    } catch (e) {
      console.error("Chat error:", e);
      toast.error("Failed to connect to AI. Please try again.");
    } finally {
      setIsStreaming(false);
      setStreamingMessage(null);
    }
  }, [input, activeChat, isStreaming, isCooldown, mode, assessmentActive, addMessage, updateSessionTitle, courseContext, taSettings, enrolledCourseId, user?.id]);

  const handleCodeSubmit = () => {
    if (!codeInput.trim()) return;
    setCodeResult(
      codeInput.includes("def ") || codeInput.includes("print")
        ? "Correct! Your code runs successfully. Output: Hello, World!"
        : "Not quite. Check your syntax — remember Python uses `def` to define functions. Try again!"
    );
  };

  const handleModeSwitch = async (newMode: string) => {
    if (assessmentActive && newMode !== mode) {
      setPendingNavigation(null);
      setShowLeaveWarning(true);
      return;
    }
    const targetMode = newMode as "learning" | "exam";
    if (targetMode === "exam" && diagnosticTaken === false) {
      setDiagGateOpen(true);
      return;
    }
    setMode(targetMode);
    setShowHistory(false);
    setAssessmentActive(false);
    // Only auto-create a new chat for study mode; exam mode doesn't need empty chats
    if (targetMode === "learning") {
      const welcome = getWelcomeLearning(courseContext?.courseName);
      await createSession("New Study Session", welcome, targetMode);
    }
  };

  const hasMeaningfulHistory = (chat: typeof chats[number]) => chat.messages.length > 1 || chat.messages.some((message) => message.role === "user");

  const formatTimestamp = (ts?: number) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const userInitial = user?.user_metadata?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U";

  const parsePracticeQuestions = (content: string): { parts: { type: "text" | "practice"; content: string; questions?: PracticeQuestion[] }[] } => {
    const regex = /```practice-questions\s*\n([\s\S]*?)```/g;
    const parts: { type: "text" | "practice"; content: string; questions?: PracticeQuestion[] }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: content.slice(lastIndex, match.index) });
      }
      try {
        const questions = JSON.parse(match[1]) as PracticeQuestion[];
        parts.push({ type: "practice", content: "", questions });
      } catch {
        parts.push({ type: "text", content: match[0] });
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push({ type: "text", content: content.slice(lastIndex) });
    }
    return { parts };
  };

  const renderMessage = (msg: ChatMessage) => {
    const isUser = msg.role === "user";
    const displayContent = !isUser ? normalizeExamWelcomeMessage(msg.content) : msg.content;
    const hasPracticeQuestions = !isUser && displayContent.includes("```practice-questions");
    const parsed = hasPracticeQuestions ? parsePracticeQuestions(displayContent) : null;
    const citation = !isUser ? renderCitations(displayContent, msg.metadata?.sources) : null;
    const displayContentForRender = citation ? citation.content : displayContent;
    const showFootnotes = !isUser && citation && citation.footnotes.length > 0 && msg.metadata?.variant !== "general_knowledge";
    const renderText = (raw: string) => {
      const { content } = !isUser ? renderCitations(raw, msg.metadata?.sources) : { content: raw };
      return content;
    };

    const isFirstAssistantWelcome = !isUser && activeChat?.messages[0]?.id === msg.id && mode === "learning";

    const bubbleContent = (
      <>
        {parsed ? (
          <div className="space-y-3">
            {parsed.parts.map((part, pi) =>
              part.type === "practice" && part.questions ? (
                <PracticeQuestions key={pi} questions={part.questions} />
              ) : part.content.trim() ? (
                <div key={pi} className={`prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${
                  isUser ? "[&_*]:text-primary-foreground" : "dark:prose-invert"
                }`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex, rehypeRaw]} components={markdownComponents}>{renderText(part.content.trim())}</ReactMarkdown>
                </div>
              ) : null
            )}
          </div>
        ) : (
          <div className={`prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${
            isUser ? "[&_*]:text-primary-foreground" : "dark:prose-invert"
          }`}>
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex, rehypeRaw]} components={markdownComponents}>{displayContentForRender}</ReactMarkdown>
          </div>
        )}
        {showFootnotes && (
          <div className="mt-3 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
            <div className="mb-1 font-medium uppercase tracking-wide">Sources</div>
            <ol className="list-decimal space-y-0.5 pl-4">
              {citation!.footnotes.map((f) => (
                <li key={f.n}>{f.label}</li>
              ))}
            </ol>
          </div>
        )}
        {!isUser && msg.metadata?.variant === "general_knowledge" && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
              <Sparkles className="h-3 w-3" /> AI general knowledge — not from course materials
            </span>
          </div>
        )}
        {!isUser && msg.metadata?.variant === "grounded_low_confidence" && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
              <Sparkles className="h-3 w-3" /> Closest match in course materials — may be incomplete
            </span>
          </div>
        )}
        {!isUser &&
          (msg.metadata?.variant === "fallback_prompt" ||
            msg.metadata?.variant === "grounded_low_confidence") &&
          !!msg.metadata?.pendingQuery &&
          !msg.metadata?.fallbackResolved && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={async () => {
                const q = msg.metadata?.pendingQuery ?? "";
                if (!q || !activeChat) return;
                await updateMessageMetadata(activeChat.id, msg.id, { ...msg.metadata!, fallbackResolved: true });
                sendMessage(q, undefined, { grounding: "general", skipSaveUser: true });
              }}
              disabled={isStreaming || isCooldown}
            >
              Yes, use general knowledge
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!activeChat) return;
                await updateMessageMetadata(activeChat.id, msg.id, { ...msg.metadata!, fallbackResolved: true });
              }}
              disabled={isStreaming || isCooldown}
            >
              No, stay in course materials
            </Button>
          </div>
        )}
        {msg.timestamp && (
          <div className={`text-[10px] mt-1.5 ${isUser ? "text-primary-foreground/60 text-right" : "text-muted-foreground text-right"}`}>
            {formatTimestamp(msg.timestamp)}
          </div>
        )}
      </>
    );

    return (
      <div key={msg.id} className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-primary/10 text-primary"
        }`}>
          {isUser ? userInitial : <Sparkles className="w-4 h-4" />}
        </div>
          {isFirstAssistantWelcome ? (
            <div className="flex items-start justify-between gap-2 flex-1 min-w-0">
              <div className="max-w-[85%] md:max-w-[80%] min-w-0 rounded-xl px-4 py-3 text-sm break-words [overflow-wrap:anywhere] [&_pre]:overflow-x-auto [&_pre]:max-w-full bg-card border border-border/50 border-l-4 border-l-primary/40 shadow-sm">
                {bubbleContent}
              </div>
              <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1"
              onClick={createNewChat}
              disabled={isStreaming || isCooldown}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Chat</span>
            </Button>
          </div>
        ) : (
          <div className={`max-w-[85%] min-w-0 rounded-xl px-4 py-3 text-sm break-words [overflow-wrap:anywhere] [&_pre]:overflow-x-auto [&_pre]:max-w-full ${
            isUser
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-card border border-border/50 border-l-4 border-l-primary/40 shadow-sm"
          }`}>
            {bubbleContent}
          </div>
        )}
      </div>
    );
  };

  // If practice widget is active, show it full-screen
  if (showPractice) {
    return (
      <div className="flex h-[calc(100vh-57px)] md:h-screen flex-col">
        <PracticeQuestionsWidget
          onClose={() => {
            setShowPractice(false);
            setSelectedPracticeHistoryId(null);
          }}
          onSaveResult={handlePracticeResult}
          practiceHistory={practiceHistory}
          courseContext={courseContext}
          enrolledCourseId={enrolledCourseId}
          studentId={user?.id || null}
          initialReviewSessionId={selectedPracticeHistoryId}
        />
      </div>
    );
  }

  if (showTerminal) {
    return <CodingTerminalWidget onClose={() => setShowTerminal(false)} />;
  }

  // If assessment is active, show full-screen assessment view
  if (assessmentActive && assessmentQuestions.length > 0) {
    const timeLimit = assessmentType === "exam"
      ? (customExamTimeLimit || taSettings.examTimeLimit || 60)
      : (taSettings.quizTimeLimit || 10);

    return (
      <div className="flex h-[calc(100vh-57px)] md:h-screen flex-col w-full min-w-0 overflow-x-hidden">
        <AssessmentView
          type={assessmentType}
          questions={assessmentQuestions}
          timeLimitMinutes={timeLimit}
          day={assessmentDay}
          onEnd={handleAssessmentEnd}
          onSubmit={handleAssessmentSubmit}
          onStudyTopics={handleStudyWeakTopics}
          questionMeta={assessmentQuestionMeta}
          courseId={enrolledCourseId ?? null}
        />

        <Dialog open={showLeaveWarning} onOpenChange={setShowLeaveWarning}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                End {assessmentType === "exam" ? "Exam" : "Weekly Quiz"}?
              </DialogTitle>
              <DialogDescription>
                If you leave, your progress will be discarded and not submitted.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={handleCancelLeave}>Stay & Continue</Button>
              <Button variant="destructive" onClick={handleConfirmLeave}>Leave & End</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="relative flex h-[calc(100vh-57px)] md:h-screen w-full min-w-0 overflow-x-hidden">
      {/* Chat History Sidebar */}
      {showHistory && (
        <>
          {/* Mobile backdrop */}
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-30"
            onClick={() => setShowHistory(false)}
          />
          <div className="absolute md:relative z-40 md:z-auto inset-y-0 left-0 w-72 max-w-[85vw] border-r bg-sidebar p-4 space-y-3 overflow-auto shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">
              {mode === "learning" ? "Study" : "Exam Prep"} History
            </h3>
            <button onClick={() => setShowHistory(false)}><ChevronLeft className="h-4 w-4" /></button>
          </div>
          {mode === "learning" && (
            <Button variant="outline" size="sm" className="w-full" onClick={createNewChat}>
              <Plus className="mr-1 h-4 w-4" /> New Chat
            </Button>
          )}

          {/* Practice Questions History — study mode only */}
          {mode === "learning" && practiceHistory.length > 0 && (
            <div className="space-y-1 mt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Practice Questions</p>
              {practiceHistory.slice(0, 10).map(h => (
                <button
                  key={h.id}
                  onClick={() => {
                    setSelectedPracticeHistoryId(h.id);
                    setShowPractice(true);
                    setShowHistory(false);
                  }}
                  className="w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-sidebar-accent/50"
                >
                  <div className="flex items-center gap-2">
                    <Dumbbell className="h-3.5 w-3.5 text-primary shrink-0" />
                    <p className="truncate text-xs font-medium">{h.prompt}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 ml-5.5">
                    <span className={`font-semibold ${h.score >= 60 ? "text-primary" : "text-destructive"}`}>{h.score}%</span>
                    <span>{h.correctAnswers}/{h.totalQuestions}</span>
                    <span>{new Date(h.timestamp).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Chat Sessions */}
          <div className="space-y-1 mt-3">
            {(() => {
              const displayChats = chats.filter(hasMeaningfulHistory);
              
              if (mode === "learning" && (practiceHistory.length > 0 || displayChats.length > 0)) {
                return (
                  <>
                    {displayChats.length > 0 && (
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Chat Sessions</p>
                    )}
                    {displayChats.length === 0 ? (
                      practiceHistory.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No study history yet</p>
                      )
                    ) : (
                      displayChats.map((chat) => (
                        <button
                          key={chat.id}
                          onClick={() => { setActiveChatId(chat.id); setShowHistory(false); setAssessmentActive(false); }}
                          className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                            chat.id === activeChatId ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/50"
                          }`}
                        >
                          <p className="truncate">{chat.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span>{new Date(chat.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </>
                );
              }

              if (mode === "exam") {
                const examChats = displayChats;
                return examChats.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No exam prep history yet</p>
                ) : (
                  examChats.map((chat) => {
                    const scoreMsg = chat.messages.find(m => m.role === "assistant" && m.content.includes("Score:"));
                    const scoreMatch = scoreMsg?.content.match(/Score:\s*(\d+)%/);
                    const score = scoreMatch ? parseInt(scoreMatch[1]) : null;

                    return (
                      <button
                        key={chat.id}
                        onClick={() => { setActiveChatId(chat.id); setShowHistory(false); setAssessmentActive(false); }}
                        className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                          chat.id === activeChatId ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/50"
                        }`}
                      >
                        <p className="truncate">{chat.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {score !== null && (
                            <span className={`font-semibold ${score >= 60 ? "text-primary" : "text-destructive"}`}>{score}%</span>
                          )}
                          <span>{new Date(chat.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </button>
                    );
                  })
                );
              }

              return <p className="text-sm text-muted-foreground text-center py-4">No history yet</p>;
            })()}
          </div>
        </div>
        </>
      )}

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 sm:px-5 py-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button onClick={() => setShowHistory(!showHistory)} className="rounded-lg p-2 hover:bg-muted transition-colors shrink-0" title="Chat History">
              <History className="h-5 w-5" />
            </button>
            <Tabs value={mode} onValueChange={handleModeSwitch}>
              <TabsList className="h-10">
                <TabsTrigger value="learning" className="text-sm px-3 sm:px-5 h-8 gap-2">
                  <BookOpen className="h-4 w-4" /> <span className="hidden sm:inline">Study</span>
                </TabsTrigger>
                <TabsTrigger value="exam" className="text-sm px-3 sm:px-5 h-8 gap-2">
                  <Clock className="h-4 w-4" /> <span className="hidden sm:inline">Exam Prep</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {mode === "learning" && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="h-9 text-sm gap-2" onClick={() => setShowTerminal(true)}>
                <Terminal className="h-4 w-4" /> <span className="hidden sm:inline">Code</span>
              </Button>
            </div>
          )}
        </div>

        {/* Exam practice settings + start + history */}
        {mode === "exam" && !assessmentActive && activeChat && (
          <div className="border-b">
            <ExamPrepPanel
              taSettings={taSettings}
              exams={availableExams}
              onStart={(customSettings, examId) => {
                handleStartExamWithSettings(customSettings, examId);
              }}
              onShowDashboard={() => setShowPerformanceDashboard(true)}
            />

          </div>
        )}

        {/* Performance Dashboard Dialog */}
        <Dialog open={showPerformanceDashboard} onOpenChange={setShowPerformanceDashboard}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Practice Exam Performance Dashboard
              </DialogTitle>
              <DialogDescription>
                Review your exam history, scores, and topics to focus on
              </DialogDescription>
            </DialogHeader>
            <ExamHistory courseId={enrolledCourseId} />
          </DialogContent>
        </Dialog>


        {/* Messages - hidden in exam mode when no assessment is active */}
        {(mode === "learning" || assessmentActive) && (
          <div className="flex-1 overflow-auto p-4 space-y-4 min-w-0">
            {chatsLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : activeChat ? (
              <>
                {activeChat.messages.map(renderMessage)}
                {streamingMessage && renderMessage(streamingMessage)}
                {isStreaming && !streamingMessage && (
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="bg-card border border-border/50 border-l-4 border-l-primary/40 shadow-sm rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                      <span className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                        <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                        <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                      </span>
                      <span className="text-muted-foreground ml-1">Thinking...</span>
                    </div>
                  </div>
                )}
                {mode === "learning" && !assessmentActive && !isStreaming && activeChat.messages.length <= 1 && (
                  <div className="pt-2 max-w-[85%] md:max-w-[80%]">
                    <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Try one of these to get started</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {STUDENT_SUGGESTED_PROMPTS.map((s) => {
                        const Icon = s.icon;
                        return (
                          <Button
                            key={s.label}
                            variant="outline"
                            className="h-auto justify-start gap-3 rounded-2xl border-border/60 bg-card px-3 py-3 text-left hover:bg-accent"
                            onClick={() => {
                              if (s.action === "practice") {
                                setShowPractice(true);
                              } else if (s.action === "populate") {
                                const topic = currentWeekTopic ?? "X";
                                setInput((s.promptTemplate ?? s.prompt).replace("{topic}", topic));
                                setTimeout(() => inputRef.current?.focus(), 0);
                              } else {
                                sendMessage(s.prompt, s.promptMode);
                              }
                            }}
                            disabled={s.action === "practice" || s.action === "populate" ? false : (isStreaming || isCooldown)}
                          >
                            <Icon className="h-4 w-4 shrink-0 text-primary" />
                            <span className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-sm font-medium leading-tight">{s.label}</span>
                              <span className="text-xs text-muted-foreground leading-snug whitespace-normal line-clamp-2">{s.prompt}</span>
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/30" />
                  <p className="mt-3 text-sm text-muted-foreground">No active chat. Start a new conversation!</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={createNewChat}>
                    <Plus className="mr-1 h-4 w-4" /> New Chat
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Spacer to push footer down in exam mode */}
        {mode === "exam" && !assessmentActive && <div className="flex-1" />}

        {/* Code Terminal - only in study mode */}
        {mode === "learning" && showCodeTerminal && (
          <div className="border-t bg-muted/30 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Interactive Code Terminal</span>
              <button onClick={() => setShowCodeTerminal(false)} className="ml-auto text-sm text-muted-foreground hover:text-foreground">Close</button>
            </div>
            <textarea
              className="w-full rounded-md border bg-background p-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              rows={4}
              placeholder="Write your Python code here..."
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" onClick={handleCodeSubmit}>Run & Check</Button>
              {codeResult && <p className={`text-sm ${codeResult.startsWith("Correct") ? "text-success" : "text-accent"}`}>{codeResult}</p>}
            </div>
          </div>
        )}

        {/* Input - hidden entirely in exam mode */}
        {mode === "learning" && (
          <div className="border-t px-4 md:px-6 pt-4 pb-8 md:pb-10">
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                placeholder="Ask your Teaching Assistant anything..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                className="flex-1 min-h-[72px] max-h-[200px] resize-none"
              />
              <Button onClick={() => sendMessage()} size="icon" disabled={!input.trim() || isStreaming || isCooldown}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-center gap-1.5">
              <ShieldCheck className="h-3 w-3 text-primary" />
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Private & anonymized</span> — your professor never sees your individual chats, answers, or performance.
              </p>
            </div>
          </div>
        )}

        {/* Privacy footer in exam mode (no input) */}
        {mode === "exam" && !assessmentActive && (
          <div className="border-t px-4 py-3 flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-primary" />
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Private & anonymized</span> — your professor never sees your individual chats, answers, or performance.
            </p>
          </div>
        )}

      </div>

      {/* Leave Warning Dialog */}
      <Dialog open={showLeaveWarning} onOpenChange={setShowLeaveWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Leave Assessment?
            </DialogTitle>
            <DialogDescription>
              If you leave, your progress will be discarded and not submitted. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handleCancelLeave}>Stay & Continue</Button>
            <Button variant="destructive" onClick={handleConfirmLeave}>Leave & End</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiagnosticGateDialog
        open={diagGateOpen}
        onOpenChange={setDiagGateOpen}
        courseId={enrolledCourseId}
        context="Exam Prep is an assessment-scored mode."
      />
    </div>
  );
};

export default AIChat;
