import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { LearningPlanWeek } from "@/hooks/useLearningPlan";
import { textMatchesUnit, unitTerms } from "@/lib/unitStage";

/** A study session needs at least this many user messages to count as studying. */
const MIN_USER_MESSAGES = 2;

interface ChatSessionRow {
  id: string;
  title: string | null;
}

interface ChatMessageRow {
  session_id: string;
  role: string | null;
  content: string | null;
  created_at: string | null;
}

interface PracticeResultRow {
  answers: unknown;
  created_at: string | null;
}

interface TerminalSessionRow {
  week_number: number;
  created_at: string | null;
}

interface MasteryRow {
  concept_code: string | null;
  questions_attempted: number | string | null;
}

export interface UnitProgressResult {
  /** Unit number → student has studied this unit with the teaching assistant. */
  studiedByUnit: Record<number, boolean>;
  /** Unit number → student has finished at least one practice set for this unit. */
  practisedByUnit: Record<number, boolean>;
  loading: boolean;
}

/**
 * Read-only activity signals per unit:
 *  - studied: a study-mode chat session with 2+ user messages that is attributed
 *    to the unit (deep-link title, or the unit's topic/concepts appearing in the
 *    message text). Qualifying sessions that match no unit credit `fallbackUnit`.
 *    Any concept in the unit with attempted mastery also counts.
 *  - practised: an `assessment_results` row with mode = "practice" whose answer
 *    topics intersect the unit's topic/concepts.
 *
 * When a unit's weekly quiz has been taken, only activity recorded *after* that
 * attempt counts, so a student sent back to study/practise starts from a clean
 * pair of steps.
 */
