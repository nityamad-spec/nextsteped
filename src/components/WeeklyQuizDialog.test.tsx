import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import WeeklyQuizDialog from "./WeeklyQuizDialog";

// ---- Mocks -----------------------------------------------------------------

const insertMock = vi.fn();
const invokeMock = vi.fn();
let questionsRow: any[] = [];

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: (table: string) => {
        if (table === "assessment_questions") {
          // chain: .select().eq().eq().eq()  → returns { data, error }
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            then: (resolve: any) => resolve({ data: questionsRow, error: null }),
          };
          return chain;
        }
        if (table === "assessment_results") {
          return {
            insert: (payload: any) => {
              insertMock(payload);
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({ data: { id: "result-123" }, error: null }),
                }),
              };
            },
          };
        }
        return {};
      },
      functions: {
        invoke: (...args: any[]) => {
          invokeMock(...args);
          return Promise.resolve({ data: {}, error: null });
        },
      },
    },
  };
});

// AssessmentView calls fetch() for explain-answers — stub it.
const fetchMock = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ explanations: [] }),
  } as any)
);
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  insertMock.mockClear();
  invokeMock.mockClear();
  fetchMock.mockClear();
  questionsRow = [
    {
      id: "q1",
      question_text: "What is 2 + 2?",
      question_type: "MCQ",
      options: ["3", "4", "5"],
      answer: "4",
      topic: "ARITH",
      difficulty: "Easy",
      quiz_day: 1,
      mode: "daily_quiz",
      course_id: "course-1",
    },
  ];
});

// ---- Tests -----------------------------------------------------------------

describe("WeeklyQuizDialog", () => {
  it("does not render quiz content when closed", () => {
    render(
      <WeeklyQuizDialog
        open={false}
        onOpenChange={() => {}}
        courseId="course-1"
        studentId="student-1"
        day={1}
      />
    );
    expect(screen.queryByText(/Daily Quiz/i)).not.toBeInTheDocument();
  });

  it("loads questions and shows the intro screen when opened from the lesson plan", async () => {
    render(
      <WeeklyQuizDialog
        open={true}
        onOpenChange={() => {}}
        courseId="course-1"
        studentId="student-1"
        day={1}
        numQuestions={5}
        timeLimitMinutes={10}
      />
    );

    // Intro phase headline rendered by AssessmentView
    await waitFor(() => {
      expect(screen.getByText(/Daily Quiz — Day 1/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Start Quiz/i })).toBeInTheDocument();
  });

  it("records results and updates mastery on submit", async () => {
    const onOpenChange = vi.fn();

    render(
      <WeeklyQuizDialog
        open={true}
        onOpenChange={onOpenChange}
        courseId="course-1"
        studentId="student-1"
        day={2}
        numQuestions={5}
        timeLimitMinutes={10}
      />
    );

    // Wait for intro, then start
    const startBtn = await screen.findByRole("button", { name: /Start Quiz/i });
    fireEvent.click(startBtn);

    // Pick the correct option "4"
    const correctOpt = await screen.findByLabelText("4");
    fireEvent.click(correctOpt);

    // Submit
    const submitBtn = await screen.findByRole("button", { name: /Submit Quiz/i });
    fireEvent.click(submitBtn);

    // Insert into assessment_results
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const insertedRow = insertMock.mock.calls[0][0];
    expect(insertedRow).toMatchObject({
      student_id: "student-1",
      course_id: "course-1",
      mode: "daily_quiz",
      quiz_day: 2,
      total_questions: 1,
      correct_answers: 1,
      score: 100,
    });
    expect(insertedRow.answers).toHaveLength(1);
    expect(insertedRow.answers[0]).toMatchObject({
      question_id: "q1",
      topic: "ARITH",
      selected: "4",
      correct: "4",
      is_correct: true,
    });

    // update-mastery edge function invoked with per-concept tally
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    const [fnName, payload] = invokeMock.mock.calls[0];
    expect(fnName).toBe("update-mastery");
    expect(payload.body).toMatchObject({
      course_id: "course-1",
      source: "weekly_quiz",
      source_id: "result-123",
      per_concept: [{ concept_code: "ARITH", attempted: 1, correct: 1 }],
    });
  });
});
