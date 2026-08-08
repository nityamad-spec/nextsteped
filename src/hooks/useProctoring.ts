import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser lock ("proctoring") for timed assessments.
 *
 * Detects the student leaving the assessment: switching browser tabs, switching
 * to another window/app, minimising, or exiting fullscreen. The first violation
 * raises a warning; the next one voids the attempt.
 *
 * Note: `visibilitychange` alone does not fire when the student alt-tabs to a
 * different browser or application — the tab stays "visible" and only the
 * window loses focus. Focus/blur detection is what covers that case.
 */

export type ProctorViolation =
  | "tab_hidden"
  | "window_blur"
  | "fullscreen_exit"
  | "page_hide";

interface Options {
  /** Turn the whole mechanism on/off. */
  enabled: boolean;
  /** Temporarily suspend detection (e.g. while the warning dialog is shown). */
  paused?: boolean;
  /** Element to request fullscreen on. */
  targetRef?: React.RefObject<HTMLElement>;
  /** Number of violations tolerated before voiding. Default 1 (warn once). */
  allowedViolations?: number;
  onWarn?: (violation: ProctorViolation, count: number) => void;
  onVoid?: (violation: ProctorViolation, count: number) => void;
}

/** Violations arriving within this window are treated as one event. */
const DEBOUNCE_MS = 1500;

function fullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  return (
    document.fullscreenElement ??
    // Safari
    (document as unknown as { webkitFullscreenElement?: Element })
      .webkitFullscreenElement ??
    null
  );
}

export async function requestFullscreenOn(el: HTMLElement | null): Promise<boolean> {
  if (!el) return false;
  const anyEl = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (anyEl.webkitRequestFullscreen) await anyEl.webkitRequestFullscreen();
    else return false;
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    if (!fullscreenElement()) return;
    const anyDoc = document as unknown as { webkitExitFullscreen?: () => Promise<void> };
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (anyDoc.webkitExitFullscreen) await anyDoc.webkitExitFullscreen();
  } catch {
    /* ignore */
  }
}

/** Some browsers (notably iOS Safari) never allow element fullscreen. */
export function fullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  const anyDoc = document as unknown as {
    fullscreenEnabled?: boolean;
    webkitFullscreenEnabled?: boolean;
  };
  return Boolean(anyDoc.fullscreenEnabled ?? anyDoc.webkitFullscreenEnabled);
}

export function useProctoring({
  enabled,
  paused = false,
  targetRef,
  allowedViolations = 1,
  onWarn,
  onVoid,
}: Options) {
  const [violations, setViolations] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const lastAtRef = useRef(0);
  const countRef = useRef(0);
  const voidedRef = useRef(false);
  const warnRef = useRef(onWarn);
  const voidRef = useRef(onVoid);
  warnRef.current = onWarn;
  voidRef.current = onVoid;

  const enterFullscreen = useCallback(async () => {
    const ok = await requestFullscreenOn(targetRef?.current ?? null);
    setIsFullscreen(Boolean(fullscreenElement()));
    return ok;
  }, [targetRef]);

  const reportViolation = useCallback(
    (kind: ProctorViolation) => {
      if (voidedRef.current) return;
      const now = Date.now();
      if (now - lastAtRef.current < DEBOUNCE_MS) return;
      lastAtRef.current = now;
      countRef.current += 1;
      const count = countRef.current;
      setViolations(count);
      if (count > allowedViolations) {
        voidedRef.current = true;
        voidRef.current?.(kind, count);
      } else {
        warnRef.current?.(kind, count);
      }
    },
    [allowedViolations],
  );

  // Leave detection
  useEffect(() => {
    if (!enabled || paused) return;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") reportViolation("tab_hidden");
    };
    const onBlur = () => reportViolation("window_blur");
    const onPageHide = () => reportViolation("page_hide");
    const onFullscreenChange = () => {
      const active = Boolean(fullscreenElement());
      setIsFullscreen(active);
      if (!active) reportViolation("fullscreen_exit");
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [enabled, paused, reportViolation]);

  // Copy / paste / selection / context menu suppression
  useEffect(() => {
    if (!enabled) return;
    const isField = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      const tag = el?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable === true;
    };
    const block = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    // Always blocked, even inside the reasoning textarea.
    const hardEvents = ["copy", "cut", "paste", "contextmenu"];
    // Blocked outside form fields only, so typing still works.
    const softEvents = ["selectstart", "dragstart"];
    const softBlock = (e: Event) => {
      if (isField(e.target)) return;
      block(e);
    };
    hardEvents.forEach((n) => document.addEventListener(n, block, true));
    softEvents.forEach((n) => document.addEventListener(n, softBlock, true));
    return () => {
      hardEvents.forEach((n) => document.removeEventListener(n, block, true));
      softEvents.forEach((n) => document.removeEventListener(n, softBlock, true));
    };
  }, [enabled]);

  return { violations, isFullscreen, enterFullscreen, reportViolation };
}
