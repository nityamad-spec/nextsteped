import { useCallback, useEffect, useRef } from "react";

/**
 * Per-question "time on task" clock that only accrues while the student is
 * actually present.
 *
 * Plain wall-clock timing inflates `time_ms` whenever the tab is hidden, the
 * window loses focus, or the student walks away — which drags the pace half of
 * the blended score down unfairly. This hook pauses on:
 *   - `visibilitychange` → hidden
 *   - `window` blur (alt-tab / other app on top)
 *   - inactivity: no pointer / key / scroll event for `idleMs`
 *
 * Elapsed time is measured with `performance.now()`, so it is monotonic and
 * immune to system clock changes.
 */

export interface ActiveQuestionTimerOptions {
  /** Clock runs only while true. Defaults to true. */
  enabled?: boolean;
  /** Inactivity before the clock pauses, in ms. Defaults to 60s. */
  idleMs?: number;
}

export interface ActiveQuestionTimer {
  /** Ms of active time since the last take/commit. Resets the marker. */
  takeElapsed: () => number;
  /** Bank the active time onto a question id inside the internal map. */
  commit: (questionId?: string) => void;
  /** Accumulated per-question times (ms), keyed by question id. */
  times: React.MutableRefObject<Record<string, number>>;
  /** Clear all banked times and restart the clock. */
  reset: () => void;
  /** Restart the clock without clearing banked times (e.g. next question). */
  restart: () => void;
}

const DEFAULT_IDLE_MS = 60_000;

const now = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

export function useActiveQuestionTimer(
  options: ActiveQuestionTimerOptions = {},
): ActiveQuestionTimer {
  const { enabled = true, idleMs = DEFAULT_IDLE_MS } = options;

  const times = useRef<Record<string, number>>({});
  /** Timestamp the clock started running, or null while paused. */
  const activeSinceRef = useRef<number | null>(null);
  /** Active ms banked since the last take, while paused/resumed. */
  const accruedRef = useRef(0);
  const enabledRef = useRef(enabled);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pause = useCallback(() => {
    if (activeSinceRef.current !== null) {
      accruedRef.current += now() - activeSinceRef.current;
      activeSinceRef.current = null;
    }
  }, []);

  const resume = useCallback(() => {
    if (!enabledRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (activeSinceRef.current === null) activeSinceRef.current = now();
  }, []);

  const takeElapsed = useCallback(() => {
    const t = now();
    const total =
      accruedRef.current + (activeSinceRef.current !== null ? t - activeSinceRef.current : 0);
    accruedRef.current = 0;
    if (activeSinceRef.current !== null) activeSinceRef.current = t;
    return Math.max(0, Math.round(total));
  }, []);

  const commit = useCallback(
    (questionId?: string) => {
      const elapsed = takeElapsed();
      if (questionId) {
        times.current[questionId] = (times.current[questionId] ?? 0) + elapsed;
      }
    },
    [takeElapsed],
  );

  const restart = useCallback(() => {
    accruedRef.current = 0;
    activeSinceRef.current = enabledRef.current ? now() : null;
  }, []);

  const reset = useCallback(() => {
    times.current = {};
    restart();
  }, [restart]);

  // Enable / disable the clock.
  useEffect(() => {
    enabledRef.current = enabled;
    if (enabled) resume();
    else pause();
  }, [enabled, pause, resume]);

  // Pause on tab hide / window blur; resume on return.
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const scheduleIdle = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (idleMs <= 0) return;
      idleTimerRef.current = setTimeout(() => pause(), idleMs);
    };

    const onActivity = () => {
      resume();
      scheduleIdle();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") pause();
      else onActivity();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", pause);
    window.addEventListener("focus", onActivity);
    for (const evt of ["pointerdown", "mousemove", "keydown", "scroll", "touchstart"]) {
      window.addEventListener(evt, onActivity, { passive: true });
    }
    scheduleIdle();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", onActivity);
      for (const evt of ["pointerdown", "mousemove", "keydown", "scroll", "touchstart"]) {
        window.removeEventListener(evt, onActivity);
      }
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    };
  }, [enabled, idleMs, pause, resume]);

  return { takeElapsed, commit, times, reset, restart };
}
