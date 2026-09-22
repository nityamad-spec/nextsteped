import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPublishedDailyDsaQuestions, type PublishedDailyDsaQuestion } from "@/lib/dailyDsaQuestions";
import { dayKey, pickDailyExercise, recentSolvedDays, solvedStreak } from "@/lib/dailyDsa";

export interface DailyDsaState {
  loading: boolean;
  /** Course has coding approved and at least one published daily question. */
  hasBank: boolean;
  exercise: PublishedDailyDsaQuestion | null;
  solvedCount: number;
  totalCount: number;
  streak: number;
  recentDays: string[];
  solvedToday: boolean;
  attemptsToday: number;
  bankComplete: boolean;
  reload: () => void;
}

/**
 * Real Daily DSA state: today's unsolved question from the professor-built
 * daily-practice bank, plus the student's solved-day streak and attempt
 * history. A question is "solved" when the student has a fully-passing
 * submission recorded in daily_dsa_attempts.
 */
export function useDailyDsa(
  courseId: string | null | undefined,
  codingApproved: boolean,
  unlockedWeeks: number[],
): DailyDsaState {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [exercises, setExercises] = useState<PublishedDailyDsaQuestion[]>([]);
  const [solvedIds, setSolvedIds] = useState<Set<string>>(new Set());
  const [solvedDays, setSolvedDays] = useState<string[]>([]);
  const [attemptsToday, setAttemptsToday] = useState(0);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!courseId || !user?.id || !codingApproved) {
      setExercises([]);
      setSolvedIds(new Set());
      setSolvedDays([]);
      setAttemptsToday(0);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [bank, solved, attempts] = await Promise.all([
          fetchPublishedDailyDsaQuestions(courseId),
          supabase
            .from("daily_dsa_attempts")
            .select("question_id")
            .eq("student_id", user.id)
            .eq("course_id", courseId)
            .eq("passed", true),
          supabase
            .from("daily_dsa_attempts")
            .select("created_at, passed")
            .eq("student_id", user.id)
            .eq("course_id", courseId)
            .order("created_at", { ascending: false })
            .limit(500),
        ]);
        if (cancelled) return;
        setExercises(bank);
        setSolvedIds(new Set((solved.data ?? []).map((r) => r.question_id as string)));
        const rows = attempts.data ?? [];
        const today = dayKey();
        setSolvedDays(
          rows.filter((r) => r.passed).map((r) => dayKey(r.created_at as string)),
        );
        setAttemptsToday(rows.filter((r) => dayKey(r.created_at as string) === today).length);
      } catch (err) {
        if (!cancelled) console.error("[useDailyDsa] load failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, user?.id, codingApproved, nonce]);

  const unlockedKey = unlockedWeeks.join(",");
  const exercise = useMemo(
    () => pickDailyExercise(exercises, solvedIds, new Set(unlockedWeeks)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exercises, solvedIds, unlockedKey],
  );

  const today = dayKey();
  return {
    loading,
    hasBank: codingApproved && exercises.length > 0,
    exercise,
    solvedCount: solvedIds.size,
    totalCount: exercises.length,
    streak: solvedStreak(solvedDays, today),
    recentDays: recentSolvedDays(solvedDays),
    solvedToday: solvedDays.includes(today),
    attemptsToday,
    bankComplete: exercises.length > 0 && exercise === null,
    reload,
  };
}
