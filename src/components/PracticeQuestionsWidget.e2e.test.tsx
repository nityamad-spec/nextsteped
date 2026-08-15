/**
 * End-to-end check for practice-set timing persistence.
 *
 * Drives the real PracticeQuestionsWidget UI (generate → answer → check →
 * next → results), then feeds the emitted result through the same
 * `assessment_results` insert shape used by AIChat's `handlePracticeResult`.
 *
 * Asserts:
 *  1. every answer row persisted to `assessment_results.answers` carries a
 *     non-zero `time_ms`
 *  2. the persisted times reflect the wall-time the student actually spent
 *  3. pace actually moves the score: a slow run scores lower than a fast run
 *     with identical (all-correct) answers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, act } from "@testing-library/react";
import PracticeQuestionsWidget from "@/components/PracticeQuestionsWidget";

// ---- Supabase mock ---------------------------------------------------------

const invokeMock = vi.fn();
const insertRows: any[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    from: (table: string) => ({
      insert: (row: unknown) => {
        insertRows.push({ table, row });
        return {
          select: () => ({
            single: async () => ({ data: { id: "result-1" }, error: null }),
          }),
        };
      },
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

// ---- Fixtures --------------------------------------------------------------

const QUESTIONS = [
  {
    id: "q1",
    question: "What does len() return for a list?",
    type: "mcq" as const,
    options: ["Its length", "Its sum", "Its type", "Its id"],
    answer: "Its length",
    explanation: "len() returns the number of items.",
    topic: "Lists",
    difficulty_estimate: 0.5,
    bloom_level: 2,
  },
  {
    id: "q2",
    question: "Python lists are mutable.",
    type: "true_false" as const,
    answer: "True",
    explanation: "Lists can be modified in place.",
    topic: "Lists",
    difficulty_estimate: 0.5,
    bloom_level: 2,
  },
];

/** Mimics AIChat.handlePracticeResult — the real persistence path. */
async function persistPracticeResult(result: any) {
  const { supabase } = await import("@/integrations/supabase/client");
  await supabase
    .from("assessment_results")
    .insert({
      student_id: "student-1",
      course_id: "course-1",
      mode: "practice",
      score: result.score,
      total_questions: result.totalQuestions,
      correct_answers: result.correctAnswers,
      answers: result.answers,
      time_spent: result.timeSpent,
    })
    .select("id")
    .single();
}

/** Click + flush pending state updates/microtasks. */
async function click(el: Element) {
  await act(async () => {
    fireEvent.click(el);
  });
}

// ---- Controllable clock ----------------------------------------------------

let clock = 0;
const advance = (ms: number) => {
  clock += ms;
};

/**
 * Completes one full practice set, spending `msPerQuestion` of active time on
 * each question. Returns the row persisted to `assessment_results`.
 */
async function runPracticeSet(msPerQuestion: number) {
  render(
    <PracticeQuestionsWidget
      onClose={() => {}}
      onSaveResult={persistPracticeResult}
      enrolledCourseId="course-1"
      studentId="student-1"
    />,
  );

  const promptBox = screen.getByPlaceholderText(/e\.g\./i);
  fireEvent.change(promptBox, { target: { value: "loops" } });
  await click(screen.getByRole("button", { name: /generate practice questions/i }));

  for (const q of QUESTIONS) {
    await screen.findByText(q.question);

    // Time on task accrues before the student answers.
    advance(msPerQuestion);

    if (q.type === "mcq") {
      await click(screen.getByText(q.answer));
    } else {
      await click(screen.getByRole("button", { name: /^True$/ }));
    }

    await click(await screen.findByRole("button", { name: /check answer/i }));
    await click(
      await screen.findByRole("button", { name: /next question|view results/i }),
    );
  }

  await screen.findByText(/practice complete/i);
  await waitFor(() => expect(insertRows.length).toBeGreaterThan(0));
  return insertRows[insertRows.length - 1];
}

// ---- Tests -----------------------------------------------------------------

describe("practice set → assessment_results timing (e2e)", () => {
  let perfSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clock = 0;
    insertRows.length = 0;
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (fn: string) => {
      if (fn === "generate-practice-questions") {
        return { data: { questions: QUESTIONS }, error: null };
      }
      return { data: null, error: null };
    });
    perfSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);
  });

  afterEach(() => {
    perfSpy.mockRestore();
    cleanup();
  });

  it("persists a non-zero time_ms for every answered question", async () => {
    const { table, row } = await runPracticeSet(12_000);

    expect(table).toBe("assessment_results");
    expect(row.mode).toBe("practice");
    expect(row.answers).toHaveLength(QUESTIONS.length);

    for (const answer of row.answers) {
      expect(answer.time_ms, `time_ms for ${answer.question_id}`).toBeGreaterThan(0);
      // Active-time clock should track the simulated dwell, not wall clock.
      expect(answer.time_ms).toBeGreaterThanOrEqual(12_000);
      expect(answer.is_correct).toBe(true);
    }
  });

  it("scores a slow run lower than a fast run with identical answers", async () => {
    const fast = await runPracticeSet(5_000);
    cleanup();
    insertRows.length = 0;
    clock = 0;

    const slow = await runPracticeSet(600_000);

    expect(fast.row.correct_answers).toBe(slow.row.correct_answers);
    expect(slow.row.score).toBeLessThan(fast.row.score);
    expect(fast.row.score).toBeGreaterThan(0);
  });
});
