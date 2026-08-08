import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useProctoring,
  requestFullscreenOn,
  exitFullscreen,
  fullscreenSupported,
  type ProctorViolation,
} from "./useProctoring";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Advance the clock past the 1500ms violation debounce window. */
const pastDebounce = () => act(() => { vi.advanceTimersByTime(1600); });

const fireBlur = () => act(() => { window.dispatchEvent(new Event("blur")); });
const firePageHide = () => act(() => { window.dispatchEvent(new Event("pagehide")); });
const fireFullscreenChange = () =>
  act(() => { document.dispatchEvent(new Event("fullscreenchange")); });
const fireWebkitFullscreenChange = () =>
  act(() => { document.dispatchEvent(new Event("webkitfullscreenchange")); });

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
}

function setFullscreenElement(el: Element | null) {
  Object.defineProperty(document, "fullscreenElement", { value: el, configurable: true });
}

interface Spies {
  onWarn: ReturnType<typeof vi.fn>;
  onVoid: ReturnType<typeof vi.fn>;
}

function setup(overrides: Partial<Parameters<typeof useProctoring>[0]> = {}) {
  const spies: Spies = { onWarn: vi.fn(), onVoid: vi.fn() };
  const view = renderHook(
    (props: Partial<Parameters<typeof useProctoring>[0]>) =>
      useProctoring({
        enabled: true,
        onWarn: spies.onWarn,
        onVoid: spies.onVoid,
        ...overrides,
        ...props,
      }),
    { initialProps: {} },
  );
  return { ...view, ...spies };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  setVisibility("visible");
  setFullscreenElement(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// warn -> void escalation
// ---------------------------------------------------------------------------

describe("useProctoring escalation", () => {
  it("warns on the first violation and does not void", () => {
    const { onWarn, onVoid, result } = setup();
    fireBlur();
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onWarn).toHaveBeenCalledWith("window_blur", 1);
    expect(onVoid).not.toHaveBeenCalled();
    expect(result.current.violations).toBe(1);
  });

  it("voids on the second violation", () => {
    const { onWarn, onVoid, result } = setup();
    fireBlur();
    pastDebounce();
    setVisibility("hidden");
    expect(onVoid).toHaveBeenCalledTimes(1);
    expect(onVoid).toHaveBeenCalledWith("tab_hidden", 2);
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(result.current.violations).toBe(2);
  });

  it("never fires void twice, even under a violation storm", () => {
    const { onVoid } = setup();
    fireBlur();
    for (let i = 0; i < 5; i++) {
      pastDebounce();
      fireBlur();
    }
    expect(onVoid).toHaveBeenCalledTimes(1);
  });

  it("stops counting after the attempt is voided", () => {
    const { onVoid, result } = setup();
    fireBlur();
    pastDebounce();
    fireBlur();
    expect(result.current.violations).toBe(2);
    pastDebounce();
    fireBlur();
    pastDebounce();
    firePageHide();
    expect(result.current.violations).toBe(2);
    expect(onVoid).toHaveBeenCalledTimes(1);
  });

  it("honours a custom allowedViolations budget", () => {
    const { onWarn, onVoid } = setup({ allowedViolations: 2 });
    fireBlur();
    pastDebounce();
    fireBlur();
    expect(onVoid).not.toHaveBeenCalled();
    expect(onWarn).toHaveBeenCalledTimes(2);
    pastDebounce();
    fireBlur();
    expect(onVoid).toHaveBeenCalledWith("window_blur", 3);
  });

  it("voids immediately on the first violation when allowedViolations is 0", () => {
    const { onWarn, onVoid } = setup({ allowedViolations: 0 });
    fireBlur();
    expect(onWarn).not.toHaveBeenCalled();
    expect(onVoid).toHaveBeenCalledWith("window_blur", 1);
  });
});

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------

describe("useProctoring debounce", () => {
  it("collapses blur + visibilitychange fired together into one violation", () => {
    // Alt-tabbing typically fires blur and visibilitychange back to back.
    const { onWarn, onVoid, result } = setup();
    fireBlur();
    setVisibility("hidden");
    expect(result.current.violations).toBe(1);
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onVoid).not.toHaveBeenCalled();
  });

  it("counts violations separated by more than the debounce window", () => {
    const { result } = setup({ allowedViolations: 10 });
    fireBlur();
    pastDebounce();
    fireBlur();
    pastDebounce();
    fireBlur();
    expect(result.current.violations).toBe(3);
  });

  it("does not count a violation exactly inside the debounce window", () => {
    const { result } = setup({ allowedViolations: 10 });
    fireBlur();
    act(() => { vi.advanceTimersByTime(1400); });
    fireBlur();
    expect(result.current.violations).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// violation sources
// ---------------------------------------------------------------------------

describe("useProctoring violation sources", () => {
  it.each<[string, () => void, ProctorViolation]>([
    ["window blur (alt-tab to another app)", fireBlur, "window_blur"],
    ["tab hidden", () => setVisibility("hidden"), "tab_hidden"],
    ["pagehide (bfcache / navigation away)", firePageHide, "page_hide"],
  ])("reports %s", (_label, trigger, expected) => {
    const { onWarn } = setup();
    trigger();
    expect(onWarn).toHaveBeenCalledWith(expected, 1);
  });

  it("ignores visibilitychange back to visible", () => {
    const { onWarn } = setup();
    setVisibility("visible");
    expect(onWarn).not.toHaveBeenCalled();
  });

  it("reports fullscreen exit but not fullscreen entry", () => {
    const { onWarn, result } = setup();

    setFullscreenElement(document.body);
    fireFullscreenChange();
    expect(onWarn).not.toHaveBeenCalled();
    expect(result.current.isFullscreen).toBe(true);

    setFullscreenElement(null);
    fireFullscreenChange();
    expect(onWarn).toHaveBeenCalledWith("fullscreen_exit", 1);
    expect(result.current.isFullscreen).toBe(false);
  });

  it("handles the webkit-prefixed fullscreen event", () => {
    const { onWarn } = setup();
    setFullscreenElement(null);
    fireWebkitFullscreenChange();
    expect(onWarn).toHaveBeenCalledWith("fullscreen_exit", 1);
  });

  it("collapses the fullscreen exit + blur pair that Escape produces", () => {
    const { result } = setup();
    setFullscreenElement(null);
    fireFullscreenChange();
    fireBlur();
    expect(result.current.violations).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// enabled / paused gating
// ---------------------------------------------------------------------------

describe("useProctoring gating", () => {
  it("does not listen while disabled", () => {
    const { onWarn } = setup({ enabled: false });
    fireBlur();
    setVisibility("hidden");
    expect(onWarn).not.toHaveBeenCalled();
  });

  it("does not count violations while paused (warning dialog open)", () => {
    const spies = { onWarn: vi.fn(), onVoid: vi.fn() };
    const { rerender } = renderHook(
      ({ paused }: { paused: boolean }) =>
        useProctoring({ enabled: true, paused, ...spies }),
      { initialProps: { paused: false } },
    );

    fireBlur();
    expect(spies.onWarn).toHaveBeenCalledTimes(1);

    rerender({ paused: true });
    // Everything that happens while the student reads the warning is ignored.
    pastDebounce();
    fireBlur();
    setVisibility("hidden");
    pastDebounce();
    firePageHide();
    expect(spies.onVoid).not.toHaveBeenCalled();

    // Resuming re-arms detection.
    rerender({ paused: false });
    pastDebounce();
    fireBlur();
    expect(spies.onVoid).toHaveBeenCalledWith("window_blur", 2);
  });

  it("keeps the violation count across a pause/resume cycle", () => {
    const { rerender, result } = renderHook(
      ({ paused }: { paused: boolean }) => useProctoring({ enabled: true, paused }),
      { initialProps: { paused: false } },
    );
    fireBlur();
    expect(result.current.violations).toBe(1);
    rerender({ paused: true });
    rerender({ paused: false });
    expect(result.current.violations).toBe(1);
  });

  it("removes all listeners on unmount", () => {
    const { onWarn, unmount } = setup();
    unmount();
    fireBlur();
    setVisibility("hidden");
    firePageHide();
    expect(onWarn).not.toHaveBeenCalled();
  });

  it("always uses the latest callbacks without re-subscribing", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onWarn }: { onWarn: () => void }) => useProctoring({ enabled: true, onWarn }),
      { initialProps: { onWarn: first } },
    );
    rerender({ onWarn: second });
    fireBlur();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// copy / paste / context menu suppression
// ---------------------------------------------------------------------------

describe("useProctoring content protection", () => {
  const dispatchOn = (el: EventTarget, type: string) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    act(() => { el.dispatchEvent(ev); });
    return ev;
  };

  it.each(["copy", "cut", "paste", "contextmenu"])("blocks %s on the page", (type) => {
    setup();
    expect(dispatchOn(document.body, type).defaultPrevented).toBe(true);
  });

  it.each(["copy", "cut", "paste", "contextmenu"])(
    "blocks %s even inside the reasoning textarea",
    (type) => {
      setup();
      const ta = document.createElement("textarea");
      document.body.appendChild(ta);
      expect(dispatchOn(ta, type).defaultPrevented).toBe(true);
      ta.remove();
    },
  );

  it.each(["selectstart", "dragstart"])("blocks %s outside form fields", (type) => {
    setup();
    expect(dispatchOn(document.body, type).defaultPrevented).toBe(true);
  });

  it.each(["selectstart", "dragstart"])("allows %s inside inputs and textareas", (type) => {
    setup();
    const input = document.createElement("input");
    const ta = document.createElement("textarea");
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    document.body.append(input, ta, editable);
    expect(dispatchOn(input, type).defaultPrevented).toBe(false);
    expect(dispatchOn(ta, type).defaultPrevented).toBe(false);
    expect(dispatchOn(editable, type).defaultPrevented).toBe(false);
    input.remove(); ta.remove(); editable.remove();
  });

  it("stays active while paused (only leave detection pauses)", () => {
    setup({ paused: true });
    expect(dispatchOn(document.body, "copy").defaultPrevented).toBe(true);
  });

  it("does not block anything when disabled", () => {
    setup({ enabled: false });
    expect(dispatchOn(document.body, "copy").defaultPrevented).toBe(false);
    expect(dispatchOn(document.body, "contextmenu").defaultPrevented).toBe(false);
  });

  it("stops blocking after unmount", () => {
    const { unmount } = setup();
    unmount();
    expect(dispatchOn(document.body, "paste").defaultPrevented).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fullscreen helpers
// ---------------------------------------------------------------------------

describe("fullscreen helpers", () => {
  it("returns false when there is no target element", async () => {
    await expect(requestFullscreenOn(null)).resolves.toBe(false);
  });

  it("uses the standard API when available", async () => {
    const el = document.createElement("div");
    const req = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(el, "requestFullscreen", { value: req, configurable: true });
    await expect(requestFullscreenOn(el)).resolves.toBe(true);
    expect(req).toHaveBeenCalled();
  });

  it("falls back to the webkit API", async () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "requestFullscreen", { value: undefined, configurable: true });
    const req = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(el, "webkitRequestFullscreen", { value: req, configurable: true });
    await expect(requestFullscreenOn(el)).resolves.toBe(true);
  });

  it("returns false when no fullscreen API exists (iOS Safari on iPhone)", async () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "requestFullscreen", { value: undefined, configurable: true });
    await expect(requestFullscreenOn(el)).resolves.toBe(false);
  });

  it("returns false when the browser rejects the request (no user gesture)", async () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "requestFullscreen", {
      value: vi.fn().mockRejectedValue(new Error("denied")),
      configurable: true,
    });
    await expect(requestFullscreenOn(el)).resolves.toBe(false);
  });

  it("exitFullscreen is a no-op when not in fullscreen", async () => {
    setFullscreenElement(null);
    const exit = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, "exitFullscreen", { value: exit, configurable: true });
    await exitFullscreen();
    expect(exit).not.toHaveBeenCalled();
  });

  it("exitFullscreen exits when in fullscreen and swallows failures", async () => {
    setFullscreenElement(document.body);
    const exit = vi.fn().mockRejectedValue(new Error("nope"));
    Object.defineProperty(document, "exitFullscreen", { value: exit, configurable: true });
    await expect(exitFullscreen()).resolves.toBeUndefined();
    expect(exit).toHaveBeenCalled();
  });

  it("fullscreenSupported reflects the document capability flags", () => {
    Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
    expect(fullscreenSupported()).toBe(true);
    Object.defineProperty(document, "fullscreenEnabled", { value: false, configurable: true });
    Object.defineProperty(document, "webkitFullscreenEnabled", { value: undefined, configurable: true });
    expect(fullscreenSupported()).toBe(false);
  });

  it("enterFullscreen reports failure but never throws", async () => {
    const ref = { current: document.createElement("div") };
    Object.defineProperty(ref.current, "requestFullscreen", {
      value: vi.fn().mockRejectedValue(new Error("blocked")),
      configurable: true,
    });
    const { result } = setup({ targetRef: ref });
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.enterFullscreen(); });
    expect(ok).toBe(false);
    expect(result.current.isFullscreen).toBe(false);
  });

  it("enterFullscreen updates isFullscreen on success", async () => {
    const ref = { current: document.createElement("div") };
    Object.defineProperty(ref.current, "requestFullscreen", {
      value: vi.fn().mockImplementation(async () => setFullscreenElement(ref.current)),
      configurable: true,
    });
    const { result } = setup({ targetRef: ref });
    await act(async () => { await result.current.enterFullscreen(); });
    expect(result.current.isFullscreen).toBe(true);
  });

  it("enterFullscreen returns false when the ref is not mounted yet", async () => {
    const ref = { current: null } as unknown as React.RefObject<HTMLElement>;
    const { result } = setup({ targetRef: ref });
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.enterFullscreen(); });
    expect(ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// manual reporting
// ---------------------------------------------------------------------------

describe("reportViolation (manual)", () => {
  it("escalates the same way as browser-driven violations", () => {
    const { result, onWarn, onVoid } = setup();
    act(() => { result.current.reportViolation("fullscreen_exit"); });
    expect(onWarn).toHaveBeenCalledWith("fullscreen_exit", 1);
    pastDebounce();
    act(() => { result.current.reportViolation("fullscreen_exit"); });
    expect(onVoid).toHaveBeenCalledWith("fullscreen_exit", 2);
  });

  it("is debounced against browser events too", () => {
    const { result } = setup({ allowedViolations: 10 });
    fireBlur();
    act(() => { result.current.reportViolation("tab_hidden"); });
    expect(result.current.violations).toBe(1);
  });
});
