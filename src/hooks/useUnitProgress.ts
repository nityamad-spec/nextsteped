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
}

interface PracticeResultRow {
  answers: unknown;
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
 */
export function useUnitProgress(
  courseId: string | null,
  lessonPlan: LearningPlanWeek[],
  fallbackUnit?: number | null,
): UnitProgressResult {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ChatSessionRow[]>([]);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [practice, setPractice] = useState<PracticeResultRow[]>([]);
  const [mastery, setMastery] = useState<MasteryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId || !user?.id) {
      setSessions([]);
      setMessages([]);
      setPractice([]);
      setMastery([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [sessionRes, practiceRes, masteryRes] = await Promise.all([
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
          .select("answers")
          .eq("student_id", user.id)
          .eq("course_id", courseId)
          .eq("mode", "practice")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("student_concept_mastery")
          .select("concept_code, questions_attempted")
          .eq("student_id", user.id)
          .eq("course_id", courseId),
      ]);
      if (cancelled) return;
      if (sessionRes.error) console.error("[useUnitProgress] chat sessions load error", sessionRes.error);
      if (practiceRes.error) console.error("[useUnitProgress] practice load error", practiceRes.error);
      if (masteryRes.error) console.error("[useUnitProgress] mastery load error", masteryRes.error);

      const sessionRows = (sessionRes.data as ChatSessionRow[]) || [];
      let messageRows: ChatMessageRow[] = [];
      if (sessionRows.length > 0) {
        const { data, error } = await supabase
          .from("chat_messages")
          .select("session_id, role, content")
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

    const practiceTopics: string[] = [];
    practice.forEach((row) => {
      const answers = Array.isArray(row.answers) ? (row.answers as Record<string, unknown>[]) : [];
      answers.forEach((a) => {
        const topic = typeof a?.topic === "string" ? a.topic : "";
        if (topic) practiceTopics.push(topic);
      });
    });

    // Group user messages per session and keep only sessions with real back-and-forth.
    const userTextBySession = new Map<string, string[]>();
    messages.forEach((m) => {
      if (m.role !== "user" || !m.content) return;
      const list = userTextBySession.get(m.session_id) || [];
      list.push(m.content);
      userTextBySession.set(m.session_id, list);
    });

    const qualifyingSessions = sessions
      .map((s) => ({ session: s, texts: userTextBySession.get(s.id) || [] }))
      .filter((s) => s.texts.length >= MIN_USER_MESSAGES);

    const termsByUnit = new Map<number, string[]>();
    lessonPlan.forEach((week) => termsByUnit.set(week.day, unitTerms(week)));

    const studiedByUnit: Record<number, boolean> = {};
    const practisedByUnit: Record<number, boolean> = {};

    lessonPlan.forEach((week) => {
      const terms = termsByUnit.get(week.day) || [];
      const conceptNames = (week.concepts || []).map((c) => c?.name).filter(Boolean) as string[];

      studiedByUnit[week.day] = conceptNames.some((name) => attemptedConcepts.has(name));
      practisedByUnit[week.day] = practiceTopics.some((t) => textMatchesUnit(t, terms));
    });

    // Attribute each qualifying session: deep-link title first, then message text.
    qualifyingSessions.forEach(({ session, texts }) => {
      let matched = false;
      for (const week of lessonPlan) {
        const terms = termsByUnit.get(week.day) || [];
        if (terms.length === 0) continue;
        if (textMatchesUnit(session.title, terms) || texts.some((t) => textMatchesUnit(t, terms))) {
          studiedByUnit[week.day] = true;
          matched = true;
        }
      }
      if (!matched && fallbackUnit != null) {
        studiedByUnit[fallbackUnit] = true;
      }
    });

    return { studiedByUnit, practisedByUnit, loading };
  }, [sessions, messages, practice, mastery, lessonPlan, fallbackUnit, loading]);
}
