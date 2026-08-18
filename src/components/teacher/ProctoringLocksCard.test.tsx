import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ProctoringLocksCard from "./ProctoringLocksCard";

const voids: any[] = [];
const cleared = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/attemptVoids", async () => {
  const actual: any = await vi.importActual("@/lib/attemptVoids");
  return { ...actual, clearVoids: (...a: unknown[]) => cleared(...(a as [])) };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => {
  const table = (name: string) => {
    const result =
      name === "assessment_attempt_voids"
        ? { data: voids, error: null }
        : name === "profiles"
        ? {
            data: [
              { id: "s1", name: "Ada Lovelace", email: "ada@x.edu" },
              { id: "s2", name: "Alan Turing", email: "alan@x.edu" },
            ],
            error: null,
          }
        : name === "lesson_plan_weeks"
        ? { data: [{ week_number: 3, week_name: "Loops" }], error: null }
        : { data: [], error: null };
    const chain: Record<string, unknown> = {};
    const self: any = new Proxy(chain, {
      get(_t, prop: string) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
        return () => self;
      },
    });
    return { select: () => self };
  };
  return {
    supabase: {
      from: (n: string) => table(n),
      auth: { getUser: async () => ({ data: { user: { id: "t1" } } }) },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    },
  };
});

describe("ProctoringLocksCard", () => {
  beforeEach(() => {
    voids.length = 0;
    cleared.mockClear();
  });

  it("shows an empty state when nobody is locked", async () => {
    voids.push({
      id: "v1",
      student_id: "s1",
      assessment_type: "diagnostic",
      ref_key: null,
      reason: "left quiz",
      created_at: new Date().toISOString(),
      cleared_at: null,
    });
    render(<ProctoringLocksCard courseId="c1" />);
    await waitFor(() =>
      expect(screen.getByText(/No students are locked out/i)).toBeInTheDocument(),
    );
  });

  it("lists locked students and clears selected locks", async () => {
    const now = new Date().toISOString();
    voids.push(
      { id: "v1", student_id: "s1", assessment_type: "diagnostic", ref_key: null, reason: "left quiz", created_at: now, cleared_at: null },
      { id: "v2", student_id: "s1", assessment_type: "diagnostic", ref_key: null, reason: "left quiz", created_at: now, cleared_at: null },
      { id: "v3", student_id: "s1", assessment_type: "weekly_quiz", ref_key: "3", reason: "tab switch", created_at: now, cleared_at: null },
      { id: "v4", student_id: "s1", assessment_type: "weekly_quiz", ref_key: "3", reason: "tab switch", created_at: now, cleared_at: null },
      { id: "v5", student_id: "s2", assessment_type: "weekly_quiz", ref_key: "3", reason: "tab switch", created_at: now, cleared_at: null },
    );
    render(<ProctoringLocksCard courseId="c1" />);

    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
    // s2 has only one void -> not locked
    expect(screen.queryByText("Alan Turing")).not.toBeInTheDocument();
    expect(screen.getByText("Diagnostic")).toBeInTheDocument();
    expect(screen.getByText("Loops quiz")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText ? screen.getAllByRole("checkbox")[1] : screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: /Allow retake/i }));
    const confirm = await screen.findAllByRole("button", { name: /Allow retake/i });
    fireEvent.click(confirm[confirm.length - 1]);

    await waitFor(() =>
      expect(cleared).toHaveBeenCalledWith(
        expect.objectContaining({ courseId: "c1", studentIds: ["s1"], clearedBy: "t1" }),
      ),
    );
  });
});