export function useUnitProgress(
  courseId: string | null,
  lessonPlan: LearningPlanWeek[],
  fallbackUnit?: number | null,
  quizTakenAtByUnit?: Record<number, string | undefined>,
): UnitProgressResult {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ChatSessionRow[]>([]);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [practice, setPractice] = useState<PracticeResultRow[]>([]);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSessionRow[]>([]);
  const [mastery, setMastery] = useState<MasteryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId || !user?.id) {
      setSessions([]);
      setMessages([]);
      setPractice([]);
      setTerminalSessions([]);
      setMastery([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [sessionRes, practiceRes, terminalRes, masteryRes] = await Promise.all([
        supabase
          .from("chat_sessions")
          .select("id, title")
          .eq("user_id", user.id)
          .eq("course_id", courseId)
          .eq("mode", "learning")
          .order("updated_at", { ascending: false })
          .limit(40),
        supabase
          .from("assessment_results")
          .select("answers, created_at")
          .eq("student_id", user.id)
          .eq("course_id", courseId)
          .eq("mode", "practice")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("coding_terminal_sessions")
          .select("week_number, created_at")
          .eq("student_id", user.id)
          .eq("course_id", courseId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("student_concept_mastery")
          .select("concept_code, questions_attempted")
          .eq("student_id", user.id)
          .eq("course_id", courseId),
      ]);
      if (cancelled) return;
      if (sessionRes.error) console.error("[useUnitProgress] chat sessions load error", sessionRes.error);
      if (practiceRes.error) console.error("[useUnitProgress] practice load error", practiceRes.error);
      if (terminalRes.error) console.error("[useUnitProgress] terminal sessions load error", terminalRes.error);
      if (masteryRes.error) console.error("[useUnitProgress] mastery load error", masteryRes.error);

      const sessionRows = (sessionRes.data as ChatSessionRow[]) || [];
      let messageRows: ChatMessageRow[] = [];
      if (sessionRows.length > 0) {
        const { data, error } = await supabase
          .from("chat_messages")
          .select("session_id, role, content, created_at")
          .eq("user_id", user.id)
          .in(
            "session_id",
            sessionRows.map((s) => s.id),
          )
          .eq("role", "user")
          .order("created_at", { ascending: true })
          .limit(500);
        if (error) console.error("[useUnitProgress] chat messages load error", error);
        messageRows = (data as ChatMessageRow[]) || [];
      }
      if (cancelled) return;

      setSessions(sessionRows);
      setMessages(messageRows);
      setPractice((practiceRes.data as PracticeResultRow[]) || []);
      setTerminalSessions((terminalRes.data as TerminalSessionRow[]) || []);
      setMastery((masteryRes.data as MasteryRow[]) || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, user?.id]);

  return useMemo(() => {
    const attemptedConcepts = new Set(
      mastery
        .filter((m) => (Number(m.questions_attempted) || 0) > 0 && m.concept_code)
        .map((m) => String(m.concept_code)),
    );

    const toTime = (value: string | null | undefined) => {
      if (!value) return 0;
      const t = new Date(value).getTime();
      return Number.isFinite(t) ? t : 0;
    };

    /** Quiz attempt time for a unit, or 0 when the quiz has not been taken. */
    const quizTimeFor = (unit: number) => toTime(quizTakenAtByUnit?.[unit]);

    const practiceConcepts: { topic: string; at: number }[] = [];
    practice.forEach((row) => {
      const at = toTime(row.created_at);
      const answers = Array.isArray(row.answers) ? (row.answers as Record<string, unknown>[]) : [];
      answers.forEach((a) => {
        const topic = typeof a?.topic === "string" ? a.topic : "";
        if (topic) practiceConcepts.push({ topic, at });
      });
    });

    // Group user messages per session and keep only sessions with real back-and-forth.
    const userTextBySession = new Map<string, string[]>();
    const lastMessageAtBySession = new Map<string, number>();
    messages.forEach((m) => {
      if (m.role !== "user" || !m.content) return;
      const list = userTextBySession.get(m.session_id) || [];
      list.push(m.content);
      userTextBySession.set(m.session_id, list);
      const at = toTime(m.created_at);
      if (at > (lastMessageAtBySession.get(m.session_id) || 0)) {
        lastMessageAtBySession.set(m.session_id, at);
      }
    });

    const qualifyingSessions = sessions
      .map((s) => ({
        session: s,
        texts: userTextBySession.get(s.id) || [],
        lastAt: lastMessageAtBySession.get(s.id) || 0,
      }))
      .filter((s) => s.texts.length >= MIN_USER_MESSAGES);

    const termsByUnit = new Map<number, string[]>();
    lessonPlan.forEach((week) => termsByUnit.set(week.day, unitTerms(week)));

    const studiedByUnit: Record<number, boolean> = {};
    const practisedByUnit: Record<number, boolean> = {};

    lessonPlan.forEach((week) => {
      const terms = termsByUnit.get(week.day) || [];
      const conceptNames = (week.concepts || []).map((c) => c?.name).filter(Boolean) as string[];
      const quizAt = quizTimeFor(week.day);

      // Mastery has no timestamp and is written by the quiz itself, so it can only
      // stand in for studying before the quiz was taken.
      studiedByUnit[week.day] = quizAt === 0 && conceptNames.some((name) => attemptedConcepts.has(name));
      // Practice counts via scored practice-question results OR a code-terminal
      // session for this unit — either way, only activity after the latest quiz
      // attempt counts.
      practisedByUnit[week.day] =
        practiceConcepts.some((p) => p.at > quizAt && textMatchesUnit(p.topic, terms)) ||
        terminalSessions.some((s) => s.week_number === week.day && toTime(s.created_at) > quizAt);
    });

    // Attribute each qualifying session: deep-link title first, then message text.
    qualifyingSessions.forEach(({ session, texts, lastAt }) => {
      let matched = false;
      for (const week of lessonPlan) {
        const terms = termsByUnit.get(week.day) || [];
        if (terms.length === 0) continue;
        if (textMatchesUnit(session.title, terms) || texts.some((t) => textMatchesUnit(t, terms))) {
          matched = true;
          if (lastAt > quizTimeFor(week.day)) studiedByUnit[week.day] = true;
        }
      }
      if (!matched && fallbackUnit != null && lastAt > quizTimeFor(fallbackUnit)) {
        studiedByUnit[fallbackUnit] = true;
      }
    });

    return { studiedByUnit, practisedByUnit, loading };
  }, [sessions, messages, practice, terminalSessions, mastery, lessonPlan, fallbackUnit, quizTakenAtByUnit, loading]);
}
