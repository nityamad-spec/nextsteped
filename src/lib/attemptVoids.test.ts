import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { insertError: unknown; count: number; rows: Array<{ ref_key: string | null }> } = {
  insertError: null,
  count: 0,
  rows: [],
};

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const chain: Record<string, unknown> = {};
    const self = new Proxy(chain, {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) =>
            resolve({ data: state.rows, count: state.count, error: null });
        }
        return () => self;
      },
    });
    return self;
  };
  return {
    supabase: {
      from: () => ({
        insert: () => Promise.resolve({ error: state.insertError }),
        select: () => builder(),
      }),
    },
  };
});

import { recordAttemptVoid, countAttemptVoids, fetchVoidCounts, VOID_LOCK_THRESHOLD } from "./attemptVoids";

describe("attemptVoids", () => {
  beforeEach(() => {
    state.insertError = null;
    state.count = 0;
    state.rows = [];
  });

  it("locks only on the second void", () => {
    expect(VOID_LOCK_THRESHOLD).toBe(2);
    expect(1 >= VOID_LOCK_THRESHOLD).toBe(false);
    expect(2 >= VOID_LOCK_THRESHOLD).toBe(true);
  });

  it("returns null without student or course", async () => {
    expect(await recordAttemptVoid({ studentId: "", courseId: "c", assessmentType: "diagnostic", reason: "blur" })).toBeNull();
    expect(await countAttemptVoids({ studentId: "s", courseId: "", assessmentType: "diagnostic" })).toBe(0);
  });

  it("records a void and returns the new count", async () => {
    state.count = 1;
    const n = await recordAttemptVoid({ studentId: "s", courseId: "c", assessmentType: "diagnostic", reason: "blur" });
    expect(n).toBe(1);
  });

  it("returns null when the insert fails", async () => {
    state.insertError = { message: "denied" };
    const n = await recordAttemptVoid({ studentId: "s", courseId: "c", assessmentType: "exam", refKey: "e1", reason: "fullscreen" });
    expect(n).toBeNull();
  });

  it("groups counts by ref_key, treating null as the empty key", async () => {
    state.rows = [{ ref_key: "1" }, { ref_key: "1" }, { ref_key: null }];
    const map = await fetchVoidCounts({ studentId: "s", courseId: "c", assessmentType: "weekly_quiz" });
    expect(map).toEqual({ "1": 2, "": 1 });
  });
});
