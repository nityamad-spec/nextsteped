import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useActiveQuestionTimer } from "./useActiveQuestionTimer";

let nowMs = 0;
const advance = (ms: number) => {
  nowMs += ms;
  vi.advanceTimersByTime(ms);
};

const setVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
};

describe("useActiveQuestionTimer", () => {
  beforeEach(() => {
    nowMs = 0;
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => nowMs);
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("accrues active time", () => {
    const { result } = renderHook(() => useActiveQuestionTimer());
    act(() => advance(5_000));
    expect(result.current.takeElapsed()).toBe(5_000);
  });

  it("does not accrue while the tab is hidden", () => {
    const { result } = renderHook(() => useActiveQuestionTimer());
    act(() => advance(2_000));
    act(() => {
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      advance(30_000);
      setVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      advance(1_000);
    });
    expect(result.current.takeElapsed()).toBe(3_000);
  });

  it("does not accrue while the window is blurred", () => {
    const { result } = renderHook(() => useActiveQuestionTimer());
    act(() => advance(1_000));
    act(() => {
      window.dispatchEvent(new Event("blur"));
      advance(60_000);
      window.dispatchEvent(new Event("focus"));
      advance(2_000);
    });
    expect(result.current.takeElapsed()).toBe(3_000);
  });

  it("pauses after the idle threshold and resumes on activity", () => {
    const { result } = renderHook(() => useActiveQuestionTimer({ idleMs: 10_000 }));
    // 10s of presence, then 60s idle: only the first 10s counts.
    act(() => advance(10_000));
    act(() => advance(60_000));
    act(() => {
      window.dispatchEvent(new Event("keydown"));
      advance(4_000);
    });
    expect(result.current.takeElapsed()).toBe(14_000);
  });

  it("banks time per question and resets", () => {
    const { result } = renderHook(() => useActiveQuestionTimer());
    act(() => advance(3_000));
    act(() => result.current.commit("q1"));
    act(() => advance(7_000));
    act(() => result.current.commit("q2"));
    expect(result.current.times.current).toEqual({ q1: 3_000, q2: 7_000 });

    act(() => result.current.reset());
    expect(result.current.times.current).toEqual({});
  });

  it("does not accrue while disabled", () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useActiveQuestionTimer({ enabled }),
      { initialProps: { enabled: false } },
    );
    act(() => advance(20_000));
    rerender({ enabled: true });
    act(() => advance(5_000));
    expect(result.current.takeElapsed()).toBe(5_000);
  });
});
