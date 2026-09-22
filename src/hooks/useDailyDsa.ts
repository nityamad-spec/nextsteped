import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPublishedExercises, type PublishedCodingExercise } from "@/lib/codingExercises";
import { dayKey, pickDailyExercise, recentSolvedDays, solvedStreak } from "@/lib/dailyDsa";

export interface DailyDsaState {
  loading: boolean;
  /** Course has coding approved and at least one published exercise. */
  hasBank: boolean;
  exercise: PublishedCodingExercise | null;
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
 * Real Daily DSA state: today's unsolved problem from the course's published
 * exercise bank, plus the student's solved-day streak and attempt history.
 */
export function useDailyDsa(
  courseId: string | null | undefined,
  codingApproved: boolean,
  unlockedWeeks: number[],
): DailyDsaState {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [exercises, setExercises] = useState<PublishedCodingExercise[]>([]);
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
        const [bank, progress, attempts] = await Promise.all([
          fetchPublishedExercises(courseId),
          supabase
            .from("coding_exercise_progress")
            .select("exercise_id")
            .eq("student_id", user.id)
            .eq("course_id", courseId),
          supabase
            .from("coding_attempts")
            .select("created_at, passed")
            .eq("student_id", user.id)
            .eq("course_id", courseId)
            .order("created_at", { ascending: false })
            .limit(500),
        ]);
        if (cancelled) return;
        setExercises(bank);
        setSolvedIds(new Set((progress.data ?? []).map((r) => r.exercise_id as string)));
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
