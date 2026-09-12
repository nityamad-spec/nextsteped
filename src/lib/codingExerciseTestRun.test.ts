import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import {
  canRunTests,
  collectTestCases,
  runReferenceAgainstTestCases,
  summariseTestRun,
  testRunBlockedReason,
  TestRunServiceError,
} from "@/lib/codingExerciseTestRun";
import type { ExerciseDraft } from "@/lib/codingExercises";

const draft = (over: Partial<ExerciseDraft> = {}): ExerciseDraft => ({
  title: "Sum",
  problem_statement: "Add two numbers",
  language: "python",
  input_spec: "two ints",
  output_spec: "sum",
  constraints: null,
  examples: [],
  starter_code: "",
  standard_test_cases: [{ input: "1 2", expected_output: "3" }],
  reference_solution: "print(sum(map(int, input().split())))",
  hidden_test_cases: [{ input: "10 20", expected_output: "30" }],
  ...over,
});

const ok = (stdout: string) => ({
  data: { status: "Accepted", statusId: 3, stdout, stderr: "", compileOutput: "", message: "" },
  error: null,
});

beforeEach(() => invoke.mockReset());

describe("collectTestCases / gating", () => {
  it("orders standard cases before hidden ones", () => {
    const cases = collectTestCases(draft());
    expect(cases.map((c) => c.kind)).toEqual(["standard", "hidden"]);
    expect(cases[0].index).toBe(1);
    expect(cases[1].index).toBe(1);
  });

  it("blocks when the reference solution is missing", () => {
    const d = draft({ reference_solution: "   " });
    expect(canRunTests(d)).toBe(false);
    expect(testRunBlockedReason(d)).toMatch(/reference solution/i);
  });

  it("blocks when there are no test cases", () => {
    const d = draft({ standard_test_cases: [], hidden_test_cases: [] });
    expect(canRunTests(d)).toBe(false);
    expect(testRunBlockedReason(d)).toMatch(/test case/i);
  });

  it("allows a runnable draft", () => {
    expect(canRunTests(draft())).toBe(true);
    expect(testRunBlockedReason(draft())).toBeNull();
  });
});

describe("runReferenceAgainstTestCases", () => {
  it("passes when stdout matches exactly", async () => {
    invoke.mockResolvedValueOnce(ok("3")).mockResolvedValueOnce(ok("30"));
    const results = await runReferenceAgainstTestCases(draft());
    expect(results.every((r) => r.passed)).toBe(true);
    expect(summariseTestRun(results)).toEqual({ passed: 2, total: 2 });
  });

  it("fails on any whitespace difference (exact match)", async () => {
    invoke.mockResolvedValueOnce(ok("3\n")).mockResolvedValueOnce(ok("30"));
    const results = await runReferenceAgainstTestCases(draft());
    expect(results[0].passed).toBe(false);
    expect(results[0].actual).toBe("3\n");
    expect(results[1].passed).toBe(true);
  });

  it("marks a runtime error as failed and keeps the message", async () => {
    invoke
      .mockResolvedValueOnce({
        data: {
          status: "Runtime Error (NZEC)",
          statusId: 11,
          stdout: "",
          stderr: "ZeroDivisionError",
          compileOutput: "",
          message: "",
        },
        error: null,
      })
      .mockResolvedValueOnce(ok("30"));
    const results = await runReferenceAgainstTestCases(draft());
    expect(results[0].passed).toBe(false);
    expect(results[0].message).toContain("ZeroDivisionError");
    expect(results[0].status).toBe("Runtime Error (NZEC)");
  });

  it("marks a compile error as failed", async () => {
    invoke.mockResolvedValue({
      data: {
        status: "Compilation Error",
        statusId: 6,
        stdout: "",
        stderr: "",
        compileOutput: "expected ';'",
        message: "",
      },
      error: null,
    });
    const results = await runReferenceAgainstTestCases(draft({ language: "cpp" }));
    expect(results.every((r) => !r.passed)).toBe(true);
    expect(results[0].message).toContain("expected ';'");
  });

  it("throws a service error when the function is unavailable", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    await expect(runReferenceAgainstTestCases(draft())).rejects.toBeInstanceOf(
      TestRunServiceError,
    );
  });

  it("throws a service error when the function returns an error payload", async () => {
    invoke.mockResolvedValue({
      data: { error: "Code execution is not configured yet." },
      error: null,
    });
    await expect(runReferenceAgainstTestCases(draft())).rejects.toThrow(/not configured/i);
  });

  it("reports monotonic progress up to the total", async () => {
    invoke.mockResolvedValue(ok("x"));
    const seen: number[] = [];
    const d = draft({
      standard_test_cases: [
        { input: "a", expected_output: "x" },
        { input: "b", expected_output: "x" },
        { input: "c", expected_output: "x" },
      ],
      hidden_test_cases: [{ input: "d", expected_output: "x" }],
    });
    const results = await runReferenceAgainstTestCases(d, (p) => {
      expect(p.total).toBe(4);
      seen.push(p.completed);
    });
    expect(results).toHaveLength(4);
    expect(seen).toEqual([1, 2, 3, 4]);
  });
});
