// Student-side hook: videos attached to a lesson-plan week plus the current
// student's watched state. Watched rows persist in student_video_watches.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  allVideosWatched, fetchWatchedVideoIds, fetchWeekVideos, markVideoWatched,
  type WeekVideo,
} from "@/lib/weekVideos";

export const useWeekVideos = (courseId: string | null, weekNumber: number | null) => {
  const { user } = useAuth();
  const [videos, setVideos] = useState<WeekVideo[]>([]);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!courseId || weekNumber == null || !user?.id) {
      setVideos([]);
      setWatchedIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await fetchWeekVideos(courseId, weekNumber);
        const watched = await fetchWatchedVideoIds(user.id, rows.map((r) => r.id));
        if (cancelled) return;
        setVideos(rows);
        setWatchedIds(watched);
      } catch (err) {
        if (!cancelled) console.error("Week videos load error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, weekNumber, user?.id]);

  const markWatched = useCallback(
    async (videoId: string) => {
      if (!courseId || !user?.id || watchedIds.has(videoId)) return;
      // Optimistic: flip the check immediately, persist in the background.
      setWatchedIds((prev) => new Set(prev).add(videoId));
      try {
        await markVideoWatched({ videoId, courseId, studentId: user.id });
      } catch (err) {
        console.error("Mark watched error:", err);
        setWatchedIds((prev) => {
          const next = new Set(prev);
          next.delete(videoId);
          return next;
        });
      }
    },
    [courseId, user?.id, watchedIds],
  );

  return {
    videos,
    watchedIds,
    loading,
    markWatched,
    allWatched: allVideosWatched(videos, watchedIds),
  };
};
