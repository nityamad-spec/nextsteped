// Runs a coding exercise's reference solution against its standard and hidden
// test cases through the `run-code` edge function (Judge0) and reports, per
// case, whether the produced stdout matches the expected output exactly.
//
// Results are transient: nothing is persisted, and the comparison is strict —
// any whitespace or newline difference is a failure.

import { supabase } from "@/integrations/supabase/client";
import type { ExerciseDraft } from "@/lib/codingExercises";

export type TestRunKind = "standard" | "hidden";

export interface TestRunCase {
  kind: TestRunKind;
  /** 1-based index within its own list. */
  index: number;
  input: string;
  expected: string;
}

export interface TestRunResult extends TestRunCase {
  passed: boolean;
  actual: string;
  /** Runtime error, compile error or service message, when present. */
  message: string;
  status: string;
}

export interface TestRunProgress {
  completed: number;
  total: number;
}

/** Thrown when the execution service itself is unusable (no per-case results). */
export class TestRunServiceError extends Error {}

/** Max simultaneous Judge0 submissions — keeps us inside quota. */
const CONCURRENCY = 2;

export function collectTestCases(draft: ExerciseDraft): TestRunCase[] {
  const standard = draft.standard_test_cases.map((t, i) => ({
    kind: "standard" as const,
    index: i + 1,
    input: t.input ?? "",
    expected: t.expected_output ?? "",
  }));
  const hidden = draft.hidden_test_cases.map((t, i) => ({
    kind: "hidden" as const,
    index: i + 1,
    input: t.input ?? "",
    expected: t.expected_output ?? "",
  }));
  return [...standard, ...hidden];
}

export function canRunTests(draft: ExerciseDraft): boolean {
  return (
    draft.reference_solution.trim().length > 0 && collectTestCases(draft).length > 0
  );
}

/** Human-readable reason the run button is unavailable, or null when runnable. */
export function testRunBlockedReason(draft: ExerciseDraft): string | null {
  if (!draft.reference_solution.trim()) return "Add a reference solution to run the test cases.";
  if (collectTestCases(draft).length === 0) return "Add at least one test case to run.";
  return null;
}

async function runOne(
  draft: ExerciseDraft,
  testCase: TestRunCase,
): Promise<TestRunResult> {
  const { data, error } = await supabase.functions.invoke("run-code", {
    body: {
      language: draft.language,
      code: draft.reference_solution,
      stdin: testCase.input,
    },
  });

  if (error) throw new TestRunServiceError(error.message || "Code execution failed.");
  if (!data) throw new TestRunServiceError("Code execution returned no result.");
  if ((data as any).error) throw new TestRunServiceError(String((data as any).error));

  const actual = String((data as any).stdout ?? "");
  const stderr = String((data as any).stderr ?? "");
  const compileOutput = String((data as any).compileOutput ?? "");
  const runtimeMessage = String((data as any).message ?? "");
  const statusId = (data as any).statusId;
  const status = String((data as any).status ?? "Finished");

  const message = compileOutput || stderr || runtimeMessage || "";
  const errored = (typeof statusId === "number" && statusId !== 3) || message.length > 0;
  const passed = !errored && actual === testCase.expected;

  return { ...testCase, passed, actual, message, status };
}

/**
 * Executes the reference solution against every test case.
 * Progress is reported after each completed case; results keep input order.
 */
export async function runReferenceAgainstTestCases(
  draft: ExerciseDraft,
  onProgress?: (p: TestRunProgress) => void,
): Promise<TestRunResult[]> {
  const cases = collectTestCases(draft);
  const total = cases.length;
  const results: TestRunResult[] = new Array(total);
  let completed = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < total) {
      const i = cursor++;
      results[i] = await runOne(draft, cases[i]);
      completed += 1;
      onProgress?.({ completed, total });
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()),
  );

  return results;
}

export function summariseTestRun(results: TestRunResult[]): {
  passed: number;
  total: number;
} {
  return { passed: results.filter((r) => r.passed).length, total: results.length };
}
