import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const invoke = vi.fn();
const toast = vi.fn();
const countResult = { count: 1 };

vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    then: (res: any) => Promise.resolve(countResult).then(res),
  };
  return { supabase: { functions: { invoke: (...a: any[]) => invoke(...a) }, from: () => chain } };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/components/student/TerminalAssistantPanel", () => ({ default: () => null }));

import CodingTerminalWidget, { verdictLabel } from "./CodingTerminalWidget";

const baseSubmission = {
  exerciseId: "ex-1",
  courseId: "c-1",
  studentId: "s-1",
  testCases: [{ input: "3 4", expected_output: "7" } as any],
};

function setup(submission: any = baseSubmission) {
  const onSolved = vi.fn();
  render(
    <CodingTerminalWidget
      onClose={() => {}}
      initialCode={'print("hi")\n'}
      initialLanguage="python"
      exerciseTitle="Add two numbers"
      exerciseStatement="Read two ints and print the sum."
      submission={submission ? { ...submission, onSolved } : null}
    />,
  );
  return { onSolved };
}

beforeEach(() => {
  invoke.mockReset();
  toast.mockReset();
});

describe("verdictLabel", () => {
  it("never shows Accepted for a failed case", () => {
    expect(verdictLabel({ passed: true })).toBe("Passed");
    expect(verdictLabel({ passed: false, verdict: "no_output" })).toBe("No output");
    expect(verdictLabel({ passed: false, verdict: "passed" })).toBe("Failed");
    expect(verdictLabel({ passed: false })).toBe("Failed");
  });
});

describe("CodingTerminalWidget submission", () => {
  it("hides Submit when there is no graded submission", () => {
    setup(null);
    expect(screen.queryByRole("button", { name: /submit solution/i })).toBeNull();
  });

  it("pre-fills custom input and sends it with Run", async () => {
    invoke.mockResolvedValue({ data: { stdout: "7\n", status: "Accepted" }, error: null });
    setup();
    expect(screen.getByLabelText("Custom input")).toHaveValue("3 4");
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("run-code", {
        body: { language: "python", code: 'print("hi")\n', stdin: "3 4" },
      }),
    );
    expect(await screen.findByText(/7/)).toBeInTheDocument();
  });

  it("submits weekly code and reports a full pass", async () => {
    invoke.mockResolvedValue({
      data: {
        passed: true,
        results: [
          { kind: "standard", index: 1, passed: true, status: "Accepted" },
          { kind: "hidden", index: 1, passed: true, status: "Accepted" },
        ],
      },
      error: null,
    });
    const { onSolved } = setup();
    fireEvent.click(screen.getByRole("button", { name: /submit solution/i }));
    await waitFor(() => expect(onSolved).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("submit-coding-solution", {
      body: { bank: "weekly", exerciseId: "ex-1", language: "python", code: 'print("hi")\n' },
    });
    expect(screen.getByText(/2 of 2 passed/)).toBeInTheDocument();
    expect(screen.getByText("Solved")).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Solved!" }));
  });

  it("shows failure details and verdicts, never Accepted, for failed cases", async () => {
    invoke.mockResolvedValue({
      data: {
        passed: false,
        results: [
          { kind: "standard", index: 1, passed: false, status: "Accepted", expected: "7", actual: "8", verdict: "wrong_answer" },
          { kind: "hidden", index: 1, passed: false, status: "Accepted", verdict: "no_output" },
        ],
      },
      error: null,
    });
    const { onSolved } = setup();
    fireEvent.click(screen.getByRole("button", { name: /submit solution/i }));
    expect(await screen.findByText(/0 of 2 passed/)).toBeInTheDocument();
    expect(screen.getByText(/expected “7” · got “8”/)).toBeInTheDocument();
    expect(screen.getByText("Hidden case 1")).toBeInTheDocument();
    expect(screen.getByText("No output")).toBeInTheDocument();
    expect(screen.queryByText("Accepted")).toBeNull();
    expect(onSolved).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "0 of 2 test cases passed", variant: "destructive" }),
    );
  });

  it("uses the daily bank and nudges mastery on first pass", async () => {
    invoke.mockResolvedValue({ data: { passed: true, results: [] }, error: null });
    setup({ ...baseSubmission, bank: "daily", mastery: { conceptId: "k-1", bloomLevel: 2 } });
    fireEvent.click(screen.getByRole("button", { name: /submit solution/i }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update-mastery", expect.objectContaining({
        body: expect.objectContaining({ course_id: "c-1", source: "practice" }),
      })),
    );
    expect(invoke.mock.calls[0][1].body.bank).toBe("daily");
  });

  it("shows the server error message when submission fails", async () => {
    invoke.mockResolvedValue({ data: { error: "You are not enrolled in this course." }, error: null });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /submit solution/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Couldn't run your submission",
        description: "You are not enrolled in this course.",
      })),
    );
  });
});
